// ChitLan — Private Messages (1:1 direct messages), auto-deleting after
// PM_INACTIVITY_HOURS of inactivity.
//
// Storage shape: unlike Public Chat / RandomChat (one Firestore doc per
// message), a whole conversation — both participants plus every message —
// lives in a SINGLE doc at privateMessages/{conversationId}. That's a
// deliberate choice tied to how the auto-delete works:
//
//   expiresAt is bumped to (now + PM_INACTIVITY_HOURS) every time either
//   person SENDS a message — so it tracks "time since the last message",
//   not "time since the conversation started". Native Firestore TTL
//   (configured once in the Firebase console — see README.md) then deletes
//   the doc automatically once nobody's said anything for 24h, even if
//   neither participant ever opens the app again.
//
//   Firestore TTL only deletes the exact document it's set on — it does
//   NOT cascade into subcollections. If messages were stored as a
//   subcollection (the way RandomChat's rooms/messages are), the parent
//   doc could expire while the messages underneath it silently stuck
//   around forever — still costing storage, still technically readable.
//   Keeping every message as an array field on the one doc means a single
//   TTL deletion genuinely erases the whole conversation, text included,
//   which matters a lot more here than in RandomChat, since this is
//   explicitly a private/ephemeral feature rather than just a storage
//   optimization.
//
// (A conversation can never span more than 24h of inactivity, so its
// message array is naturally self-limiting — comfortably inside
// Firestore's 1MB per-document limit for any realistic amount of chatting
// in a day.)

import { db } from './firebase-config.js';
import {
  doc, getDoc, onSnapshot, updateDoc, deleteDoc, runTransaction,
  collection, query, where, orderBy, serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const PM_INACTIVITY_HOURS = 24;
const MAX_MESSAGE_LENGTH = 500;
const COL = 'privateMessages';

// Deterministic id for the 1:1 conversation between two people — sorted so
// it comes out the same no matter who starts it, which is what lets
// "Message privately" reopen an existing conversation instead of starting
// a duplicate one.
export function conversationId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

function newExpiry() {
  return Timestamp.fromMillis(Date.now() + PM_INACTIVITY_HOURS * 60 * 60 * 1000);
}

// Sends a message, creating the conversation doc on the very first one.
// Wrapped in a transaction so two people sending at almost the same
// instant — including both starting the conversation at once — can't
// clobber each other's message.
export async function sendPrivateMessage({ myUid, myInfo, otherUid, otherInfo, text }) {
  const trimmed = (text || '').trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed || myUid === otherUid) return;

  const convId = conversationId(myUid, otherUid);
  const ref = doc(db, COL, convId);
  // NOTE: serverTimestamp() resolves to null when used inside an array
  // element — a known Firestore limitation — so each message's own
  // createdAt has to be a client-generated Timestamp instead. That's fine
  // here since it's only ever used for display ordering/formatting, never
  // for a security-sensitive check. `expiresAt` (which IS trusted for
  // deletion) lives outside the array for exactly this reason.
  const message = { senderId: myUid, text: trimmed, createdAt: Timestamp.now() };
  const expiresAt = newExpiry();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, {
        participants: [myUid, otherUid].sort(),
        participantInfo: { [myUid]: myInfo, [otherUid]: otherInfo },
        messages: [message],
        lastSeenBy: { [myUid]: serverTimestamp() },
        expiresAt,
        createdAt: serverTimestamp(),
      });
    } else {
      const data = snap.data();
      tx.update(ref, {
        messages: [...(data.messages || []), message],
        expiresAt,
        [`lastSeenBy.${myUid}`]: serverTimestamp(),
      });
    }
  });
}

// Live updates for one conversation thread. Fires with `null` if the
// conversation doesn't exist yet (nobody's sent the first message) or has
// already expired/been deleted.
export function watchConversation(convId, onUpdate) {
  return onSnapshot(doc(db, COL, convId), (snap) => {
    onUpdate(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

// Live updates for the inbox — every conversation I'm a participant in,
// most recently active first. (Sorting by expiresAt doubles as sorting by
// last-activity, since expiresAt IS last-activity + 24h.)
//
// Needs a composite index (participants Arrays + expiresAt Descending) —
// see README.md. Firestore will also print a direct link to create it the
// first time this query runs without one.
export function listMyConversations(uid, onUpdate) {
  const q = query(
    collection(db, COL),
    where('participants', 'array-contains', uid),
    orderBy('expiresAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// Marks everything in a conversation as read by me. Deliberately doesn't
// touch `messages` or `expiresAt` — being SEEN isn't activity that resets
// the 24h inactivity clock, only actually sending a message is.
export async function markConversationSeen(convId, uid) {
  await updateDoc(doc(db, COL, convId), { [`lastSeenBy.${uid}`]: serverTimestamp() }).catch(() => {});
}

// Lets either participant delete the conversation early, for both people,
// rather than waiting out the 24h window.
export async function deletePrivateConversation(convId) {
  await deleteDoc(doc(db, COL, convId));
}

// True if `conversation` has a message `uid` hasn't seen yet.
export function hasUnread(conversation, uid) {
  const messages = conversation.messages || [];
  if (!messages.length) return false;
  const last = messages[messages.length - 1];
  if (last.senderId === uid) return false; // my own message — nothing to "read"
  const lastSeenMs = conversation.lastSeenBy?.[uid]?.toMillis ? conversation.lastSeenBy[uid].toMillis() : 0;
  const lastMsgMs = last.createdAt?.toMillis ? last.createdAt.toMillis() : 0;
  return lastMsgMs > lastSeenMs;
}

// Tab-badge wiring for pages other than Messages itself (mirrors how
// watchUnreadPublicChat is wired into Home/Random/Profile, but not Chat
// itself — see unread.js). A person only ever has a handful of active
// private conversations at once — unlike Public Chat's message volume —
// so re-running this per-page query directly, with no separate cheap
// aggregate-count layer, is cheap enough as-is.
export function watchUnreadPrivateCount(uid, onUpdate) {
  return listMyConversations(uid, (conversations) => {
    onUpdate(conversations.filter((c) => hasUnread(c, uid)).length);
  });
}

// Fallback lookup for when a page doesn't already have someone's display
// info handy (see page-dm.js) — also used to check whether they've
// blocked me before letting a new conversation start.
export async function getUserProfileSummary(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return { username: 'ChitLaner', photoURL: '', blockedUsers: [] };
  const data = snap.data();
  return { username: data.username || 'ChitLaner', photoURL: data.photoURL || '', blockedUsers: data.blockedUsers || [] };
}
