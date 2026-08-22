import { requireVerifiedUser } from './auth.js';
import { renderTabBar } from './nav.js';
import {
  getOpenReports, setReportStatus, setUserBlocked, searchUsers, getUserById,
  getCommunityStats, setDailyQuestion, listTrendingTopics, addTrendingTopic, deleteTrendingTopic,
  listBlockedUsers, getReportCountForUser,
} from './admin.js';
import { icon } from './icons.js';
import { escapeHtml, showToast, timeAgo, toJsDate, hidePageLoader } from './utils.js';

const { user, profile } = await requireVerifiedUser();

if (!profile.isAdmin) {
  window.location.href = 'home.html';
} else {
  initAdminPage();
}

function manilaDateKey() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function initAdminPage() {
  document.getElementById('tab-bar-mount').innerHTML = renderTabBar('admin', { isAdmin: true });
  hidePageLoader();

  loadStats();
  loadReports();
  loadBlockedUsers();
  loadTopics();

  document.getElementById('user-search-btn').addEventListener('click', runUserSearch);
  document.getElementById('set-daily-q-btn').addEventListener('click', submitDailyQuestion);
  document.getElementById('add-topic-btn').addEventListener('click', submitNewTopic);
}

async function loadStats() {
  try {
    const stats = await getCommunityStats();
    document.getElementById('stat-users').textContent = stats.totalUsers;
    document.getElementById('stat-messages').textContent = stats.totalMessages;
  } catch (e) {
    document.getElementById('stat-users').textContent = '—';
    document.getElementById('stat-messages').textContent = '—';
  }
}

// Shared row renderer for anywhere we show a user with a Block/Unblock toggle
// (both the blocked-users list and the search results use this).
function renderUserRow(u) {
  const statusLabel = u.isBlocked ? 'Blocked' : 'Active';
  const subtitle = u.email ? `${escapeHtml(u.email)} · ${statusLabel}` : statusLabel;
  return `
    <div class="flex-between" style="padding: 10px 0; border-bottom: 1px solid var(--foam);">
      <div>
        <div style="font-weight:700;">${escapeHtml(u.username || 'Unknown')}</div>
        <div class="text-muted">${subtitle}</div>
      </div>
      <button class="btn btn-sm ${u.isBlocked ? 'btn-secondary' : 'btn-danger'}" data-uid="${u.id}" data-blocked="${u.isBlocked}">
        ${u.isBlocked ? 'Unblock' : 'Block'}
      </button>
    </div>`;
}

function wireUserRowButtons(container, onToggled) {
  container.querySelectorAll('button[data-uid]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nowBlocked = btn.dataset.blocked === 'true';
      await setUserBlocked(btn.dataset.uid, !nowBlocked);
      showToast(nowBlocked ? 'User unblocked.' : 'User blocked.');
      onToggled();
    });
  });
}

async function loadReports() {
  const listEl = document.getElementById('reports-list');
  let reports;
  try {
    reports = await getOpenReports();
  } catch (e) {
    listEl.innerHTML = `<p class="text-muted mb-0">Couldn't load reports right now. Try reloading the page.</p>`;
    return;
  }
  if (!reports.length) {
    listEl.innerHTML = `<p class="text-muted mb-0">No open reports. Nice and quiet.</p>`;
    return;
  }

  // Look up each reported user's name + their all-time report count once per
  // unique user, even if the same person shows up in multiple open reports.
  const uniqueUids = [...new Set(reports.map((r) => r.reportedUser))];
  const infoByUid = {};
  await Promise.all(uniqueUids.map(async (uid) => {
    const [userDoc, count] = await Promise.all([getUserById(uid), getReportCountForUser(uid)]);
    infoByUid[uid] = { username: userDoc?.username || 'Unknown user', reportCount: count };
  }));

  const withUsers = reports.map((r) => ({
    ...r,
    reportedUsername: infoByUid[r.reportedUser]?.username || 'Unknown user',
    reportCount: infoByUid[r.reportedUser]?.reportCount || 1,
  }));

  listEl.innerHTML = withUsers.map((r) => `
    <div class="card-tight" style="border:1px solid var(--net-light); border-radius: var(--radius-md); margin-bottom: var(--space-3);">
      <div class="flex-between">
        <div class="flex-row">
          <strong>${escapeHtml(r.reportedUsername)}</strong>
          ${r.reportCount > 1 ? `<span class="badge-chip" style="margin:0;">${r.reportCount}x reported</span>` : ''}
        </div>
        <span class="text-muted">${timeAgo(toJsDate(r.createdAt))}</span>
      </div>
      ${r.messageText ? `<p class="mono" style="font-size:13px;">&quot;${escapeHtml(r.messageText)}&quot;</p>` : ''}
      <p class="text-muted mb-0">Reason: ${escapeHtml(r.reason)} · Type: ${escapeHtml(r.type)}</p>
      <div class="flex-row mt-2">
        <button class="btn btn-sm btn-danger" data-action="block" data-uid="${r.reportedUser}" data-id="${r.id}">Block user</button>
        <button class="btn btn-sm btn-outline" data-action="dismiss" data-id="${r.id}">Dismiss</button>
        <button class="btn btn-sm btn-secondary" data-action="resolve" data-id="${r.id}">Resolve</button>
      </div>
    </div>`).join('');

  listEl.querySelectorAll('button[data-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { action, uid, id } = btn.dataset;
      if (action === 'block') {
        await setUserBlocked(uid, true);
        await setReportStatus(id, 'resolved');
        showToast('User blocked.');
      } else if (action === 'dismiss') {
        await setReportStatus(id, 'dismissed');
        showToast('Report dismissed.');
      } else if (action === 'resolve') {
        await setReportStatus(id, 'resolved');
        showToast('Report resolved.');
      }
      loadReports();
      loadStats();
      loadBlockedUsers();
    });
  });
}

async function loadBlockedUsers() {
  const listEl = document.getElementById('blocked-users-list');
  let users;
  try {
    users = await listBlockedUsers();
  } catch (e) {
    listEl.innerHTML = `<p class="text-muted mb-0">Couldn't load blocked users right now.</p>`;
    return;
  }
  if (!users.length) {
    listEl.innerHTML = `<p class="text-muted mb-0">Nobody's currently blocked.</p>`;
    return;
  }
  listEl.innerHTML = users.map((u) => renderUserRow(u)).join('');
  wireUserRowButtons(listEl, () => { loadBlockedUsers(); loadStats(); });
}

async function runUserSearch() {
  const q = document.getElementById('user-search-input').value.trim();
  const resultsEl = document.getElementById('user-search-results');
  if (!q) return;
  resultsEl.innerHTML = `<div class="spinner" style="margin:0 auto;"></div>`;
  let results;
  try {
    results = await searchUsers(q);
  } catch (e) {
    resultsEl.innerHTML = `<p class="text-muted mb-0">Search failed — try again.</p>`;
    return;
  }
  if (!results.length) {
    resultsEl.innerHTML = `<p class="text-muted mb-0">No user found with that exact username or email.</p>`;
    return;
  }
  resultsEl.innerHTML = results.map((u) => renderUserRow(u)).join('');
  wireUserRowButtons(resultsEl, () => { runUserSearch(); loadBlockedUsers(); loadStats(); });
}

async function submitDailyQuestion() {
  const input = document.getElementById('daily-q-input');
  const text = input.value.trim();
  if (!text) return;
  await setDailyQuestion(manilaDateKey(), text);
  showToast("Today's question is set.");
  input.value = '';
}

async function loadTopics() {
  const listEl = document.getElementById('topics-admin-list');
  let topics;
  try {
    topics = await listTrendingTopics();
  } catch (e) {
    listEl.innerHTML = `<p class="text-muted mb-0">Couldn't load topics right now.</p>`;
    return;
  }
  listEl.innerHTML = topics.length
    ? topics.map((t) => `
        <div class="flex-between" style="padding: 8px 0; border-bottom: 1px solid var(--foam);">
          <span>${escapeHtml(t.title)}</span>
          <button class="btn-icon" data-id="${t.id}" aria-label="Delete topic">${icon('trash', { size: 14 })}</button>
        </div>`).join('')
    : `<p class="text-muted mb-0">No trending topics set yet.</p>`;

  listEl.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await deleteTrendingTopic(btn.dataset.id);
      loadTopics();
    });
  });
}

async function submitNewTopic() {
  const input = document.getElementById('topic-input');
  const title = input.value.trim();
  if (!title) return;
  await addTrendingTopic(title);
  input.value = '';
  loadTopics();
}
