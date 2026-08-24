// ChitLan — Firebase configuration
//
// SETUP:
// 1. Go to https://console.firebase.google.com → Add project
// 2. Project settings → your apps → Add app → Web (</>) → copy the
//    config object Firebase gives you and paste the values below.
// 3. Build > Authentication > Get started > Sign-in method > enable "Google".
// 4. Build > Firestore Database > Create database (start in production
//    mode — the rules in firestore.rules at the project root lock it down).
// 5. Add your GitHub Pages domain (e.g. yourname.github.io) under
//    Authentication > Settings > Authorized domains.
//
// Note: profile photos come from each user's Google account and aren't
// user-editable in-app — Firebase Storage now requires the paid Blaze plan
// (as of Feb 2026), so this project intentionally doesn't use it.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDXHOwsCGYYwMEq9obWYyUgU35vixsey6M",
  authDomain: "chitlan-bantayan.firebaseapp.com",
  projectId: "chitlan-bantayan",
  storageBucket: "chitlan-bantayan.firebasestorage.app",
  messagingSenderId: "611892377438",
  appId: "1:611892377438:web:73018c8527651bb07d01cf",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
