import { requireVerifiedUser } from './auth.js';
import { renderTabBar } from './nav.js';
import { icon } from './icons.js';
import { startPresenceHeartbeat, getOnlineCount } from './presence.js';
import { listenToPublicChat, sendPublicMessage, reportMessage, blockUserId } from './chat.js';
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
let currentMessages = [];
let firstLoad = true;

function isNearBottomPage() {
  return (window.innerHeight + window.scrollY) >= (document.body.offsetHeight - 160);
}

function renderMessageRow(m) {
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

function renderMessages(messages) {
  const container = document.getElementById('chat-scroll');
  if (!messages.length) {
    container.innerHTML = `<div class="empty-state">${icon('chat', { size: 40 })}<p>No messages yet — say hi first!</p></div>`;
    return;
  }
  container.innerHTML = messages.map(renderMessageRow).join('');
}

listenToPublicChat((messages) => {
  currentMessages = messages;
  const visible = messages.filter((m) => !blockedSet.has(m.senderId));
  const stick = firstLoad || isNearBottomPage();
  renderMessages(visible);
  if (stick) window.scrollTo({ top: document.body.scrollHeight, behavior: firstLoad ? 'auto' : 'smooth' });
  firstLoad = false;
});

document.getElementById('chat-scroll').addEventListener('click', (e) => {
  const row = e.target.closest('.msg-row');
  if (!row || row.classList.contains('mine')) return;
  const message = currentMessages.find((m) => m.id === row.dataset.mid);
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
    renderMessages(currentMessages.filter((m) => !blockedSet.has(m.senderId)));
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
