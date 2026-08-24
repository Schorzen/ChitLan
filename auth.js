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

  if (snap.exists()) {
    // Backfill email on docs created before this field existed — this is
    // what makes it possible to find someone's doc by email in the Firestore
    // console (e.g. to promote them to admin) instead of hunting through
    // random-looking uids.
    if (!snap.data().email && user.email) {
      await updateDoc(ref, { email: user.email });
      return { ...snap.data(), email: user.email };
    }
    return snap.data();
  }

  const newProfile = {
    uid: user.uid,
    email: user.email || '',
    username: user.displayName || 'ChitLaner',
    photoURL: user.photoURL || '',
    birthday: null,
    gender: null,
    bio: '',
    category: null,
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

export async function setUserCategory(uid, category) {
  await updateDoc(doc(db, 'users', uid), { category });
}

// Guard for every protected page (home/chat/random/profile/admin).
// Redirects to index.html if the user isn't signed in, isn't verified,
// hasn't picked a category yet, or has been blocked by an admin. Resolves
// with { user, profile } otherwise. The category check applies to
// returning users too, not just new signups — anyone who created their
// account before this feature existed gets funneled through the picker on
// their next visit to any protected page.
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
      if (!profile.category) {
        window.location.href = 'index.html';
        return;
      }
      resolve({ user, profile });
    });
  });
}
