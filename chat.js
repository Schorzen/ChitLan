// ChitLan — Public Chat.
//
// Message cap strategy: a counter doc at meta/publicChatStats tracks how
// many messages exist, AND the id of every message as it's sent (free —
// addDoc already returns the new id, no extra read). Once the count
// crosses 1000, the client batch-deletes the oldest 500 straight from that
// tracked list of ids — no query needed to find them, since we already
// know exactly which ones they are. (An earlier version queried Firestore
// for "the oldest message" on every single send once at the cap — that
// cost 1 read per message deleted; this brings it to zero, since Firestore
// bills per document read regardless of whether you look them up one at a
// time or all at once — batching alone doesn't save reads, only skipping
// the lookup entirely does.)
// This is a client-side approximation (a Cloud Function trigger would be
// more airtight against race conditions) but is more than good enough for
// a community chat's storage housekeeping, and needs no paid Firebase plan.

import { db } from './firebase-config.js';
import {
  collection, addDoc, doc, query, orderBy, limit, startAfter, onSnapshot,
  serverTimestamp, getDocs, updateDoc, increment, getDoc, setDoc,
  arrayUnion, arrayRemove, deleteField, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const MESSAGES_COL = 'publicMessages';
const STATS_DOC = doc(db, 'meta', 'publicChatStats');
const MAX_MESSAGES = 1000;
const PRUNE_BATCH_SIZE = 500; // Firestore batches cap at 500 operations, so this is also the ceiling

// How many messages the realtime listener actively tracks. Kept small on
// purpose: every new message (or the pruning delete once the 1000-cap is
// hit) re-evaluates the whole listener, so a big window means that cost
// grows forever as the chat gets more active. Older history beyond this is
// loaded separately via loadOlderMessages() — a one-time fetch, not a live
// subscription — so scrolling back through history doesn't add any
// ongoing realtime cost.
const LIVE_WINDOW = 40;
const PAGE_SIZE = 30;

// Fires once with `{ type: 'initial', messages, oldestDoc, hasMore }` on
// first load, then with `{ type: 'delta', changes }` for every change after
// that — `changes` is Firestore's own added/modified/removed diff, so the
// UI can append a single new bubble instead of re-rendering everything.
export function listenToPublicChat(onUpdate) {
  const q = query(collection(db, MESSAGES_COL), orderBy('createdAt', 'desc'), limit(LIVE_WINDOW));
  let isFirst = true;
  return onSnapshot(q, (snap) => {
    if (isFirst) {
      isFirst = false;
      const docs = snap.docs;
      const messages = docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
      const oldestDoc = docs.length ? docs[docs.length - 1] : null;
      onUpdate({ type: 'initial', messages, oldestDoc, hasMore: docs.length === LIVE_WINDOW });
    } else {
      // 'modified' is now included because reactions update an existing
      // message document — 'removed' is still intentionally excluded, since
      // that only means a message aged out of the live-window tracking, not
      // that it was actually deleted (see note in page-chat.js).
      const changes = snap.docChanges()
        .filter((c) => c.type === 'added' || c.type === 'modified')
        .map((c) => ({ changeType: c.type, message: { id: c.doc.id, ...c.doc.data() } }));
      if (changes.length) onUpdate({ type: 'delta', changes });
    }
  });
}

// One-time (non-realtime) fetch of the next PAGE_SIZE older messages, for
// "scroll up to load more history".
export async function loadOlderMessages(afterDoc) {
  if (!afterDoc) return { messages: [], oldestDoc: null, hasMore: false };
  const q = query(
    collection(db, MESSAGES_COL),
    orderBy('createdAt', 'desc'),
    startAfter(afterDoc),
    limit(PAGE_SIZE)
  );
  const snap = await getDocs(q);
  const docs = snap.docs;
  const messages = docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
  const oldestDoc = docs.length ? docs[docs.length - 1] : afterDoc;
  return { messages, oldestDoc, hasMore: docs.length === PAGE_SIZE };
}

// One reaction per person per message, stored as { [uid]: emoji }. Tapping
// the same emoji you already picked removes it (un-react); tapping a
// different one swaps it. This shape — one field write, keyed by your own
// uid — is what makes it possible for the security rules to allow reacting
// to *anyone's* message while still only ever letting you touch your own
// entry.
export async function setMessageReaction(messageId, emoji, uid, currentReactions = {}) {
  const alreadyThisEmoji = currentReactions[uid] === emoji;
  const value = alreadyThisEmoji ? deleteField() : emoji;
  await updateDoc(doc(db, MESSAGES_COL, messageId), { [`reactions.${uid}`]: value });
}

export async function sendPublicMessage({ text, uid, name, photoURL, replyTo, isLocal }) {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;

  const payload = {
    text: trimmed,
    senderId: uid,
    senderName: name,
    senderPhoto: photoURL || '',
    senderIsLocal: !!isLocal,
    createdAt: serverTimestamp(),
  };
  if (replyTo) {
    payload.replyTo = {
      messageId: replyTo.messageId,
      senderName: replyTo.senderName,
      text: (replyTo.text || '').slice(0, 80),
    };
  }

  const newDocRef = await addDoc(collection(db, MESSAGES_COL), payload);

  updateDoc(doc(db, 'users', uid), { messageCount: increment(1) }).catch(() => {});

  await bumpCountAndPruneIfNeeded(newDocRef.id);
}

// Tracks message ids as they're sent (in meta/publicChatStats.oldestIds) so
// that once the 1000-cap is hit, pruning can delete straight from that
// known list — zero reads to find them, versus the old approach's 1 read
// per message deleted. See the file header for the full reasoning.
async function bumpCountAndPruneIfNeeded(newMessageId) {
  const snap = await getDoc(STATS_DOC);
  const data = snap.exists() ? snap.data() : {};
  const newCount = (data.count || 0) + 1;
  const trackedIds = [...(data.oldestIds || []), newMessageId];

  if (newCount <= MAX_MESSAGES) {
    await setDoc(STATS_DOC, { count: newCount, oldestIds: trackedIds }, { merge: true });
    return;
  }

  // Crossed the cap — prune the oldest PRUNE_BATCH_SIZE messages, straight
  // from the tracked ids.
  const idsToDelete = trackedIds.slice(0, PRUNE_BATCH_SIZE);
  const remainingTracked = trackedIds.slice(PRUNE_BATCH_SIZE);

  // One-time-ish fallback for messages that existed before id-tracking
  // started (or if tracking ever falls behind for any reason): top up
  // with a query for however many more are needed. This costs reads only
  // for the shortfall, and only until tracking naturally catches up.
  const shortfall = PRUNE_BATCH_SIZE - idsToDelete.length;
  if (shortfall > 0) {
    const oldestQ = query(collection(db, MESSAGES_COL), orderBy('createdAt', 'asc'), limit(shortfall));
    const oldestSnap = await getDocs(oldestQ);
    oldestSnap.docs.forEach((d) => {
      if (!idsToDelete.includes(d.id)) idsToDelete.push(d.id);
    });
  }

  const batch = writeBatch(db);
  idsToDelete.forEach((id) => batch.delete(doc(db, MESSAGES_COL, id)));
  await batch.commit();

  await setDoc(STATS_DOC, { count: newCount - idsToDelete.length, oldestIds: remainingTracked }, { merge: true });
}

export async function reportMessage({ message, reportedBy, reason }) {
  await addDoc(collection(db, 'reports'), {
    type: 'message',
    messageId: message.id,
    messageText: message.text,
    reportedUser: message.senderId,
    reportedBy,
    reason: reason || 'unspecified',
    createdAt: serverTimestamp(),
    status: 'open',
  });
}

export async function blockUserId(currentUid, targetUid) {
  await updateDoc(doc(db, 'users', currentUid), { blockedUsers: arrayUnion(targetUid) });
}

export async function unblockUserId(currentUid, targetUid) {
  await updateDoc(doc(db, 'users', currentUid), { blockedUsers: arrayRemove(targetUid) });
}

// blockedUsers only stores uids — this fetches display info (username,
// photo) for each one, for showing a real "who have I blocked" list.
export async function getBlockedUsersDetails(uids) {
  if (!uids || !uids.length) return [];
  const results = await Promise.all(uids.map(async (uid) => {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? { id: uid, ...snap.data() } : { id: uid, username: 'Unknown user', photoURL: '' };
  }));
  return results;
}
