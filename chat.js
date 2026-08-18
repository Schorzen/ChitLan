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
  collection, addDoc, doc, query, orderBy, limit, onSnapshot,
  serverTimestamp, deleteDoc, getDocs, updateDoc, increment, getDoc, setDoc, arrayUnion,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const MESSAGES_COL = 'publicMessages';
const STATS_DOC = doc(db, 'meta', 'publicChatStats');
const MAX_MESSAGES = 1000;
const VISIBLE_MESSAGES = 200; // how many we render live; older ones still exist until pruned

export function listenToPublicChat(onUpdate) {
  const q = query(collection(db, MESSAGES_COL), orderBy('createdAt', 'desc'), limit(VISIBLE_MESSAGES));
  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
    onUpdate(messages);
  });
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
