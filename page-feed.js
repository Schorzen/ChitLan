import { requireVerifiedUser } from './auth.js';
import { renderTabBar } from './nav.js';
import { icon } from './icons.js';
import { createPost, listenToFeed, listenToReplies, addReply, reportPost, POST_TYPES } from './feed.js';
import { escapeHtml, avatarHtml, timeAgo, toJsDate, showToast, hidePageLoader } from './utils.js';

const { user, profile } = await requireVerifiedUser();

document.getElementById('tab-bar-mount').innerHTML = renderTabBar(null, { isAdmin: profile.isAdmin });
document.getElementById('new-post-fab').innerHTML = icon('plus', { size: 24 });
hidePageLoader();

let posts = [];
let currentFilter = 'all';
const expandedPosts = new Map(); // postId -> { unsub }

function postCardHTML(post) {
  const mine = post.authorId === user.uid;
  const typeLabel = POST_TYPES.find((t) => t.id === post.type)?.label || 'Question';
  return `
    <div class="feed-post-card" data-post-id="${post.id}">
      <div class="feed-post-header">
        ${avatarHtml(post.authorPhoto, post.authorName, 'msg-avatar')}
        <div class="feed-post-author">
          <div class="feed-post-name">${escapeHtml(post.authorName)}</div>
          <div class="feed-post-meta">
            <span class="${post.authorIsLocal ? 'local-tag' : 'visiting-tag'}">${post.authorIsLocal ? 'Local' : 'Visiting'}</span>
            <span>${timeAgo(toJsDate(post.createdAt))}</span>
          </div>
        </div>
        <span class="feed-post-type-tag ${post.type}">${escapeHtml(typeLabel)}</span>
      </div>
      <p class="feed-post-text">${escapeHtml(post.text)}</p>
      <div class="feed-post-footer">
        <button class="feed-reply-toggle" data-action="toggle-replies">${icon('chat', { size: 14 })} ${post.replyCount || 0} ${post.replyCount === 1 ? 'reply' : 'replies'}</button>
        ${!mine ? `<button class="feed-report-btn" data-action="report" aria-label="Report post">${icon('flag', { size: 14 })}</button>` : ''}
      </div>
      <div class="feed-replies-list hidden" id="replies-${post.id}"></div>
    </div>`;
}

function renderFeed() {
  const listEl = document.getElementById('feed-list');
  const filtered = currentFilter === 'all' ? posts : posts.filter((p) => p.type === currentFilter);
  if (!filtered.length) {
    listEl.innerHTML = `<div class="empty-state">${icon('feed', { size: 40 })}<p>Nothing here yet — be the first to post!</p></div>`;
    return;
  }
  listEl.innerHTML = filtered.map(postCardHTML).join('');
}

listenToFeed((updatedPosts) => {
  posts = updatedPosts;
  renderFeed();
});

document.querySelectorAll('.feed-filter-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    currentFilter = tab.dataset.filter;
    document.querySelectorAll('.feed-filter-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    renderFeed();
  });
});

function renderReplies(postId, replies) {
  const repliesEl = document.getElementById(`replies-${postId}`);
  if (!repliesEl) return; // collapsed since the listener fired
  const existingInput = repliesEl.querySelector(`[data-reply-input="${postId}"]`);
  const preservedValue = existingInput ? existingInput.value : '';

  const list = replies.map((r) => `
    <div class="feed-reply-item">
      ${avatarHtml(r.authorPhoto, r.authorName, 'msg-avatar')}
      <div class="feed-reply-body">
        <div class="feed-reply-name">${escapeHtml(r.authorName)} <span class="${r.authorIsLocal ? 'local-tag' : 'visiting-tag'}" style="font-size:8px;">${r.authorIsLocal ? 'Local' : 'Visiting'}</span></div>
        <div class="feed-reply-text">${escapeHtml(r.text)}</div>
      </div>
    </div>`).join('');

  repliesEl.innerHTML = `
    ${list || `<p class="text-muted mb-0" style="font-size:13px;">No replies yet.</p>`}
    <div class="feed-reply-input-row">
      <input type="text" placeholder="Write a reply…" maxlength="300" data-reply-input="${postId}">
      <button class="send-btn" style="width:38px;height:38px;" data-reply-send="${postId}">${icon('send', { size: 15 })}</button>
    </div>`;

  const input = repliesEl.querySelector(`[data-reply-input="${postId}"]`);
  input.value = preservedValue;
  const sendBtn = repliesEl.querySelector(`[data-reply-send="${postId}"]`);

  let sending = false;
  const send = async () => {
    const text = input.value;
    if (!text.trim() || sending) return;
    sending = true;
    input.value = '';
    try {
      await addReply(postId, {
        uid: user.uid, name: profile.username, photoURL: profile.photoURL, isLocal: profile.verifiedLocation, text,
      });
    } catch (e) {
      showToast("Couldn't send reply — try again.");
    } finally {
      sending = false;
    }
  };
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}

function toggleReplies(postId, card) {
  const repliesEl = card.querySelector(`#replies-${postId}`);
  if (expandedPosts.has(postId)) {
    expandedPosts.get(postId).unsub();
    expandedPosts.delete(postId);
    repliesEl.classList.add('hidden');
    repliesEl.innerHTML = '';
  } else {
    repliesEl.classList.remove('hidden');
    repliesEl.innerHTML = `<div class="spinner" style="margin:0 auto;"></div>`;
    const unsub = listenToReplies(postId, (replies) => renderReplies(postId, replies));
    expandedPosts.set(postId, { unsub });
  }
}

function handleReportPost(post) {
  const backdrop = document.createElement('div');
  backdrop.className = 'msg-menu-backdrop';
  backdrop.innerHTML = `
    <div class="msg-menu">
      <h3>${escapeHtml(post.authorName)}</h3>
      <button id="report-post-action">${icon('flag', { size: 18 })} Report this post</button>
      <button id="cancel-report-action">${icon('close', { size: 18 })} Cancel</button>
    </div>`;
  document.body.appendChild(backdrop);
  backdrop.querySelector('#report-post-action').addEventListener('click', async () => {
    await reportPost({ post, reportedBy: user.uid, reason: 'inappropriate' });
    showToast('Reported. Thanks for flagging it.');
    backdrop.remove();
  });
  backdrop.querySelector('#cancel-report-action').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}

document.getElementById('feed-list').addEventListener('click', (e) => {
  const card = e.target.closest('.feed-post-card');
  if (!card) return;
  const postId = card.dataset.postId;
  const post = posts.find((p) => p.id === postId);
  if (!post) return;

  if (e.target.closest('[data-action="toggle-replies"]')) {
    toggleReplies(postId, card);
  } else if (e.target.closest('[data-action="report"]')) {
    handleReportPost(post);
  }
});

let selectedType = 'question';
function openComposer() {
  selectedType = 'question';
  const backdrop = document.createElement('div');
  backdrop.className = 'msg-menu-backdrop';
  backdrop.innerHTML = `
    <div class="msg-menu">
      <h3>New post</h3>
      <div class="feed-type-toggle">
        <button class="feed-type-option question active" data-type="question">Question</button>
        <button class="feed-type-option chismis" data-type="chismis">Chismis</button>
      </div>
      <textarea class="feed-composer-textarea" id="composer-text" maxlength="500" placeholder="What's up?"></textarea>
      <button class="btn btn-primary" id="composer-post-btn">Post</button>
    </div>`;
  document.body.appendChild(backdrop);

  backdrop.querySelectorAll('.feed-type-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedType = btn.dataset.type;
      backdrop.querySelectorAll('.feed-type-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  backdrop.querySelector('#composer-post-btn').addEventListener('click', async () => {
    const textEl = document.getElementById('composer-text');
    const text = textEl.value;
    if (!text.trim()) return;
    const btn = backdrop.querySelector('#composer-post-btn');
    btn.setAttribute('disabled', 'true');
    try {
      await createPost({
        uid: user.uid, name: profile.username, photoURL: profile.photoURL,
        isLocal: profile.verifiedLocation, type: selectedType, text,
      });
      backdrop.remove();
      showToast('Posted!');
    } catch (e) {
      showToast("Couldn't post — try again.");
      btn.removeAttribute('disabled');
    }
  });

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });
}
document.getElementById('new-post-fab').addEventListener('click', openComposer);
