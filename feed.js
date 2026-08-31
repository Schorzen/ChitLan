// ChitLan — Community Feed.
//
// Posts (Questions or Chismis) that live for 24 hours, then get cleaned up.
// Unlike Public Chat (capped at a message count), this collection is
// time-based: every post carries an `expiresAt` 24 hours out.
//
// Cleanup is client-side and opportunistic, same pattern as notifications —
// but because the feed is a SHARED resource (everyone sees the same posts),
// any single active visitor triggers cleanup for the whole community, not
// just themselves, so this stays tidy without needing Firestore's native
// TTL feature at all (which also wouldn't reach the replies subcollection
// on its own — deleting a parent document never cascade-deletes its
// subcollections in Firestore, so cleanup here explicitly deletes a post's
// replies before deleting the post itself).

import { db } from './firebase-config.js';
import {
  collection, addDoc, doc, query, orderBy, limit, onSnapshot, getDocs,
  updateDoc, increment, serverTimestamp, Timestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const POSTS_COL = 'feedPosts';
const POST_TTL_HOURS = 24;
const FEED_LIMIT = 50;

export const POST_TYPES = [
  { id: 'question', label: 'Question' },
  { id: 'chismis', label: 'Chismis' },
];

export async function createPost({ uid, name, photoURL, isLocal, type, text }) {
  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return;
  const expiresAt = Timestamp.fromMillis(Date.now() + POST_TTL_HOURS * 60 * 60 * 1000);
  await addDoc(collection(db, POSTS_COL), {
    authorId: uid,
    authorName: name,
    authorPhoto: photoURL || '',
    authorIsLocal: !!isLocal,
    type: POST_TYPES.some((t) => t.id === type) ? type : 'question',
    text: trimmed,
    createdAt: serverTimestamp(),
    expiresAt,
    replyCount: 0,
  });
}

export function listenToFeed(onUpdate) {
  const q = query(collection(db, POSTS_COL), orderBy('createdAt', 'desc'), limit(FEED_LIMIT));
  return onSnapshot(q, (snap) => {
    const now = Date.now();
    const posts = [];
    const expiredRefs = [];

    snap.docs.forEach((d) => {
      const data = d.data();
      const expiresAtMs = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : null;
      if (expiresAtMs && expiresAtMs <= now) {
        expiredRefs.push(d.ref);
      } else {
        posts.push({ id: d.id, ...data });
      }
    });

    onUpdate(posts);

    expiredRefs.forEach((ref) => deleteExpiredPost(ref).catch(() => {}));
  });
}

async function deleteExpiredPost(postRef) {
  const repliesSnap = await getDocs(collection(postRef, 'replies'));
  const batch = writeBatch(db);
  repliesSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(postRef);
  await batch.commit();
}

export function listenToReplies(postId, onUpdate) {
  const q = query(collection(db, POSTS_COL, postId, 'replies'), orderBy('createdAt', 'asc'), limit(100));
  return onSnapshot(q, (snap) => {
    onUpdate(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function addReply(postId, { uid, name, photoURL, isLocal, text }) {
  const trimmed = text.trim().slice(0, 300);
  if (!trimmed) return;
  await addDoc(collection(db, POSTS_COL, postId, 'replies'), {
    authorId: uid,
    authorName: name,
    authorPhoto: photoURL || '',
    authorIsLocal: !!isLocal,
    text: trimmed,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, POSTS_COL, postId), { replyCount: increment(1) });
}

export async function reportPost({ post, reportedBy, reason }) {
  await addDoc(collection(db, 'reports'), {
    type: 'feedpost',
    postId: post.id,
    messageText: post.text,
    reportedUser: post.authorId,
    reportedBy,
    reason: reason || 'unspecified',
    createdAt: serverTimestamp(),
    status: 'open',
  });
}
