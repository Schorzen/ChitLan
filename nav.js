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
        <a class="tab-item tab-fab ${t.id === activeId ? 'active' : ''}" href="${t.href}">
          <span class="fab-circle">${icon(t.iconName, { size: 21 })}</span>
          <span>${t.label}</span>
        </a>`;
    }
    return `
      <a class="tab-item ${t.id === activeId ? 'active' : ''}" href="${t.href}">
        ${icon(t.iconName, { size: 20 })}
        <span>${t.label}</span>
      </a>`;
  }).join('');

  return `<nav class="tab-bar" aria-label="Primary">${items}</nav>`;
}
