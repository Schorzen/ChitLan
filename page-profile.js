import { requireVerifiedUser, signOutUser } from './auth.js';
import { renderTabBar } from './nav.js';
import { icon } from './icons.js';
import { updateProfileFields, uploadProfilePhoto } from './profile.js';
import { getBlockedUsersDetails, unblockUserId } from './chat.js';
import { BADGE_LABELS } from './streaks.js';
import { avatarHtml, escapeHtml, showToast, hidePageLoader } from './utils.js';

const { user, profile } = await requireVerifiedUser();
document.getElementById('tab-bar-mount').innerHTML = renderTabBar('profile', { isAdmin: profile.isAdmin });
document.getElementById('signout-btn').innerHTML = icon('logout', { size: 18 });
document.getElementById('change-photo-btn').innerHTML = icon('camera', { size: 15 });

function renderAvatar() {
  document.getElementById('avatar-wrap').innerHTML = avatarHtml(profile.photoURL, profile.username, 'avatar-lg');
}
renderAvatar();

document.getElementById('streak-chip-profile').innerHTML = `${icon('flame', { size: 14 })} <span class="mono">${profile.streak?.count || 0}-day streak</span>`;

function renderBadges() {
  const el = document.getElementById('badges-list-profile');
  const badges = profile.badges || [];
  el.innerHTML = badges.length
    ? badges.map((id) => `<span class="badge-chip">${icon('star', { size: 12 })} ${escapeHtml(BADGE_LABELS[id] || id)}</span>`).join('')
    : `<p class="text-muted mb-0">No badges yet.</p>`;
}
renderBadges();

document.getElementById('username-input').value = profile.username || '';
document.getElementById('birthday-input').value = profile.birthday || '';
document.getElementById('gender-input').value = profile.gender || '';
document.getElementById('bio-input').value = profile.bio || '';

async function loadBlockedUsers() {
  const listEl = document.getElementById('blocked-users-list');
  const blockedIds = profile.blockedUsers || [];
  if (!blockedIds.length) {
    listEl.innerHTML = `<p class="text-muted mb-0">You haven't blocked anyone.</p>`;
    return;
  }
  let details;
  try {
    details = await getBlockedUsersDetails(blockedIds);
  } catch (e) {
    listEl.innerHTML = `<p class="text-muted mb-0">Couldn't load your blocked list right now.</p>`;
    return;
  }
  listEl.innerHTML = details.map((u) => `
    <div class="flex-between" style="padding: 10px 0; border-bottom: 1px solid var(--foam);">
      <div class="flex-row">
        ${avatarHtml(u.photoURL, u.username, 'msg-avatar')}
        <span style="font-weight:700;">${escapeHtml(u.username || 'Unknown user')}</span>
      </div>
      <button class="btn btn-sm btn-secondary" data-uid="${u.id}">Unblock</button>
    </div>`).join('');

  listEl.querySelectorAll('button[data-uid]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.setAttribute('disabled', 'true');
      try {
        await unblockUserId(user.uid, btn.dataset.uid);
        profile.blockedUsers = (profile.blockedUsers || []).filter((id) => id !== btn.dataset.uid);
        showToast('Unblocked.');
        loadBlockedUsers();
      } catch (e) {
        showToast("Couldn't unblock — try again.");
        btn.removeAttribute('disabled');
      }
    });
  });
}
loadBlockedUsers();

hidePageLoader();

document.getElementById('signout-btn').addEventListener('click', async () => {
  await signOutUser();
  window.location.href = 'index.html';
});

document.getElementById('change-photo-btn').addEventListener('click', () => {
  document.getElementById('photo-input').click();
});

document.getElementById('photo-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('Please choose an image under 5MB.');
    return;
  }
  showToast('Uploading photo…');
  try {
    const url = await uploadProfilePhoto(user.uid, file);
    profile.photoURL = url;
    renderAvatar();
    showToast('Photo updated!');
  } catch (err) {
    showToast("Couldn't upload photo — try again.");
  }
});

document.getElementById('save-btn').addEventListener('click', async () => {
  const btn = document.getElementById('save-btn');
  btn.setAttribute('disabled', 'true');
  try {
    await updateProfileFields(user.uid, {
      username: document.getElementById('username-input').value,
      birthday: document.getElementById('birthday-input').value,
      gender: document.getElementById('gender-input').value,
      bio: document.getElementById('bio-input').value,
    });
    showToast('Profile saved.');
  } catch (err) {
    showToast("Couldn't save — try again.");
  } finally {
    btn.removeAttribute('disabled');
  }
});
