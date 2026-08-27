import { requireVerifiedUser } from './auth.js';
import { renderTabBar } from './nav.js';
import { icon } from './icons.js';
import { startPresenceHeartbeat, getOnlineCount } from './presence.js';
import {
  listenToPublicChat, loadOlderMessages, sendPublicMessage, reportMessage, blockUserId, setMessageReaction,
} from './chat.js';
import { escapeHtml, avatarHtml, formatClockTime, toJsDate, showToast, hidePageLoader } from './utils.js';

const { user, profile } = await requireVerifiedUser();

document.getElementById('tab-bar-mount').innerHTML = renderTabBar('chat', { isAdmin: profile.isAdmin });
document.getElementById('send-btn').innerHTML = icon('send', { size: 18 });
document.getElementById('emoji-btn').innerHTML = icon('smile', { size: 20 });
document.getElementById('cancel-reply-btn').innerHTML = icon('close', { size: 16 });
hidePageLoader();

startPresenceHeartbeat(user.uid);
async function refreshOnlineCount() {
  document.getElementById('online-count').textContent = `${await getOnlineCount()} online`;
}
refreshOnlineCount();
setInterval(refreshOnlineCount, 30000);

const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];
const EMOJI_SET = [
  '😀', '😁', '😂', '🤣', '😊', '😍', '🥰',
  '😘', '😉', '😎', '🤔', '😐', '😴', '😭',
  '😢', '😡', '🤯', '😱', '🥳', '🤗', '🥺',
  '👍', '👎', '👏', '🙏', '💪', '🙌', '👋',
  '🔥', '✨', '🎉', '❤️', '💔', '🌊', '🏝️',
];

const blockedSet = new Set(profile.blockedUsers || []);
const chatScroll = document.getElementById('chat-scroll');

// id -> message data, for the report/react/reply menu to look up whichever
// bubble was tapped. Pure lookup table — actual DOM order is managed
// directly via prepend/append, not rebuilt from this.
const messageMap = new Map();

let oldestDoc = null;
let hasMoreOlder = true;
let isLoadingOlder = false;
let replyingTo = null; // { messageId, senderName, text }

// Scroll position is now tracked on the chat-scroll container itself, not
// the window — see the note in style.css on why Chat uses a fixed-height
// flex layout with an internally-scrolling message list instead of
// page-level scroll.
function isNearBottom() {
  return (chatScroll.scrollTop + chatScroll.clientHeight) >= (chatScroll.scrollHeight - 160);
}
function isNearTop() {
  return chatScroll.scrollTop < 120;
}

function reactionsHTML(message) {
  const reactions = message.reactions || {};
  const entries = Object.entries(reactions);
  if (!entries.length) return '';
  const grouped = {};
  entries.forEach(([uid, emoji]) => {
    if (!grouped[emoji]) grouped[emoji] = { count: 0, mine: false };
    grouped[emoji].count += 1;
    if (uid === user.uid) grouped[emoji].mine = true;
  });
  return `<div class="msg-reactions">${Object.entries(grouped).map(([emoji, info]) => `
    <button class="reaction-pill ${info.mine ? 'mine-reaction' : ''}" data-emoji="${emoji}">${emoji} ${info.count}</button>
  `).join('')}</div>`;
}

function replyQuoteHTML(m) {
  if (!m.replyTo) return '';
  return `<div class="msg-reply-quote" data-reply-target="${m.replyTo.messageId}">
    <span class="msg-reply-quote-name">${escapeHtml(m.replyTo.senderName)}</span>
    <span class="msg-reply-quote-text">${escapeHtml(m.replyTo.text)}</span>
  </div>`;
}

function messageRowHTML(m) {
  const mine = m.senderId === user.uid;
  const time = formatClockTime(toJsDate(m.createdAt));
  return `
    <div class="msg-row ${mine ? 'mine' : ''}" data-mid="${m.id}" data-sender="${m.senderId}">
      ${avatarHtml(m.senderPhoto, m.senderName, 'msg-avatar')}
      <div class="msg-content">
        ${mine ? '' : `<div class="msg-name">${escapeHtml(m.senderName)} <span class="${m.senderIsLocal ? 'local-tag' : 'visiting-tag'}">${m.senderIsLocal ? 'Local' : 'Visiting'}</span></div>`}
        <div class="msg-bubble">
          ${replyQuoteHTML(m)}${escapeHtml(m.text)}
          <div class="msg-time">${time}</div>
        </div>
        ${reactionsHTML(m)}
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

function updateMessageReactions(message) {
  const row = chatScroll.querySelector(`[data-mid="${message.id}"]`);
  if (!row) return; // not currently rendered (e.g. scrolled past) — fine to skip
  row.querySelector('.msg-reactions')?.remove();
  const html = reactionsHTML(message);
  if (html) row.querySelector('.msg-bubble')?.insertAdjacentHTML('afterend', html);
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

function scrollToMessage(messageId) {
  const row = chatScroll.querySelector(`[data-mid="${messageId}"]`);
  if (!row) {
    showToast("That message isn't loaded — scroll up to find it.");
    return;
  }
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const bubble = row.querySelector('.msg-bubble');
  bubble?.classList.add('flash-highlight');
  setTimeout(() => bubble?.classList.remove('flash-highlight'), 1300);
}

listenToPublicChat((update) => {
  if (update.type === 'initial') {
    const visible = update.messages.filter((m) => !blockedSet.has(m.senderId));
    visible.forEach((m) => messageMap.set(m.id, m));
    renderInitial(visible);
    oldestDoc = update.oldestDoc;
    hasMoreOlder = update.hasMore;
    chatScroll.scrollTop = chatScroll.scrollHeight;
    return;
  }

  // Delta update. A message leaving the live-40 tracking window because
  // newer ones pushed it out is NOT reported here (see chat.js) — the
  // scrollback someone has already loaded should only ever grow, never
  // shift under them mid-read.
  update.changes.forEach(({ changeType, message }) => {
    if (blockedSet.has(message.senderId)) return;
    if (changeType === 'added') {
      if (messageMap.has(message.id)) return; // already rendered (e.g. from initial batch)
      messageMap.set(message.id, message);
      const stick = isNearBottom();
      appendLiveMessage(message);
      if (stick) chatScroll.scrollTo({ top: chatScroll.scrollHeight, behavior: 'smooth' });
    } else if (changeType === 'modified') {
      messageMap.set(message.id, message);
      updateMessageReactions(message);
    }
  });
});

async function maybeLoadOlder() {
  if (isLoadingOlder || !hasMoreOlder || !oldestDoc) return;
  if (!isNearTop()) return;

  isLoadingOlder = true;
  showTopSpinner();
  try {
    const result = await loadOlderMessages(oldestDoc);
    const visible = result.messages.filter((m) => !blockedSet.has(m.senderId));
    visible.forEach((m) => messageMap.set(m.id, m));

    const prevHeight = chatScroll.scrollHeight;
    hideTopSpinner();
    if (visible.length) prependOlderMessages(visible);
    const newHeight = chatScroll.scrollHeight;
    chatScroll.scrollTop += (newHeight - prevHeight);

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
chatScroll.addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    maybeLoadOlder();
    scrollTicking = false;
  });
});

async function toggleReaction(message, emoji) {
  try {
    await setMessageReaction(message.id, emoji, user.uid, message.reactions || {});
  } catch (e) {
    showToast("Couldn't react — try again.");
  }
}

// ---- Reply ----
function startReply(message) {
  replyingTo = { messageId: message.id, senderName: message.senderName, text: message.text };
  document.getElementById('reply-preview-name').textContent = message.senderName;
  document.getElementById('reply-preview-text').textContent = message.text;
  document.getElementById('reply-preview-bar').classList.remove('hidden');
  document.getElementById('chat-input').focus();
}
function cancelReply() {
  replyingTo = null;
  document.getElementById('reply-preview-bar').classList.add('hidden');
}
document.getElementById('cancel-reply-btn').addEventListener('click', cancelReply);

chatScroll.addEventListener('click', (e) => {
  const quote = e.target.closest('.msg-reply-quote');
  if (quote) {
    scrollToMessage(quote.dataset.replyTarget);
    return;
  }
  const pill = e.target.closest('.reaction-pill');
  if (pill) {
    const row = pill.closest('.msg-row');
    const message = messageMap.get(row?.dataset.mid);
    if (message) toggleReaction(message, pill.dataset.emoji);
    return;
  }
  const row = e.target.closest('.msg-row');
  if (!row) return;
  const message = messageMap.get(row.dataset.mid);
  if (message) openMessageMenu(message, row.classList.contains('mine'));
});

function openMessageMenu(message, isMine) {
  const backdrop = document.createElement('div');
  backdrop.className = 'msg-menu-backdrop';
  const myReaction = message.reactions?.[user.uid];

  backdrop.innerHTML = `
    <div class="msg-menu">
      <div class="reaction-row">
        ${QUICK_REACTIONS.map((e) => `<button class="reaction-option ${e === myReaction ? 'selected' : ''}" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      <button id="reply-action">${icon('reply', { size: 18 })} Reply</button>
      ${!isMine ? `
        <button id="report-action">${icon('flag', { size: 18 })} Report this message</button>
        <button id="block-action" class="danger-action">${icon('block', { size: 18 })} Block this person</button>
      ` : ''}
      <button id="cancel-action">${icon('close', { size: 18 })} Cancel</button>
    </div>`;
  document.body.appendChild(backdrop);

  backdrop.querySelectorAll('.reaction-option').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await toggleReaction(message, btn.dataset.emoji);
      backdrop.remove();
    });
  });

  backdrop.querySelector('#reply-action').addEventListener('click', () => {
    startReply(message);
    backdrop.remove();
  });

  if (!isMine) {
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
  }
  backdrop.querySelector('#cancel-action').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}

function openEmojiPicker() {
  const backdrop = document.createElement('div');
  backdrop.className = 'msg-menu-backdrop';
  backdrop.innerHTML = `
    <div class="msg-menu">
      <h3>Pick an emoji</h3>
      <div class="emoji-grid">
        ${EMOJI_SET.map((e) => `<button class="emoji-grid-btn" data-emoji="${e}">${e}</button>`).join('')}
      </div>
      <button id="emoji-close-action">${icon('close', { size: 16 })} Close</button>
    </div>`;
  document.body.appendChild(backdrop);

  backdrop.querySelectorAll('.emoji-grid-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById('chat-input');
      input.value += btn.dataset.emoji;
      input.focus();
    });
  });
  backdrop.querySelector('#emoji-close-action').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}
document.getElementById('emoji-btn').addEventListener('click', openEmojiPicker);

let sending = false;
async function trySend() {
  const input = document.getElementById('chat-input');
  const text = input.value;
  if (!text.trim() || sending) return;
  sending = true;
  const replySnapshot = replyingTo;
  input.value = '';
  cancelReply();
  try {
    await sendPublicMessage({
      text, uid: user.uid, name: profile.username, photoURL: profile.photoURL, replyTo: replySnapshot,
      isLocal: profile.verifiedLocation,
    });
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
