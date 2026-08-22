// ChitLan — Public Chat.
//
// Message cap strategy: a counter doc at meta/publicChatStats tracks how
// many messages exist. Every send increments it; if it crosses 1000, the
// client deletes the single oldest message and decrements the counter.
// This is a client-side approximation (a Cloud Function trigger would be
// more airtight against race conditions) but is more than good enough for
// a community chat's storage housekeeping, and needs no paid Firebase plan.

import { db } from './firebase-config.js';
import {
  collection, addDoc, doc, query, orderBy, limit, startAfter, onSnapshot,
  serverTimestamp, deleteDoc, getDocs, updateDoc, increment, getDoc, setDoc, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const MESSAGES_COL = 'publicMessages';
const STATS_DOC = doc(db, 'meta', 'publicChatStats');
const MAX_MESSAGES = 1000;

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
      const changes = snap.docChanges()
        .filter((c) => c.type === 'added') // see note in page-chat.js on why 'removed' is intentionally ignored here
        .map((c) => ({ message: { id: c.doc.id, ...c.doc.data() } }));
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

export async function sendPublicMessage({ text, uid, name, photoURL }) {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;

  await addDoc(collection(db, MESSAGES_COL), {
    text: trimmed,
    senderId: uid,
    senderName: name,
    senderPhoto: photoURL || '',
    createdAt: serverTimestamp(),
  });

  updateDoc(doc(db, 'users', uid), { messageCount: increment(1) }).catch(() => {});

  await bumpCountAndPruneIfNeeded();
}

async function bumpCountAndPruneIfNeeded() {
  const snap = await getDoc(STATS_DOC);
  const current = snap.exists() ? (snap.data().count || 0) : 0;
  const next = current + 1;

  if (snap.exists()) {
    await updateDoc(STATS_DOC, { count: increment(1) });
  } else {
    await setDoc(STATS_DOC, { count: next });
  }

  if (next > MAX_MESSAGES) {
    const oldestQ = query(collection(db, MESSAGES_COL), orderBy('createdAt', 'asc'), limit(1));
    const oldestSnap = await getDocs(oldestQ);
    if (!oldestSnap.empty) {
      await deleteDoc(oldestSnap.docs[0].ref);
      await updateDoc(STATS_DOC, { count: increment(-1) });
    }
  }
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
