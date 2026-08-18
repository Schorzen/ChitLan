// ChitLan — daily streaks + badge evaluation.
//
// A "day" is measured in Asia/Manila time (ChitLan is Bantayan-only, so this
// keeps streaks fair regardless of a visitor's device timezone).

import { db } from './firebase-config.js';
import { doc, updateDoc, arrayUnion } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

function manilaDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date); // => "YYYY-MM-DD"
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const diff = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(diff / 86400000);
}

export const BADGE_RULES = [
  { id: 'newcomer', label: 'Newcomer', check: () => true },
  { id: 'active-chitlaner', label: 'Active ChitLaner', check: (p) => (p.messageCount || 0) >= 50 },
  { id: 'streak-7', label: '7-Day Streak', check: (p) => (p.streak?.count || 0) >= 7 },
  { id: 'streak-30', label: '30-Day Streak', check: (p) => (p.streak?.count || 0) >= 30 },
];

export const BADGE_LABELS = Object.fromEntries(BADGE_RULES.map((r) => [r.id, r.label]));

export function evaluateNewBadges(profile) {
  const existing = new Set(profile.badges || []);
  return BADGE_RULES.filter((r) => !existing.has(r.id) && r.check(profile));
}

// Call once when a user lands on Home. Returns the (possibly unchanged)
// streak count, plus any badges newly earned as a result.
export async function checkInStreak(uid, profile) {
  const today = manilaDateString();
  const last = profile.streak?.lastCheckIn;
  let count = profile.streak?.count || 0;

  if (last === today) return { count, newBadges: [] };

  count = last && daysBetween(last, today) === 1 ? count + 1 : 1;

  const updatedProfile = { ...profile, streak: { count, lastCheckIn: today } };
  const newBadges = evaluateNewBadges(updatedProfile);

  await updateDoc(doc(db, 'users', uid), {
    'streak.count': count,
    'streak.lastCheckIn': today,
    ...(newBadges.length ? { badges: arrayUnion(...newBadges.map((b) => b.id)) } : {}),
  });

  return { count, newBadges };
}

export async function awardBadgeIfNew(uid, profile, badgeId) {
  if ((profile.badges || []).includes(badgeId)) return false;
  await updateDoc(doc(db, 'users', uid), { badges: arrayUnion(badgeId) });
  return true;
}
