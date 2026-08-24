import { watchAuth, signInWithGoogle, ensureUserDoc, markLocationVerified, markAsVisitor, setUserCategory, signOutUser } from './auth.js';
import { verifyBantayanLocation } from './geofence.js';
import { icon } from './icons.js';
import { showToast } from './utils.js';
import { CATEGORIES } from './categories.js';

const root = document.getElementById('app-state');

function renderSignedOut() {
  root.innerHTML = `
    <h2 style="margin-bottom:4px;">Welcome</h2>
    <p class="text-muted" style="margin-bottom: var(--space-5);">Sign in to get started.</p>
    <button class="g-btn" id="google-btn">${icon('google', { size: 20 })} Sign in with Google</button>
    <p class="fine-print">Locals and visitors both welcome. If you're on the island, you can verify your location for a Local badge in chat — totally optional, and we never show your exact spot to anyone.</p>
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
  let message = "Get a Local badge in chat by verifying you're on Bantayan Island — we only ever check a yes/no, never your exact spot. Not there yet? You can still join as a visitor.";
  if (denied) message = "Location access was denied, so we can't confirm you're on the island. You can enable it in your browser settings and try again, or just continue as a visitor for now.";
  if (outside) message = "Looks like you're not on Bantayan Island right now — that's okay, you can still join as a visitor, and verify later once you're actually here.";
  if (unsupported) message = "Your browser doesn't support location access here. You can still continue as a visitor.";

  root.innerHTML = `
    <div class="step-icon-ring">${icon('pin', { size: 30 })}</div>
    <h1 style="font-size:22px;">Where are you chatting from?</h1>
    <p>${message}</p>
    <button class="btn btn-primary" id="verify-btn">Verify I'm on the island</button>
    <button class="btn btn-outline mt-2" id="visitor-btn">Continue as a visitor</button>
    <button class="btn btn-ghost" id="signout-btn" style="margin-top:8px;">Sign out</button>
    <div class="status-line hidden" id="status-line"></div>
  `;

  document.getElementById('verify-btn').addEventListener('click', () => runVerification(uid));
  document.getElementById('visitor-btn').addEventListener('click', () => continueAsVisitor(uid));
  document.getElementById('signout-btn').addEventListener('click', () => signOutUser());
}

async function continueAsVisitor(uid) {
  const visitorBtn = document.getElementById('visitor-btn');
  const verifyBtn = document.getElementById('verify-btn');
  visitorBtn.setAttribute('disabled', 'true');
  verifyBtn.setAttribute('disabled', 'true');
  try {
    await markAsVisitor(uid);
    renderCategoryStep(uid);
  } catch (e) {
    showToast("Couldn't continue — try again.");
    visitorBtn.removeAttribute('disabled');
    verifyBtn.removeAttribute('disabled');
  }
}

function renderCategoryStep(uid) {
  root.innerHTML = `
    <div class="step-icon-ring">${icon('star', { size: 28 })}</div>
    <h1 style="font-size:22px;">What brings you to ChitLan?</h1>
    <p>Pick what fits you best — we'll use it to match you with people who share it in RandomChat.</p>
    <div class="icon-grid" style="grid-template-columns:repeat(2,1fr);">
      ${CATEGORIES.map((c) => `
        <button class="icon-tile" data-category="${c.id}">
          <span class="icon-tile-circle">${icon(c.iconName, { size: 22 })}</span>
          <span>${c.label}</span>
        </button>`).join('')}
    </div>
  `;
  root.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      root.querySelectorAll('[data-category]').forEach((b) => b.setAttribute('disabled', 'true'));
      try {
        await setUserCategory(uid, btn.dataset.category);
        window.location.href = 'home.html';
      } catch (e) {
        showToast("Couldn't save — try again.");
        root.querySelectorAll('[data-category]').forEach((b) => b.removeAttribute('disabled'));
      }
    });
  });
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
    try {
      await markLocationVerified(uid);
      renderCategoryStep(uid);
    } catch (e) {
      statusLine.innerHTML = `Something went wrong saving that — try again.`;
      verifyBtn.removeAttribute('disabled');
    }
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
  if (!profile.locationDecided) {
    renderVerifyStep(user.uid);
    return;
  }
  if (!profile.category) {
    renderCategoryStep(user.uid);
    return;
  }
  window.location.href = 'home.html';
});
