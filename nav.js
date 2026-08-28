// ChitLan — bottom tab bar. Restyled after Maya's "overlaid shortcuts"
// bottom bar: a floating pill rather than an edge-to-edge strip, with
// RandomChat raised as a circular FAB in the middle (the app's answer to
// Maya's central "Pay with QR" shortcut).

import { icon } from './icons.js';

const TABS = [
  { id: 'home', href: 'home.html', label: 'Home', iconName: 'home' },
  { id: 'chat', href: 'chat.html', label: 'Chat', iconName: 'chat' },
  { id: 'random', href: 'random.html', label: 'Random', iconName: 'shuffle', fab: true },
  { id: 'profile', href: 'profile.html', label: 'Profile', iconName: 'user' },
];

export function renderTabBar(activeId, { isAdmin = false } = {}) {
  const tabs = isAdmin
    ? [...TABS, { id: 'admin', href: 'admin.html', label: 'Admin', iconName: 'shield' }]
    : TABS;

  const items = tabs.map((t) => {
    if (t.fab) {
      return `
        <a class="tab-item tab-fab ${t.id === activeId ? 'active' : ''}" href="${t.href}" data-tab-id="${t.id}">
          <span class="fab-circle">${icon(t.iconName, { size: 21 })}</span>
          <span>${t.label}</span>
        </a>`;
    }
    return `
      <a class="tab-item ${t.id === activeId ? 'active' : ''}" href="${t.href}" data-tab-id="${t.id}">
        ${icon(t.iconName, { size: 20 })}
        <span>${t.label}</span>
      </a>`;
  }).join('');

  return `<nav class="tab-bar" aria-label="Primary">${items}</nav>`;
}

// Sets (or clears) a small unread-count badge on a tab. Call after
// renderTabBar() has been inserted into the DOM. count <= 0 removes the
// badge; anything over 99 displays as "99+".
export function setTabBadge(tabId, count) {
  const tabItem = document.querySelector(`.tab-item[data-tab-id="${tabId}"]`);
  if (!tabItem) return;
  let badge = tabItem.querySelector('.tab-badge');
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'tab-badge';
      tabItem.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
  } else if (badge) {
    badge.remove();
  }
}
