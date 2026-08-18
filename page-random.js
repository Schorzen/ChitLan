import { requireVerifiedUser } from './auth.js';
import { renderTabBar } from './nav.js';
import { icon } from './icons.js';
import { startPresenceHeartbeat, getOnlineCount } from './presence.js';
import {
  joinRandomQueue, cancelRandomQueue, listenForMatch, attemptMatch,
  listenToRoom, listenToRoomMessages, sendRoomMessage, endRoomChat, reportRoomPartner,
} from './random-chat.js';
import { blockUserId } from './chat.js';
import { escapeHtml, formatClockTime, toJsDate, showToast } from './utils.js';

const { user, profile } = await requireVerifiedUser();
document.getElementById('tab-bar-mount').innerHTML = renderTabBar('random', { isAdmin: profile.isAdmin });
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

const myInfo = () => ({ uid: user.uid, username: profile.username, photoURL: profile.photoURL });
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
  content.innerHTML = `
    <div class="card text-center" style="padding: var(--space-7) var(--space-5);">
      <div class="spinner" style="margin: 0 auto var(--space-4);"></div>
      <h2>Looking for someone online</h2>
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

  const tryClaim = async () => {
    if (!search.active) return;
    const roomId = await attemptMatch(myInfo(), blockedList());
    if (roomId && search.active) {
      stopSearchTimers();
      enterRoom(roomId);
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

async function cancelSearching() {
  stopSearchTimers();
  await cancelRandomQueue(user.uid);
  renderIdle();
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
        <div>
          <div class="msg-bubble">${escapeHtml(m.text)}<div class="msg-time">${time}</div></div>
        </div>
      </div>`;
  }).join('');
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

function enterRoom(roomId) {
  room.id = roomId;
  room.endedByMe = false;
  titleEl.textContent = 'RandomChat';
  renderRoomShell();

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
  await endRoomChat(roomId);
}

function handlePartnerLeft() {
  cleanupRoomListeners();
  room.id = null;
  renderEnded(`${room.partnerName || 'The other person'} left the chat.`);
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
document.getElementById('room-send-btn').addEventListener('click', trySendRoomMessage);
document.getElementById('room-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') trySendRoomMessage();
});

renderIdle();
