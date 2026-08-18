// ChitLan — in-app notifications, stored at users/{uid}/notifications/{id}.

import { db } from './firebase-config.js';
import {
  collection, addDoc, doc, updateDoc, writeBatch,
  query, orderBy, limit, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function pushNotification(uid, { title, body }) {
  await addDoc(collection(db, 'users', uid, 'notifications'), {
    title, body, read: false, createdAt: serverTimestamp(),
  });
}

export function listenToNotifications(uid, onUpdate) {
  const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(20));
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function markAllRead(uid, notifications) {
  const unread = notifications.filter((n) => !n.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(db, 'users', uid, 'notifications', n.id), { read: true }));
  await batch.commit();
}
