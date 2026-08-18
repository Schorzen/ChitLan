import { watchAuth, signInWithGoogle, ensureUserDoc, markLocationVerified, signOutUser } from './auth.js';
import { verifyBantayanLocation } from './geofence.js';
import { icon } from './icons.js';
import { showToast } from './utils.js';

const root = document.getElementById('app-state');

function renderSignedOut() {
  root.innerHTML = `
    <h2 style="margin-bottom:4px;">Welcome</h2>
    <p class="text-muted" style="margin-bottom: var(--space-5);">Sign in to get started.</p>
    <button class="g-btn" id="google-btn">${icon('google', { size: 20 })} Sign in with Google</button>
    <p class="fine-print">By continuing you agree to share your location once, just to confirm you're on the island. We never show your exact spot to anyone.</p>
  `;
  document.getElementById('google-btn').addEventListener('click', async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      showToast("Couldn't sign in — please try again.");
    }
  });
}

function renderVerifyStep(uid, { denied = false, outside = false, unsupported = false } = {}) {
  let message = "ChitLan is only for people on Bantayan Island. Allow location access so we can confirm — we only ever check a yes/no, never your exact spot.";
  if (denied) message = "Location access was denied. ChitLan can't confirm you're on the island without it — enable location for this site in your browser settings, then try again.";
  if (outside) message = "Hmm, it looks like you're not on Bantayan Island right now. ChitLan is only available to people currently on the island.";
  if (unsupported) message = "Your browser doesn't support location access, so ChitLan can't verify you're on the island here. Try a different browser.";

  root.innerHTML = `
    <div class="step-icon-ring">${icon('pin', { size: 30 })}</div>
    <h1 style="font-size:22px;">Verify your island</h1>
    <p>${message}</p>
    <button class="btn btn-primary" id="verify-btn">Allow location</button>
    <button class="btn btn-ghost" id="signout-btn" style="margin-top:8px;">Sign out</button>
    <div class="status-line hidden" id="status-line"></div>
  `;

  document.getElementById('verify-btn').addEventListener('click', () => runVerification(uid));
  document.getElementById('signout-btn').addEventListener('click', () => signOutUser());
}

function renderSuspended() {
  root.innerHTML = `
    <div class="step-icon-ring">${icon('block', { size: 28 })}</div>
    <h1 style="font-size:22px;">Account suspended</h1>
    <p>Your ChitLan account has been suspended by a moderator. If you think this is a mistake, reach out to the ChitLan admins.</p>
    <button class="btn btn-outline" id="signout-btn-2">Sign out</button>
  `;
  document.getElementById('signout-btn-2').addEventListener('click', () => signOutUser());
}

async function runVerification(uid) {
  const statusLine = document.getElementById('status-line');
  const verifyBtn = document.getElementById('verify-btn');
  verifyBtn.setAttribute('disabled', 'true');
  statusLine.classList.remove('hidden');
  statusLine.innerHTML = `<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Checking your location…`;

  const result = await verifyBantayanLocation();

  if (result.verified) {
    statusLine.innerHTML = `You're on the island! Taking you in…`;
    await markLocationVerified(uid);
    window.location.href = 'home.html';
    return;
  }

  renderVerifyStep(uid, {
    denied: result.reason === 'denied',
    outside: result.reason === 'outside',
    unsupported: result.reason === 'unsupported',
  });
}

watchAuth(async (user) => {
  if (!user) {
    renderSignedOut();
    return;
  }
  const profile = await ensureUserDoc(user);
  if (profile.isBlocked) {
    renderSuspended();
    return;
  }
  if (profile.verifiedLocation) {
    window.location.href = 'home.html';
    return;
  }
  renderVerifyStep(user.uid);
});
