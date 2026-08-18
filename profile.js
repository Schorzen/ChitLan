// ChitLan — Profile editing.

import { db, storage } from './firebase-config.js';
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

export async function updateProfileFields(uid, { username, birthday, gender, bio }) {
  const updates = {};
  if (username !== undefined) updates.username = username.trim().slice(0, 30);
  if (birthday !== undefined) updates.birthday = birthday || null;
  if (gender !== undefined) updates.gender = gender || null;
  if (bio !== undefined) updates.bio = bio.trim().slice(0, 160);
  await updateDoc(doc(db, 'users', uid), updates);
}

// Uploads a new profile photo to Storage and points the user's Firestore
// doc at the resulting URL. Keeps the file small-ish client-side via the
// caller passing a resized/compressed blob if desired.
export async function uploadProfilePhoto(uid, file) {
  const path = `profile-photos/${uid}-${Date.now()}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);
  await updateDoc(doc(db, 'users', uid), { photoURL: url });
  return url;
}

export async function resetPhotoToGoogle(uid, googlePhotoURL) {
  await updateDoc(doc(db, 'users', uid), { photoURL: googlePhotoURL || '' });
}
