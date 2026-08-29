import { requireVerifiedUser, markLocationVerified } from './auth.js';
import { renderTabBar, setTabBadge } from './nav.js';
import { icon } from './icons.js';
import { startPresenceHeartbeat, getOnlineCount } from './presence.js';
import {
  joinRandomQueue, cancelRandomQueue, listenForMatch, attemptMatch,
  listenToRoom, listenToRoomMessages, sendRoomMessage, endRoomChat, reportRoomPartner,
  markActiveRoom, clearActiveRoom,
} from './random-chat.js';
import { blockUserId } from './chat.js';
import { escapeHtml, formatClockTime, toJsDate, showToast, hidePageLoader } from './utils.js';
import { CATEGORY_LABELS } from './categories.js';
import { verifyBantayanLocation } from './geofence.js';
import { watchUnreadPublicChat } from './unread.js';

const { user, profile } = await requireVerifiedUser();
document.getElementById('tab-bar-mount').innerHTML = renderTabBar('random', { isAdmin: profile.isAdmin });
watchUnreadPublicChat(profile, (count) => setTabBadge('chat', count));
document.getElementById('room-send-btn').innerHTML = icon('send', { size: 18 });

startPresenceHeartbeat(user.uid);
async function refreshOnlineCount() {
  document.getElementById('online-count').textContent = `${await getOnlineCount()} online`;
}
refreshOnlineCount();
setInterval(refreshOnlineCount, 30000);

const content = document.getElementById('random-content');
const inputBar = document.getElementById('room-input-bar');
const titleEl = document.getElementById('random-title');

// How long a search stays scoped to your category before widening to
// anyone. Long enough to give a relevant match a real chance, short enough
// that RandomChat never feels stuck on a quiet day for that category.
const CATEGORY_GRACE_SEC = 15;

const myInfo = () => ({ uid: user.uid, username: profile.username, photoURL: profile.photoURL, category: profile.category });
const blockedList = () => profile.blockedUsers || [];

let search = { unsubMatch: null, retryTimer: null, elapsedTimer: null, elapsedSec: 0, active: false };
let room = { id: null, unsubRoom: null, unsubMsgs: null, partnerName: '', partnerUid: null, endedByMe: false };

// ---------------- IDLE ----------------
function renderIdle() {
  titleEl.textContent = 'RandomChat';
  inputBar.classList.add('hidden');
  content.innerHTML = `
    <div class="card text-center" style="padding: var(--space-7) var(--space-5);">
      <div class="step-icon-ring" style="margin-bottom: var(--space-4);">${icon('shuffle', { size: 28 })}</div>
      <h2>Meet someone new</h2>
      <p>Get randomly paired with another ChitLaner online right now. Chats aren't saved — once it ends, it's gone.</p>
      <button class="btn btn-primary" id="find-btn">Find someone</button>
    </div>`;
  document.getElementById('find-btn').addEventListener('click', startSearching);
}

// ---------------- SEARCHING ----------------
function renderSearching() {
  titleEl.textContent = 'Searching…';
  inputBar.classList.add('hidden');
  const categoryLabel = CATEGORY_LABELS[profile.category];
  content.innerHTML = `
    <div class="card text-center" style="padding: var(--space-7) var(--space-5);">
      <div class="spinner" style="margin: 0 auto var(--space-4);"></div>
      <h2 id="search-status-text">${categoryLabel ? `Looking for someone into ${escapeHtml(categoryLabel)}` : 'Looking for someone online'}</h2>
      <p class="mono" id="elapsed-time">0:00</p>
      <button class="btn btn-outline" id="cancel-search-btn">Cancel</button>
    </div>`;
  document.getElementById('cancel-search-btn').addEventListener('click', cancelSearching);
}

function tickElapsed() {
  search.elapsedSec += 1;
  const m = Math.floor(search.elapsedSec / 60);
  const s = String(search.elapsedSec % 60).padStart(2, '0');
  const el = document.getElementById('elapsed-time');
  if (el) el.textContent = `${m}:${s}`;

  const statusEl = document.getElementById('search-status-text');
  if (statusEl && profile.category && search.elapsedSec === CATEGORY_GRACE_SEC) {
    statusEl.textContent = 'Widening the search to anyone online';
  }
}

async function startSearching() {
  search.active = true;
  search.elapsedSec = 0;
  renderSearching();
  search.elapsedTimer = setInterval(tickElapsed, 1000);

  await joinRandomQueue(myInfo());

  search.unsubMatch = listenForMatch(user.uid, (roomId) => {
    if (!search.active) return;
    stopSearchTimers();
    enterRoom(roomId);
  });

  let consecutiveFailures = 0;
  const tryClaim = async () => {
    if (!search.active) return;
    try {
      const allowAnyCategory = search.elapsedSec >= CATEGORY_GRACE_SEC;
      const roomId = await attemptMatch(myInfo(), blockedList(), { allowAnyCategory });
      consecutiveFailures = 0;
      if (roomId && search.active) {
        stopSearchTimers();
        enterRoom(roomId);
      }
    } catch (e) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) {
        await stopSearchingAndLeaveQueue();
        renderSearchError();
      }
    }
  };
  await tryClaim();
  search.retryTimer = setInterval(tryClaim, 6000);
}

function stopSearchTimers() {
  search.active = false;
  clearInterval(search.elapsedTimer);
  clearInterval(search.retryTimer);
  if (search.unsubMatch) search.unsubMatch();
}

async function stopSearchingAndLeaveQueue() {
  stopSearchTimers();
  await cancelRandomQueue(user.uid);
}

async function cancelSearching() {
  await stopSearchingAndLeaveQueue();
  renderIdle();
}

function renderSearchError() {
  titleEl.textContent = 'RandomChat';
  inputBar.classList.add('hidden');
  content.innerHTML = `
    <div class="card text-center" style="padding: var(--space-7) var(--space-5);">
      <div class="step-icon-ring">${icon('warning', { size: 28 })}</div>
      <h2>Couldn't connect</h2>
      <p>Something went wrong while looking for a match. Check your connection and try again.</p>
      <button class="btn btn-primary" id="retry-search-btn">Try again</button>
    </div>`;
  document.getElementById('retry-search-btn').addEventListener('click', startSearching);
}

// ---------------- MATCHED / ROOM ----------------
function renderRoomShell() {
  inputBar.classList.remove('hidden');
  content.innerHTML = `
    <div class="flex-between mb-0" style="margin-bottom: var(--space-3);">
      <h3 class="mb-0" id="partner-name">Connecting…</h3>
      <div class="flex-row">
        <button class="btn-icon" id="report-partner-btn" aria-label="Report">${icon('flag', { size: 16 })}</button>
        <button class="btn-icon" id="end-chat-btn" aria-label="End chat">${icon('close', { size: 16 })}</button>
      </div>
    </div>
    <div class="chat-scroll" id="room-scroll"></div>`;
  document.getElementById('end-chat-btn').addEventListener('click', handleEndChat);
  document.getElementById('report-partner-btn').addEventListener('click', handleReportPartner);
}

function renderRoomMessages(messages) {
  const scroll = document.getElementById('room-scroll');
  if (!scroll) return;
  if (!messages.length) {
    scroll.innerHTML = `<div class="empty-state">${icon('chat', { size: 36 })}<p>Say hi — start the conversation!</p></div>`;
    return;
  }
  scroll.innerHTML = messages.map((m) => {
    const mine = m.senderId === user.uid;
    const time = formatClockTime(toJsDate(m.createdAt));
    return `
      <div class="msg-row ${mine ? 'mine' : ''}">
        <div class="msg-content">
          <div class="msg-bubble">${escapeHtml(m.text)}<div class="msg-time">${time}</div></div>
        </div>
      </div>`;
  }).join('');
  scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
}

function enterRoom(roomId) {
  room.id = roomId;
  room.endedByMe = false;
  titleEl.textContent = 'RandomChat';
  renderRoomShell();
  markActiveRoom(user.uid, roomId);

  room.unsubRoom = listenToRoom(roomId, (roomData) => {
    if (!roomData) {
      if (!room.endedByMe) handlePartnerLeft();
      return;
    }
    const iAmA = roomData.userA === user.uid;
    room.partnerName = iAmA ? roomData.userBName : roomData.userAName;
    room.partnerUid = iAmA ? roomData.userB : roomData.userA;
    const nameEl = document.getElementById('partner-name');
    if (nameEl) nameEl.textContent = room.partnerName;
  });

  room.unsubMsgs = listenToRoomMessages(roomId, renderRoomMessages);
}

function cleanupRoomListeners() {
  if (room.unsubRoom) room.unsubRoom();
  if (room.unsubMsgs) room.unsubMsgs();
  room.unsubRoom = null;
  room.unsubMsgs = null;
}

async function handleEndChat() {
  room.endedByMe = true;
  const roomId = room.id;
  cleanupRoomListeners();
  room.id = null;
  renderEnded('You ended the chat.');
  clearActiveRoom(user.uid);
  await endRoomChat(roomId);
}

function handlePartnerLeft() {
  cleanupRoomListeners();
  room.id = null;
  renderEnded(`${room.partnerName || 'The other person'} left the chat.`);
  clearActiveRoom(user.uid);
}

function renderEnded(message) {
  titleEl.textContent = 'RandomChat';
  inputBar.classList.add('hidden');
  content.innerHTML = `
    <div class="card text-center" style="padding: var(--space-7) var(--space-5);">
      <div class="step-icon-ring">${icon('shuffle', { size: 28 })}</div>
      <h2>Chat ended</h2>
      <p>${escapeHtml(message)}</p>
      <button class="btn btn-primary" id="find-again-btn">Find someone new</button>
    </div>`;
  document.getElementById('find-again-btn').addEventListener('click', startSearching);
}

function handleReportPartner() {
  const backdrop = document.createElement('div');
  backdrop.className = 'msg-menu-backdrop';
  backdrop.innerHTML = `
    <div class="msg-menu">
      <h3>${escapeHtml(room.partnerName || 'This person')}</h3>
      <button id="report-only">${icon('flag', { size: 18 })} Report this person</button>
      <button id="report-block" class="danger-action">${icon('block', { size: 18 })} Report and block</button>
      <button id="report-cancel">${icon('close', { size: 18 })} Cancel</button>
    </div>`;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#report-only').addEventListener('click', async () => {
    await reportRoomPartner({ roomId: room.id, partnerUid: room.partnerUid, reportedBy: user.uid, reason: 'inappropriate' });
    showToast('Reported. Thanks for flagging it.');
    backdrop.remove();
  });
  backdrop.querySelector('#report-block').addEventListener('click', async () => {
    await reportRoomPartner({ roomId: room.id, partnerUid: room.partnerUid, reportedBy: user.uid, reason: 'inappropriate' });
    await blockUserId(user.uid, room.partnerUid);
    showToast('Reported and blocked.');
    backdrop.remove();
    handleEndChat();
  });
  backdrop.querySelector('#report-cancel').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}

let sendingRoomMsg = false;
async function trySendRoomMessage() {
  const input = document.getElementById('room-input');
  const text = input.value;
  if (!text.trim() || sendingRoomMsg || !room.id) return;
  sendingRoomMsg = true;
  input.value = '';
  try {
    await sendRoomMessage(room.id, { text, uid: user.uid, name: profile.username });
  } finally {
    sendingRoomMsg = false;
  }
}

// ---------------- LOCALS ONLY (visitors land here instead) ----------------
function renderLocalsOnlyNotice() {
  titleEl.textContent = 'RandomChat';
  inputBar.classList.add('hidden');
  content.innerHTML = `
    <div class="card text-center" style="padding: var(--space-7) var(--space-5);">
      <div class="step-icon-ring">${icon('pin', { size: 28 })}</div>
      <h2>Locals only, for now</h2>
      <p>RandomChat pairs you up one-on-one, so we keep it limited to people actually on Bantayan Island. Public Chat is open to everyone though — head there to say hi or ask around.</p>
      <button class="btn btn-primary" id="verify-now-btn">Verify I'm on the island</button>
      <button class="btn btn-outline mt-2" id="go-to-chat-btn">Go to Public Chat</button>
      <p class="text-muted mt-2" id="verify-now-status"></p>
    </div>`;
  document.getElementById('go-to-chat-btn').addEventListener('click', () => { window.location.href = 'chat.html'; });
  document.getElementById('verify-now-btn').addEventListener('click', async () => {
    const btn = document.getElementById('verify-now-btn');
    const status = document.getElementById('verify-now-status');
    btn.setAttribute('disabled', 'true');
    status.textContent = 'Checking your location…';
    const result = await verifyBantayanLocation();
    if (result.verified) {
      await markLocationVerified(user.uid);
      showToast("You're verified! Loading RandomChat…");
      window.location.reload();
      return;
    }
    status.textContent = "Still doesn't look like you're on the island — try again once you're there.";
    btn.removeAttribute('disabled');
  });
}

if (profile.verifiedLocation) {
  document.getElementById('room-send-btn').addEventListener('click', trySendRoomMessage);
  document.getElementById('room-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') trySendRoomMessage();
  });
  if (profile.activeRoomId) {
    // Resuming after a refresh (or reopening the browser) mid-conversation.
    // If the room turned out to have ended while we were away, the normal
    // listenToRoom(...) handling in enterRoom() already covers that — it
    // detects the missing doc and shows "chat ended" gracefully.
    enterRoom(profile.activeRoomId);
  } else {
    renderIdle();
  }
  hidePageLoader();
} else {
  renderLocalsOnlyNotice();
  hidePageLoader();
}
