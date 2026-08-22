// ChitLan — in-app notifications, stored at users/{uid}/notifications/{id}.
//
// Retention: every notification is stamped with an `expiresAt` 48 hours out.
// Two layers handle cleanup so nothing accumulates forever in the database:
//   1. Native Firestore TTL (configured once in the Firebase console — see
//      README) automatically deletes expired docs in the background, even
//      for users who never open the app again.
//   2. listenToNotifications() also opportunistically deletes anything
//      already expired the moment an active user views their list, so it
//      feels instant for them rather than waiting on TTL's own delay.

import { db } from './firebase-config.js';
import {
  collection, addDoc, doc, updateDoc, writeBatch,
  query, orderBy, limit, onSnapshot, serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const NOTIFICATION_TTL_HOURS = 48;

export async function pushNotification(uid, { title, body }) {
  const expiresAt = Timestamp.fromMillis(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);
  await addDoc(collection(db, 'users', uid, 'notifications'), {
    title, body, read: false, createdAt: serverTimestamp(), expiresAt,
  });
}

export function listenToNotifications(uid, onUpdate) {
  const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(20));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const items = [];
    const expiredRefs = [];

    snap.docs.forEach((d) => {
      const data = d.data();
      const expiresAtMs = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : null;
      if (expiresAtMs && expiresAtMs <= now) {
        expiredRefs.push(d.ref);
      } else {
        items.push({ id: d.id, ...data });
      }
    });

    onUpdate(items);

    if (expiredRefs.length) {
      const batch = writeBatch(db);
      expiredRefs.forEach((ref) => batch.delete(ref));
      batch.commit().catch(() => {});
    }
  });
}

export async function markAllRead(uid, notifications) {
  const unread = notifications.filter((n) => !n.read);
  if (!unread.length) return;
  const batch = writeBatch(db);
  unread.forEach((n) => batch.update(doc(db, 'users', uid, 'notifications', n.id), { read: true }));
  await batch.commit();
}
