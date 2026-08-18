// ChitLan — Authentication + user document helpers.

import { auth, db, googleProvider } from './firebase-config.js';
import {
  onAuthStateChanged, signInWithPopup, signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export async function signOutUser() {
  await signOut(auth);
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// Called on first sign-in. Does NOT mark the user as location-verified —
// that only happens via markLocationVerified(), after a fresh geofence check.
export async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();

  const newProfile = {
    uid: user.uid,
    username: user.displayName || 'ChitLaner',
    photoURL: user.photoURL || '',
    birthday: null,
    gender: null,
    bio: '',
    verifiedLocation: false,
    isAdmin: false,
    isBlocked: false,
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp(),
    streak: { count: 0, lastCheckIn: null },
    badges: [],
    messageCount: 0,
    blockedUsers: [],
  };
  await setDoc(ref, newProfile);
  return newProfile;
}

export async function markLocationVerified(uid) {
  await updateDoc(doc(db, 'users', uid), { verifiedLocation: true });
}

// Guard for every protected page (home/chat/random/profile/admin).
// Redirects to index.html if the user isn't signed in, isn't verified,
// or has been blocked by an admin. Resolves with { user, profile } otherwise.
export function requireVerifiedUser() {
  return new Promise((resolve) => {
    watchAuth(async (user) => {
      if (!user) {
        window.location.href = 'index.html';
        return;
      }
      const profile = await ensureUserDoc(user);
      if (profile.isBlocked) {
        alert("Your account has been suspended. Reach out to an admin if you think this is a mistake.");
        await signOutUser();
        window.location.href = 'index.html';
        return;
      }
      if (!profile.verifiedLocation) {
        window.location.href = 'index.html';
        return;
      }
      resolve({ user, profile });
    });
  });
}
