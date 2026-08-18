// ChitLan — Trending Topics (read side). Admin sets these manually via
// admin.js; any verified user can read them, which is why this lives in
// its own small module rather than inside admin.js.

import { db } from './firebase-config.js';
import { collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function listTrendingTopics() {
  const q = query(collection(db, 'trendingTopics'), orderBy('createdAt', 'desc'), limit(10));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
