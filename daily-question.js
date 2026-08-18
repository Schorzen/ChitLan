// ChitLan — Daily Question. Admins can set an explicit question for a given
// date in the `dailyQuestions` collection (doc id = YYYY-MM-DD, field
// `question`); if none is set, every user deterministically falls back to
// the same rotating local question so Home never looks empty.

import { db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const FALLBACK_QUESTIONS = [
  "What's your go-to sunset spot on the island?",
  "Bangka ride or habal-habal — how are you getting around today?",
  "Best budbud or dried mangoes on the island — where do you buy yours?",
  "What's one thing tourists always get wrong about Bantayan?",
  "Favorite beach that isn't Sugar Beach — go.",
  "Kap-drink or lambanog — pick your poison.",
  "What's the best thing that happened to you this week?",
  "If you could fix one road or dock on the island, which one?",
  "Best turo-turo on the island and what do you always order?",
  "Fiesta you're most looking forward to this year?",
  "What song instantly reminds you of Bantayan?",
  "Team Bantayan town, Santa Fe, or Madridejos — and why?",
  "What's your comfort food after a long day of fishing or work?",
  "Best spot to watch the sunrise, not the sunset?",
  "What's a Bantayan tradition you hope never changes?",
  "Favorite place to bring visitors first?",
  "What's the most underrated thing about living here?",
  "Ferry naps: yes or no?",
  "What's one skill everyone on the island seems to have?",
  "If ChitLan had a mascot, what should it be?",
  "Best chismis you heard this week? (keep it kind!)",
  "Favorite way to spend a rainy day on the island?",
  "What's a local dish outsiders need to try at least once?",
  "Any recommendations for the best mangoes this season?",
];

function manilaDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

export async function getDailyQuestion() {
  const dateKey = manilaDateString();
  try {
    const snap = await getDoc(doc(db, 'dailyQuestions', dateKey));
    if (snap.exists() && snap.data().question) {
      return { question: snap.data().question, date: dateKey, source: 'admin' };
    }
  } catch (e) {
    // fall through to local fallback
  }
  const idx = dayOfYear() % FALLBACK_QUESTIONS.length;
  return { question: FALLBACK_QUESTIONS[idx], date: dateKey, source: 'fallback' };
}
