// ChitLan — lightweight presence, built on plain Firestore (no Realtime DB,
// no Cloud Functions needed). A user counts as "online" if their lastActive
// timestamp is within the last 60 seconds; the client refreshes that
// timestamp every 25 seconds while the tab is open.
//
// Trade-off: closing the tab doesn't instantly flip someone offline (there's
// no onDisconnect() without Realtime DB) — but within ~60s they'll drop out
// of the online count on their own. Good enough for a community counter.

import { db } from './firebase-config.js';
import {
  doc, updateDoc, serverTimestamp, collection, query, where, getCountFromServer, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const HEARTBEAT_MS = 25000;
const ONLINE_WINDOW_MS = 60000;

let heartbeatTimer = null;

export function startPresenceHeartbeat(uid) {
  const beat = () => updateDoc(doc(db, 'users', uid), { lastActive: serverTimestamp() }).catch(() => {});
  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_MS);
  return () => clearInterval(heartbeatTimer);
}

export function stopPresenceHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
}

export async function getOnlineCount() {
  const cutoff = Timestamp.fromMillis(Date.now() - ONLINE_WINDOW_MS);
  const q = query(collection(db, 'users'), where('lastActive', '>=', cutoff));
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch (e) {
    return 0;
  }
}
