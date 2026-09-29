import { requireVerifiedUser } from './auth.js';
import { renderTabBar, setTabBadge } from './nav.js';
import { icon } from './icons.js';
import { listMyConversations, hasUnread } from './pm.js';
import { avatarHtml, escapeHtml, timeAgo, toJsDate, hidePageLoader } from './utils.js';

const { user, profile } = await requireVerifiedUser();

document.getElementById('tab-bar-mount').innerHTML = renderTabBar('messages', { isAdmin: profile.isAdmin });
hidePageLoader();

const listEl = document.getElementById('dm-list');
const blockedSet = new Set(profile.blockedUsers || []);

function otherParticipant(conversation) {
  const otherUid = conversation.participants.find((id) => id !== user.uid);
  const info = conversation.participantInfo?.[otherUid] || {};
  return { uid: otherUid, ...info };
}

function conversationRowHTML(conversation) {
  const other = otherParticipant(conversation);
  const messages = conversation.messages || [];
  const last = messages[messages.length - 1];
  const preview = last ? (last.senderId === user.uid ? `You: ${last.text}` : last.text) : '';
  const unread = hasUnread(conversation, user.uid);
  return `
    <a class="dm-row ${unread ? 'unread' : ''}" href="dm.html?with=${encodeURIComponent(other.uid)}">
      ${avatarHtml(other.photoURL, other.username, 'avatar-md')}
      <div class="dm-row-content">
        <div class="flex-between">
          <span class="dm-row-name">${escapeHtml(other.username || 'ChitLaner')}</span>
          <span class="dm-row-time mono">${last ? timeAgo(toJsDate(last.createdAt)) : ''}</span>
        </div>
        <p class="dm-row-preview">${escapeHtml(preview)}</p>
      </div>
      ${unread ? '<span class="dm-unread-dot" aria-hidden="true"></span>' : ''}
    </a>`;
}

listMyConversations(user.uid, (conversations) => {
  // Someone I've since blocked can still technically have an old
  // conversation doc around until it expires — just don't show it.
  const visible = conversations.filter((c) => !blockedSet.has(otherParticipant(c).uid));

  listEl.innerHTML = visible.length
    ? visible.map(conversationRowHTML).join('')
    : `<div class="empty-state">${icon('mail', { size: 40 })}<p>No private messages yet. Start one from someone's message in Public Chat or RandomChat.</p></div>`;

  setTabBadge('messages', visible.filter((c) => hasUnread(c, user.uid)).length);
}, (err) => {
  const needsIndex = /index/i.test(err?.message || '');
  listEl.innerHTML = `<div class="empty-state">${icon('warning', { size: 40 })}<p>${
    needsIndex
      ? "Messages needs a one-time database index. See README.md, step 2, then reload."
      : "Couldn't load your messages. Check your connection, and that the updated Firestore rules are published."
  }</p></div>`;
});
