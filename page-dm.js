import { requireVerifiedUser } from './auth.js';
import { renderTabBar } from './nav.js';
import { icon } from './icons.js';
import {
  PM_INACTIVITY_HOURS, sendPrivateMessage, watchConversation, markConversationSeen,
  deletePrivateConversation, getUserProfileSummary,
} from './pm.js';
import { reportMessage, blockUserId } from './chat.js';
import { escapeHtml, avatarHtml, formatClockTime, toJsDate, timeAgo, showToast, hidePageLoader } from './utils.js';

const { user, profile } = await requireVerifiedUser();

const params = new URLSearchParams(window.location.search);
const otherUid = params.get('with');
if (!otherUid || otherUid === user.uid) {
  window.location.href = 'messages.html';
  throw new Error('Invalid conversation target');
}

document.getElementById('tab-bar-mount').innerHTML = renderTabBar('messages', { isAdmin: profile.isAdmin });
document.getElementById('send-btn').innerHTML = icon('send', { size: 18 });
document.getElementById('back-btn').innerHTML = icon('chevronLeft', { size: 20 });
document.getElementById('dm-menu-btn').innerHTML = icon('more', { size: 18 });

const chatScroll = document.getElementById('chat-scroll');
const nameEl = document.getElementById('dm-partner-name');
const inputBar = document.getElementById('chat-input-bar');

let iBlockedThem = (profile.blockedUsers || []).includes(otherUid);
let theyBlockedMe = false;
let otherInfo = { username: params.get('name') || 'ChitLaner', photoURL: params.get('photo') || '' };
nameEl.textContent = otherInfo.username;

// The URL params give us something to show immediately; this fills in (or
// corrects) it, and also tells us whether they've blocked me — the read
// is free either way, since `users` is already open to any signed-in
// member (see firestore.rules).
getUserProfileSummary(otherUid).then((summary) => {
  otherInfo = { username: summary.username, photoURL: summary.photoURL };
  nameEl.textContent = otherInfo.username;
  theyBlockedMe = (summary.blockedUsers || []).includes(user.uid);
  updateComposerState();
}).catch(() => {});

function updateComposerState() {
  if (iBlockedThem) {
    inputBar.innerHTML = `<p class="text-muted mb-0" style="padding:10px 0;">You've blocked ${escapeHtml(otherInfo.username)}. Unblock them from your Profile to send a message.</p>`;
  } else if (theyBlockedMe) {
    inputBar.innerHTML = `<p class="text-muted mb-0" style="padding:10px 0;">You can't message this person right now.</p>`;
  }
  // else: leave the normal input+send UI already in the page as-is.
}
updateComposerState();

function messageRowHTML(m) {
  const mine = m.senderId === user.uid;
  const time = formatClockTime(toJsDate(m.createdAt));
  return `
    <div class="msg-row ${mine ? 'mine' : ''}">
      ${mine ? '' : avatarHtml(otherInfo.photoURL, otherInfo.username, 'msg-avatar')}
      <div class="msg-content">
        <div class="msg-bubble">${escapeHtml(m.text)}<div class="msg-time">${time}</div></div>
      </div>
    </div>`;
}

function renderExpiryNote(expiresAt) {
  const note = document.getElementById('dm-expiry-note');
  if (!note) return;
  const ms = expiresAt?.toMillis ? expiresAt.toMillis() : null;
  if (!ms) { note.textContent = `Disappears ${PM_INACTIVITY_HOURS}h after the last message`; return; }
  const remaining = ms - Date.now();
  note.textContent = remaining > 0
    ? `Disappears in ${timeAgo(new Date(Date.now() - remaining)).replace(' ago', '')} unless someone replies`
    : 'Expiring…';
}

let expiryTimer = null;
let currentConversation = null;

const unsubscribe = watchConversation([user.uid, otherUid].sort().join('_'), (conversation) => {
  currentConversation = conversation;
  const messages = conversation?.messages || [];

  chatScroll.innerHTML = messages.length
    ? messages.map(messageRowHTML).join('')
    : `<div class="empty-state">${icon('mail', { size: 40 })}<p>Say hi — this conversation disappears after ${PM_INACTIVITY_HOURS}h of inactivity.</p></div>`;
  chatScroll.scrollTop = chatScroll.scrollHeight;

  if (conversation) {
    renderExpiryNote(conversation.expiresAt);
    clearInterval(expiryTimer);
    expiryTimer = setInterval(() => renderExpiryNote(conversation.expiresAt), 60000);
    markConversationSeen(conversation.id, user.uid);
  } else {
    document.getElementById('dm-expiry-note').textContent = `Disappears ${PM_INACTIVITY_HOURS}h after the last message`;
  }
}, () => {
  chatScroll.innerHTML = `<div class="empty-state">${icon('warning', { size: 40 })}<p>Couldn't open this conversation. Check that the updated Firestore rules are published.</p></div>`;
});

hidePageLoader();

let sending = false;
async function trySend() {
  const input = document.getElementById('chat-input');
  if (!input) return; // composer replaced by a blocked-state notice
  const text = input.value;
  if (!text.trim() || sending || iBlockedThem || theyBlockedMe) return;
  sending = true;
  input.value = '';
  try {
    await sendPrivateMessage({
      myUid: user.uid,
      myInfo: { username: profile.username, photoURL: profile.photoURL || '' },
      otherUid,
      otherInfo,
      text,
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

// ---- More menu: report / block / delete conversation ----
document.getElementById('dm-menu-btn').addEventListener('click', () => {
  const backdrop = document.createElement('div');
  backdrop.className = 'msg-menu-backdrop';
  backdrop.innerHTML = `
    <div class="msg-menu">
      <h3>${escapeHtml(otherInfo.username)}</h3>
      <button id="dm-report-action">${icon('flag', { size: 18 })} Report this person</button>
      ${!iBlockedThem ? `<button id="dm-block-action" class="danger-action">${icon('block', { size: 18 })} Block this person</button>` : ''}
      <button id="dm-delete-action" class="danger-action">${icon('trash', { size: 18 })} Delete conversation</button>
      <button id="dm-cancel-action">${icon('close', { size: 18 })} Cancel</button>
    </div>`;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#dm-report-action').addEventListener('click', async () => {
    const last = (currentConversation?.messages || []).slice(-1)[0];
    await reportMessage({
      message: { id: currentConversation?.id || '', text: last?.text || '(no messages)', senderId: otherUid },
      reportedBy: user.uid,
      reason: 'private message',
    });
    showToast('Reported. Thanks for flagging it.');
    backdrop.remove();
  });

  backdrop.querySelector('#dm-block-action')?.addEventListener('click', async () => {
    await blockUserId(user.uid, otherUid);
    iBlockedThem = true;
    updateComposerState();
    showToast(`Blocked ${otherInfo.username}.`);
    backdrop.remove();
  });

  backdrop.querySelector('#dm-delete-action').addEventListener('click', async () => {
    try {
      await deletePrivateConversation([user.uid, otherUid].sort().join('_'));
      showToast('Conversation deleted.');
      window.location.href = 'messages.html';
    } catch (e) {
      showToast("Couldn't delete — try again.");
    }
    backdrop.remove();
  });

  backdrop.querySelector('#dm-cancel-action').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
});

window.addEventListener('beforeunload', () => { clearInterval(expiryTimer); unsubscribe(); });
