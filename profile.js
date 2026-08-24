// ChitLan — Profile editing.

import { db } from './firebase-config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export async function updateProfileFields(uid, { username, birthday, gender, bio }) {
  const updates = {};
  if (username !== undefined) updates.username = username.trim().slice(0, 30);
  if (birthday !== undefined) updates.birthday = birthday || null;
  if (gender !== undefined) updates.gender = gender || null;
  if (bio !== undefined) updates.bio = bio.trim().slice(0, 160);
  await updateDoc(doc(db, 'users', uid), updates);
}
