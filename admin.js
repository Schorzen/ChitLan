// ChitLan — Admin panel data layer. Every function here assumes the caller
// already confirmed profile.isAdmin === true (enforced again by
// firestore.rules server-side, so this is UX-only, not the real gate).

import { db } from './firebase-config.js';
import {
  collection, doc, addDoc, deleteDoc, updateDoc, getDocs, getDoc, setDoc,
  query, where, orderBy, limit, serverTimestamp, getCountFromServer,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
export { listTrendingTopics } from './topics.js';

export async function getOpenReports() {
  // No orderBy here on purpose — see random-chat.js for why combining
  // where() with orderBy() on a different field needs a composite index
  // that was never created, which silently broke this exact query before.
  const q = query(collection(db, 'reports'), where('status', '==', 'open'), limit(50));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
}

export async function setReportStatus(reportId, status) {
  await updateDoc(doc(db, 'reports', reportId), { status });
}

export async function setUserBlocked(uid, isBlocked) {
  await updateDoc(doc(db, 'users', uid), { isBlocked });
}

export async function findUserByUsername(username) {
  const q = query(collection(db, 'users'), where('username', '==', username), limit(5));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getUserById(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function getCommunityStats() {
  const [usersCount, statsSnap] = await Promise.all([
    getCountFromServer(collection(db, 'users')),
    getDoc(doc(db, 'meta', 'publicChatStats')),
  ]);
  return {
    totalUsers: usersCount.data().count,
    totalMessages: statsSnap.exists() ? (statsSnap.data().count || 0) : 0,
  };
}

// ---- Daily Question ----
export async function setDailyQuestion(dateKey, question) {
  await setDoc(doc(db, 'dailyQuestions', dateKey), { question, setAt: serverTimestamp() });
}

// ---- Trending Topics (write side — see topics.js for the read side used by Home) ----
export async function addTrendingTopic(title) {
  await addDoc(collection(db, 'trendingTopics'), { title, createdAt: serverTimestamp() });
}

export async function deleteTrendingTopic(id) {
  await deleteDoc(doc(db, 'trendingTopics', id));
}
