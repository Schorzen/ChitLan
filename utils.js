// ChitLan — small shared helpers used by more than one page.

export function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initialsFrom(name = '?') {
  return name.trim().charAt(0).toUpperCase() || '?';
}

// Renders an <img> if photoURL exists, otherwise a letter-avatar <div>.
export function avatarHtml(photoURL, name, sizeClass = 'avatar-md') {
  if (photoURL) {
    return `<img class="${sizeClass}" src="${escapeHtml(photoURL)}" alt="${escapeHtml(name)}'s avatar" referrerpolicy="no-referrer">`;
  }
  return `<div class="${sizeClass}" style="display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--purple-dark);background:var(--purple-light);">${escapeHtml(initialsFrom(name))}</div>`;
}

export function formatClockTime(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit',
  }).format(date);
}

// Converts a Firestore Timestamp (or null, while serverTimestamp() resolves)
// into a JS Date, falling back to "now" for optimistic UI.
export function toJsDate(ts) {
  return ts && typeof ts.toDate === 'function' ? ts.toDate() : new Date();
}

let toastTimer = null;
export function showToast(message, duration = 2600) {
  let el = document.getElementById('chitlan-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chitlan-toast';
    el.className = 'toast hidden';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), duration);
}

export function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Dismisses the full-page loading overlay (see the `is-loading` class added
// to <body> in every protected page's HTML). Call once the page's initial
// content is actually ready to show — this is what makes page loads/refreshes
// show a spinner instead of a flash of half-populated placeholder content.
export function hidePageLoader() {
  document.body.classList.remove('is-loading');
}
