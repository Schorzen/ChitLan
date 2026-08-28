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

// Called on first sign-in. Does NOT mark the user as location-verified or
// as a visitor — that only happens via markLocationVerified() or
// markAsVisitor(), once they've actually gone through that step.
export async function ensureUserDoc(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    const patch = {};
    // Backfill email on docs created before this field existed — this is
    // what makes it possible to find someone's doc by email in the Firestore
    // console (e.g. to promote them to admin) instead of hunting through
    // random-looking uids.
    if (!data.email && user.email) patch.email = user.email;
    // Backfill locationDecided for anyone who verified back when it was the
    // only option — they already made a real decision (they proved they
    // were on the island), just under the old single-path flow, so they
    // shouldn't be sent through the picker again.
    if (data.verifiedLocation === true && data.locationDecided === undefined) patch.locationDecided = true;
    if (Object.keys(patch).length) {
      await updateDoc(ref, patch);
      return { ...data, ...patch };
    }
    return data;
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
    locationDecided: false,
    isAdmin: false,
    isBlocked: false,
    createdAt: serverTimestamp(),
    lastActive: serverTimestamp(),
    lastSeenPublicChatAt: null,
    streak: { count: 0, lastCheckIn: null },
    badges: [],
    messageCount: 0,
    blockedUsers: [],
  };
  await setDoc(ref, newProfile);
  return newProfile;
}

export async function markLocationVerified(uid) {
  await updateDoc(doc(db, 'users', uid), { verifiedLocation: true, locationDecided: true });
}

// For someone who isn't on the island (or doesn't want to share location)
// but still wants to join — Public Chat is open to everyone; RandomChat
// stays locals-only, gated on verifiedLocation specifically (see page-random.js).
export async function markAsVisitor(uid) {
  await updateDoc(doc(db, 'users', uid), { verifiedLocation: false, locationDecided: true });
}

export async function setUserCategory(uid, category) {
  await updateDoc(doc(db, 'users', uid), { category });
}

// Guard for every protected page (home/chat/random/profile/admin).
// Redirects to index.html if the user isn't signed in, hasn't made a
// location decision yet (verified OR explicitly continued as a visitor),
// hasn't picked a category, or has been blocked by an admin. Resolves with
// { user, profile } otherwise. Note this does NOT require verifiedLocation
// to be true — Public Chat and most of the app are open to visitors too;
// individual pages (like RandomChat) that need locals-only access check
// profile.verifiedLocation themselves after this resolves.
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
      if (!profile.locationDecided) {
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
