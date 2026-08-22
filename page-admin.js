import { requireVerifiedUser } from './auth.js';
import { renderTabBar } from './nav.js';
import {
  getOpenReports, setReportStatus, setUserBlocked, findUserByUsername, getUserById,
  getCommunityStats, setDailyQuestion, listTrendingTopics, addTrendingTopic, deleteTrendingTopic,
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
  const withUsers = await Promise.all(reports.map(async (r) => ({
    ...r, reportedUsername: (await getUserById(r.reportedUser))?.username || 'Unknown user',
  })));

  listEl.innerHTML = withUsers.map((r) => `
    <div class="card-tight" style="border:1px solid var(--net-light); border-radius: var(--radius-md); margin-bottom: var(--space-3);">
      <div class="flex-between">
        <strong>${escapeHtml(r.reportedUsername)}</strong>
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
    });
  });
}

async function runUserSearch() {
  const q = document.getElementById('user-search-input').value.trim();
  const resultsEl = document.getElementById('user-search-results');
  if (!q) return;
  resultsEl.innerHTML = `<div class="spinner" style="margin:0 auto;"></div>`;
  let results;
  try {
    results = await findUserByUsername(q);
  } catch (e) {
    resultsEl.innerHTML = `<p class="text-muted mb-0">Search failed — try again.</p>`;
    return;
  }
  if (!results.length) {
    resultsEl.innerHTML = `<p class="text-muted mb-0">No user found with that exact username.</p>`;
    return;
  }
  resultsEl.innerHTML = results.map((u) => `
    <div class="flex-between" style="padding: 10px 0; border-bottom: 1px solid var(--foam);">
      <div>
        <div style="font-weight:700;">${escapeHtml(u.username)}</div>
        <div class="text-muted">${u.isBlocked ? 'Blocked' : 'Active'}</div>
      </div>
      <button class="btn btn-sm ${u.isBlocked ? 'btn-secondary' : 'btn-danger'}" data-uid="${u.id}" data-blocked="${u.isBlocked}">
        ${u.isBlocked ? 'Unblock' : 'Block'}
      </button>
    </div>`).join('');

  resultsEl.querySelectorAll('button[data-uid]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const nowBlocked = btn.dataset.blocked === 'true';
      await setUserBlocked(btn.dataset.uid, !nowBlocked);
      showToast(nowBlocked ? 'User unblocked.' : 'User blocked.');
      runUserSearch();
    });
  });
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
