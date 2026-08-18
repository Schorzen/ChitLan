import { requireVerifiedUser } from './auth.js';
import { renderTabBar } from './nav.js';
import { icon } from './icons.js';
import { startPresenceHeartbeat, getOnlineCount } from './presence.js';
import { checkInStreak, BADGE_LABELS } from './streaks.js';
import { getDailyQuestion } from './daily-question.js';
import { listTrendingTopics } from './topics.js';
import { pushNotification, listenToNotifications, markAllRead } from './notifications.js';
import { escapeHtml, showToast } from './utils.js';

const { user, profile } = await requireVerifiedUser();

document.getElementById('tab-bar-mount').innerHTML = renderTabBar('home', { isAdmin: profile.isAdmin });
document.getElementById('bell-btn').innerHTML = icon('bell', { size: 20 });
document.getElementById('greeting-name').textContent = profile.username || 'ChitLaner';

document.getElementById('tile-chat').innerHTML = icon('chat', { size: 22 });
document.getElementById('tile-random').innerHTML = icon('shuffle', { size: 22 });
document.getElementById('tile-profile').innerHTML = icon('user', { size: 22 });
document.getElementById('tile-question').innerHTML = icon('edit', { size: 22 });
document.getElementById('tile-trending').innerHTML = icon('megaphone', { size: 22 });
document.getElementById('tile-badges').innerHTML = icon('star', { size: 22 });

startPresenceHeartbeat(user.uid);

async function refreshOnlineCount() {
  const count = await getOnlineCount();
  document.getElementById('online-count').textContent = `${count} online`;
}
refreshOnlineCount();
setInterval(refreshOnlineCount, 30000);

// ---- Streak ----
function renderStreakChip(count) {
  document.getElementById('streak-chip').innerHTML = `${icon('flame', { size: 14 })} <span class="mono">${count}</span>`;
  document.getElementById('streak-readout').textContent = `${count} ${count === 1 ? 'day' : 'days'}`;
}
renderStreakChip(profile.streak?.count || 0);

checkInStreak(user.uid, profile).then(({ count, newBadges }) => {
  renderStreakChip(count);
  if (newBadges.length) {
    renderBadges([...(profile.badges || []), ...newBadges.map((b) => b.id)]);
    newBadges.forEach((b) => {
      showToast(`New badge earned: ${b.label}!`);
      pushNotification(user.uid, { title: 'New badge!', body: `You earned "${b.label}".` });
    });
  }
});

// ---- Badges ----
function renderBadges(badgeIds) {
  const el = document.getElementById('badges-list');
  if (!badgeIds.length) {
    el.innerHTML = `<p class="text-muted mb-0">No badges yet — chat daily to earn your first one.</p>`;
    return;
  }
  el.innerHTML = badgeIds.map((id) => `
    <span class="badge-chip">${icon('star', { size: 13 })} ${escapeHtml(BADGE_LABELS[id] || id)}</span>
  `).join('');
}
renderBadges(profile.badges || []);

// ---- Daily Question ----
getDailyQuestion().then(({ question }) => {
  document.getElementById('daily-question-text').textContent = question;
});

// ---- Trending Topics ----
listTrendingTopics().then((topics) => {
  if (!topics.length) return;
  document.getElementById('trending-list').innerHTML = topics.map((t, i) => `
    <div class="trend-row">
      <span class="trend-rank mono">${String(i + 1).padStart(2, '0')}</span>
      <span class="trend-title">${escapeHtml(t.title)}</span>
    </div>
  `).join('');
});

// ---- Notifications drawer ----
let latestNotifications = [];
listenToNotifications(user.uid, (items) => {
  latestNotifications = items;
  const unreadCount = items.filter((n) => !n.read).length;
  const bell = document.getElementById('bell-btn');
  bell.innerHTML = icon('bell', { size: 20 });
  if (unreadCount > 0) {
    const dot = document.createElement('span');
    dot.style.cssText = 'position:absolute;top:8px;right:10px;width:8px;height:8px;border-radius:50%;background:var(--danger);border:2px solid var(--white);';
    bell.style.position = 'relative';
    bell.appendChild(dot);
  }
});

document.getElementById('bell-btn').addEventListener('click', () => {
  const backdrop = document.createElement('div');
  backdrop.className = 'msg-menu-backdrop';
  const items = latestNotifications.length
    ? latestNotifications.map((n) => `
        <div style="padding:12px 4px;border-bottom:1px solid var(--foam);">
          <div style="font-weight:700;font-size:14px;">${escapeHtml(n.title)}</div>
          <div style="font-size:13px;color:var(--ink-soft);">${escapeHtml(n.body)}</div>
        </div>`).join('')
    : `<p class="text-muted">No notifications yet.</p>`;
  backdrop.innerHTML = `
    <div class="msg-menu">
      <h3>Notifications</h3>
      ${items}
      <button style="margin-top:8px;color:var(--net);">${icon('close', { size: 16 })} Close</button>
    </div>`;
  document.body.appendChild(backdrop);
  markAllRead(user.uid, latestNotifications);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop || e.target.closest('button')) backdrop.remove();
  });
});
