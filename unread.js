// ChitLan — unread Public Chat message tracking.
//
// Cost-conscious by design: getting a fully live, exact unread count on
// every page by re-querying on every incoming message would mean every
// person on Home/Profile/etc. triggering a Firestore read each time
// *anyone* sends a public message — that fans out fast at real scale.
//
// Instead: one accurate aggregate-count read when a page loads (the
// baseline), then live updates afterward come from watching
// meta/publicChatStats (a single cheap document already updated on every
// send/prune) and doing plain arithmetic on the count delta — no further
// reads per message.

import { db } from './firebase-config.js';
import {
  doc, updateDoc, onSnapshot, collection, query, where, getCountFromServer, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function markPublicChatSeen(uid) {
  await updateDoc(doc(db, 'users', uid), { lastSeenPublicChatAt: serverTimestamp() }).catch(() => {});
}

// Calls onUpdate(count) once with an accurate baseline, then again
// whenever the live count meaningfully changes. Returns an unsubscribe
// function.
export function watchUnreadPublicChat(profile, onUpdate) {
  const statsRef = doc(db, 'meta', 'publicChatStats');
  let initialized = false;
  let lastKnownCount = null;
  let unreadCount = 0;

  return onSnapshot(statsRef, async (snap) => {
    const currentCount = snap.exists() ? (snap.data().count || 0) : 0;

    if (!initialized) {
      initialized = true;
      lastKnownCount = currentCount;
      try {
        const lastSeenAt = profile.lastSeenPublicChatAt || null;
        const q = lastSeenAt
          ? query(collection(db, 'publicMessages'), where('createdAt', '>', lastSeenAt))
          : collection(db, 'publicMessages'); // never opened Chat before — everything counts
        const countSnap = await getCountFromServer(q);
        unreadCount = countSnap.data().count;
      } catch (e) {
        unreadCount = 0;
      }
      onUpdate(unreadCount);
      return;
    }

    // Subsequent changes: a rising count means new messages arrived —
    // adjust by exactly that many, no extra read needed. A falling count
    // means the 1000-message cap pruned something off the old end, which
    // doesn't affect what's unread, so it's ignored.
    if (currentCount > lastKnownCount) {
      unreadCount += (currentCount - lastKnownCount);
      onUpdate(unreadCount);
    }
    lastKnownCount = currentCount;
  });
}
