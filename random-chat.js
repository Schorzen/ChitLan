// ChitLan — RandomChat.
//
// Queue-based matchmaking with no Cloud Functions required:
// 1. Joining adds a `waiting` doc to randomQueue/{uid}.
// 2. attemptMatch() looks for another waiting user and claims them inside a
//    Firestore transaction, so two people racing for the same candidate
//    can't both succeed.
// 3. If nobody's available yet, listenForMatch() watches my own queue doc —
//    the moment someone else claims me, its status flips to 'matched'.
// 4. Rooms are intentionally ephemeral: ChitLan has "No Private Chat" as a
//    product decision, so ending a RandomChat deletes the room and its
//    messages rather than keeping a saved DM history.

import { db } from './firebase-config.js';
import {
  collection, doc, addDoc, setDoc, deleteDoc, updateDoc, onSnapshot,
  query, where, orderBy, limit, getDocs, serverTimestamp, runTransaction, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const QUEUE_COL = 'randomQueue';
const ROOMS_COL = 'randomRooms';

// Anyone who's been sitting in the queue longer than this without being
// claimed is treated as likely gone (closed the tab, lost connection,
// etc.) and skipped as a match candidate — this doesn't clean up their
// stale doc, but it does stop other people from getting paired with a
// ghost who's no longer actually there.
const STALE_QUEUE_MS = 3 * 60 * 1000;

export async function joinRandomQueue({ uid, username, photoURL, category }) {
  await setDoc(doc(db, QUEUE_COL, uid), {
    uid, username, photoURL: photoURL || '', category: category || null,
    status: 'waiting', joinedAt: serverTimestamp(),
  });
}

export async function cancelRandomQueue(uid) {
  await deleteDoc(doc(db, QUEUE_COL, uid)).catch(() => {});
}

// Watches my own queue doc so I find out the moment someone else claims me.
export function listenForMatch(uid, onMatched) {
  return onSnapshot(doc(db, QUEUE_COL, uid), (snap) => {
    const data = snap.data();
    if (data && data.status === 'matched' && data.roomId) onMatched(data.roomId);
  });
}

// Tries to claim one waiting candidate for `me`. Returns a roomId, or null
// if nobody suitable was available (caller should then fall back to
// waiting). Same-category candidates are always preferred when any exist;
// `allowAnyCategory` controls what happens when none do — the caller
// (page-random.js) only passes true after a short grace period, so a
// search tries for a relevant match first but never gets stuck forever
// waiting on a category that's thin on a given day.
//
// Note: this deliberately does NOT use orderBy('joinedAt') in the Firestore
// query. Combining a where() equality filter with orderBy() on a different
// field requires a composite index that Firestore won't auto-create — that
// missing index was the actual bug behind "RandomChat isn't working": the
// query threw every time, silently, and matching never succeeded. Sorting
// the small (limit 20) result set client-side avoids needing any manual
// index setup.
export async function attemptMatch(me, blockedUsers = [], { allowAnyCategory = false } = {}) {
  const q = query(
    collection(db, QUEUE_COL),
    where('status', '==', 'waiting'),
    limit(20)
  );
  const snap = await getDocs(q);
  const now = Date.now();
  const candidates = snap.docs
    .map((d) => d.data())
    .filter((c) => c.uid !== me.uid && !blockedUsers.includes(c.uid))
    .filter((c) => (now - (c.joinedAt?.toMillis?.() || 0)) < STALE_QUEUE_MS)
    .sort((a, b) => (a.joinedAt?.toMillis?.() || 0) - (b.joinedAt?.toMillis?.() || 0));

  const sameCategory = me.category ? candidates.filter((c) => c.category === me.category) : [];
  const pool = sameCategory.length ? sameCategory : (allowAnyCategory ? candidates : []);

  for (const candidate of pool) {
    const roomId = await tryClaim(me, candidate);
    if (roomId) return roomId;
  }
  return null;
}

async function tryClaim(me, candidate) {
  const candidateRef = doc(db, QUEUE_COL, candidate.uid);
  const roomRef = doc(collection(db, ROOMS_COL));

  try {
    await runTransaction(db, async (tx) => {
      const freshSnap = await tx.get(candidateRef);
      if (!freshSnap.exists() || freshSnap.data().status !== 'waiting') {
        throw new Error('already-claimed');
      }
      tx.set(roomRef, {
        userA: me.uid, userAName: me.username, userAPhoto: me.photoURL || '',
        userB: candidate.uid, userBName: candidate.username, userBPhoto: candidate.photoURL || '',
        active: true, createdAt: serverTimestamp(), endedAt: null,
      });
      tx.update(candidateRef, { status: 'matched', roomId: roomRef.id });
    });
    await deleteDoc(doc(db, QUEUE_COL, me.uid)).catch(() => {});
    return roomRef.id;
  } catch (e) {
    return null; // someone else claimed this candidate first — caller tries the next one
  }
}

export function listenToRoom(roomId, onUpdate) {
  return onSnapshot(doc(db, ROOMS_COL, roomId), (snap) => {
    if (snap.exists()) onUpdate(snap.data());
    else onUpdate(null); // room was ended/deleted by the other person
  });
}

export function listenToRoomMessages(roomId, onUpdate) {
  const q = query(collection(db, ROOMS_COL, roomId, 'messages'), orderBy('createdAt', 'asc'), limit(300));
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function sendRoomMessage(roomId, { text, uid, name }) {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;
  await addDoc(collection(db, ROOMS_COL, roomId, 'messages'), {
    text: trimmed, senderId: uid, senderName: name, createdAt: serverTimestamp(),
  });
}

// Ends the ephemeral room: deletes its messages + the room doc, since
// ChitLan intentionally keeps no persistent private-chat history.
export async function endRoomChat(roomId) {
  const roomRef = doc(db, ROOMS_COL, roomId);
  try {
    const msgsSnap = await getDocs(collection(db, ROOMS_COL, roomId, 'messages'));
    const batch = writeBatch(db);
    msgsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(roomRef);
    await batch.commit();
  } catch (e) {
    await updateDoc(roomRef, { active: false, endedAt: serverTimestamp() }).catch(() => {});
  }
}

export async function reportRoomPartner({ roomId, partnerUid, reportedBy, reason }) {
  await addDoc(collection(db, 'reports'), {
    type: 'randomchat',
    roomId, reportedUser: partnerUid, reportedBy,
    reason: reason || 'unspecified',
    createdAt: serverTimestamp(),
    status: 'open',
  });
}

// Persists which room a user is currently in, on their own profile — this
// is what makes a refresh (or fully closing and reopening the browser)
// resume the same conversation instead of losing it. Set the moment either
// side enters a room; cleared the moment it ends.
export async function markActiveRoom(uid, roomId) {
  await updateDoc(doc(db, 'users', uid), { activeRoomId: roomId }).catch(() => {});
}

export async function clearActiveRoom(uid) {
  await updateDoc(doc(db, 'users', uid), { activeRoomId: null }).catch(() => {});
}
