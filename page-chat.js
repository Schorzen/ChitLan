import { requireVerifiedUser } from './auth.js';
import { renderTabBar } from './nav.js';
import { icon } from './icons.js';
import { startPresenceHeartbeat, getOnlineCount } from './presence.js';
import { listenToPublicChat, loadOlderMessages, sendPublicMessage, reportMessage, blockUserId } from './chat.js';
import { escapeHtml, avatarHtml, formatClockTime, toJsDate, showToast, hidePageLoader } from './utils.js';

const { user, profile } = await requireVerifiedUser();

document.getElementById('tab-bar-mount').innerHTML = renderTabBar('chat', { isAdmin: profile.isAdmin });
document.getElementById('send-btn').innerHTML = icon('send', { size: 18 });
hidePageLoader();

startPresenceHeartbeat(user.uid);
async function refreshOnlineCount() {
  document.getElementById('online-count').textContent = `${await getOnlineCount()} online`;
}
refreshOnlineCount();
setInterval(refreshOnlineCount, 30000);

const blockedSet = new Set(profile.blockedUsers || []);
const chatScroll = document.getElementById('chat-scroll');

// id -> message data, for the report/block menu to look up whichever
// bubble was tapped. Pure lookup table — actual DOM order is managed
// directly via prepend/append, not rebuilt from this.
const messageMap = new Map();

let oldestDoc = null;
let hasMoreOlder = true;
let isLoadingOlder = false;

function isNearBottomPage() {
  return (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 160);
}

function isNearTopPage() {
  return window.scrollY < 120;
}

function messageRowHTML(m) {
  const mine = m.senderId === user.uid;
  const time = formatClockTime(toJsDate(m.createdAt));
  return `
    <div class="msg-row ${mine ? 'mine' : ''}" data-mid="${m.id}" data-sender="${m.senderId}">
      ${avatarHtml(m.senderPhoto, m.senderName, 'msg-avatar')}
      <div>
        ${mine ? '' : `<div class="msg-name">${escapeHtml(m.senderName)}</div>`}
        <div class="msg-bubble">${escapeHtml(m.text)}<div class="msg-time">${time}</div></div>
      </div>
    </div>`;
}

function clearEmptyState() {
  chatScroll.querySelector('.empty-state')?.remove();
}

function renderInitial(messages) {
  chatScroll.innerHTML = messages.length
    ? messages.map(messageRowHTML).join('')
    : `<div class="empty-state">${icon('chat', { size: 40 })}<p>No messages yet — say hi first!</p></div>`;
}

function appendLiveMessage(m) {
  clearEmptyState();
  chatScroll.insertAdjacentHTML('beforeend', messageRowHTML(m));
}

function prependOlderMessages(messages) {
  clearEmptyState();
  chatScroll.insertAdjacentHTML('afterbegin', messages.map(messageRowHTML).join(''));
}

function showTopSpinner() {
  if (document.getElementById('older-spinner')) return;
  chatScroll.insertAdjacentHTML('afterbegin', `<div id="older-spinner" class="text-center" style="padding:14px 0;"><div class="spinner" style="margin:0 auto;"></div></div>`);
}
function hideTopSpinner() {
  document.getElementById('older-spinner')?.remove();
}
function showStartOfHistoryNotice() {
  if (document.getElementById('history-start-notice')) return;
  chatScroll.insertAdjacentHTML('afterbegin', `<p id="history-start-notice" class="text-muted text-center" style="padding:10px 0;">You've reached the start of the conversation.</p>`);
}

listenToPublicChat((update) => {
  if (update.type === 'initial') {
    const visible = update.messages.filter((m) => !blockedSet.has(m.senderId));
    visible.forEach((m) => messageMap.set(m.id, m));
    renderInitial(visible);
    oldestDoc = update.oldestDoc;
    hasMoreOlder = update.hasMore;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
    return;
  }

  // Delta update — only 'added' changes reach here (see chat.js). A message
  // leaving the live-40 tracking window because newer ones pushed it out
  // does NOT mean it was deleted, so we intentionally don't try to remove
  // anything from the DOM here — the scrollback a person has already loaded
  // should only ever grow, never shift under them mid-read.
  update.changes.forEach(({ message }) => {
    if (blockedSet.has(message.senderId)) return;
    if (messageMap.has(message.id)) return; // already rendered (e.g. from initial batch)
    messageMap.set(message.id, message);
    const stick = isNearBottomPage();
    appendLiveMessage(message);
    if (stick) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  });
});

async function maybeLoadOlder() {
  if (isLoadingOlder || !hasMoreOlder || !oldestDoc) return;
  if (!isNearTopPage()) return;

  isLoadingOlder = true;
  showTopSpinner();
  try {
    const result = await loadOlderMessages(oldestDoc);
    const visible = result.messages.filter((m) => !blockedSet.has(m.senderId));
    visible.forEach((m) => messageMap.set(m.id, m));

    const prevHeight = document.body.scrollHeight;
    hideTopSpinner();
    if (visible.length) prependOlderMessages(visible);
    const newHeight = document.body.scrollHeight;
    window.scrollTo(0, window.scrollY + (newHeight - prevHeight));

    oldestDoc = result.oldestDoc;
    hasMoreOlder = result.hasMore;
    if (!hasMoreOlder) showStartOfHistoryNotice();
  } catch (e) {
    hideTopSpinner();
    showToast("Couldn't load older messages — try again.");
  } finally {
    isLoadingOlder = false;
  }
}

let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    maybeLoadOlder();
    scrollTicking = false;
  });
});

chatScroll.addEventListener('click', (e) => {
  const row = e.target.closest('.msg-row');
  if (!row || row.classList.contains('mine')) return;
  const message = messageMap.get(row.dataset.mid);
  if (message) openMessageMenu(message);
});

function openMessageMenu(message) {
  const backdrop = document.createElement('div');
  backdrop.className = 'msg-menu-backdrop';
  backdrop.innerHTML = `
    <div class="msg-menu">
      <h3>${escapeHtml(message.senderName)}</h3>
      <button id="report-action">${icon('flag', { size: 18 })} Report this message</button>
      <button id="block-action" class="danger-action">${icon('block', { size: 18 })} Block this person</button>
      <button id="cancel-action">${icon('close', { size: 18 })} Cancel</button>
    </div>`;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#report-action').addEventListener('click', async () => {
    await reportMessage({ message, reportedBy: user.uid, reason: 'inappropriate' });
    showToast('Reported. Thanks for flagging it.');
    backdrop.remove();
  });
  backdrop.querySelector('#block-action').addEventListener('click', async () => {
    await blockUserId(user.uid, message.senderId);
    blockedSet.add(message.senderId);
    chatScroll.querySelectorAll(`[data-sender="${message.senderId}"]`).forEach((row) => row.remove());
    [...messageMap.entries()].forEach(([id, m]) => { if (m.senderId === message.senderId) messageMap.delete(id); });
    showToast(`Blocked ${message.senderName}. You won't see their messages anymore.`);
    backdrop.remove();
  });
  backdrop.querySelector('#cancel-action').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}

let sending = false;
async function trySend() {
  const input = document.getElementById('chat-input');
  const text = input.value;
  if (!text.trim() || sending) return;
  sending = true;
  input.value = '';
  try {
    await sendPublicMessage({ text, uid: user.uid, name: profile.username, photoURL: profile.photoURL });
  } catch (e) {
    showToast("Message didn't send — check your connection.");
  } finally {
    sending = false;
  }
}

document.getElementById('send-btn').addEventListener('click', trySend);
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') trySend();
});
