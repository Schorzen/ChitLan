// ChitLan — inline SVG icon set.
// All icons are line-style, stroke="currentColor", so they inherit color from CSS.
// Usage: import { icon } from './icons.js';  el.innerHTML = icon('home');

const ICONS = {
  home: `<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>`,
  chat: `<path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.1-3.5A7.96 7.96 0 0 1 4 12Z"/>`,
  shuffle: `<path d="M4 7h3.5c2 0 3 1 4.5 3M4 17h3.5c2 0 3-1 4.5-3M17 7h3M17 17h3"/><path d="m17.5 4.5 3 2.5-3 2.5M17.5 14.5l3 2.5-3 2.5"/><path d="M13 10l1.2 1.8M13 14l1.2-1.8"/>`,
  user: `<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>`,
  shield: `<path d="M12 3.5 5 6v6c0 4.5 3 7.5 7 8.5 4-1 7-4 7-8.5V6l-7-2.5Z"/><path d="m9 12 2 2 4-4"/>`,
  flag: `<path d="M6 4v16"/><path d="M6 5h9l-1.5 3L15 11H6"/>`,
  block: `<circle cx="12" cy="12" r="8"/><path d="m6.5 6.5 11 11"/>`,
  bell: `<path d="M7 9a5 5 0 0 1 10 0v5l1.5 3h-13L7 14Z"/><path d="M10 19.5a2 2 0 0 0 4 0"/>`,
  send: `<path d="M4.5 12 19 5l-4.5 14-3-6-6.5-1Z"/>`,
  flame: `<path d="M12 3c1 3-3 4-3 8a4 4 0 0 0 8 0c0-1.5-.7-2-1-3 1.2.6 2 2 2 4a5 5 0 0 1-10 0c0-4 2-6 4-9Z"/>`,
  star: `<path d="m12 3.5 2.5 5.3 5.8.8-4.2 4.1 1 5.8L12 16.7l-5.1 2.8 1-5.8-4.2-4.1 5.8-.8Z"/>`,
  pin: `<path d="M12 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>`,
  logout: `<path d="M14 4h-3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M18 12H8m10 0-3-3m3 3-3 3"/>`,
  camera: `<path d="M4 8h3l1.5-2h7L17 8h3v11H4Z"/><circle cx="12" cy="13" r="3.2"/>`,
  chevronRight: `<path d="m9 5 7 7-7 7"/>`,
  chevronLeft: `<path d="m15 5-7 7 7 7"/>`,
  close: `<path d="m6 6 12 12M18 6 6 18"/>`,
  check: `<path d="m5 13 4 4 10-10"/>`,
  trash: `<path d="M5 7h14M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/>`,
  warning: `<path d="M12 4 2.5 20h19L12 4Z"/><path d="M12 10.5v4"/><circle cx="12" cy="17.2" r="0.4" fill="currentColor"/>`,
  google: `G`,
  wave: `<path d="M2 12c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.5 3 5 3"/>`,
  eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/>`,
  refresh: `<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4M6 21v-4h4"/>`,
  megaphone: `<path d="M3 10v4h3l6 4V6l-6 4H3Z"/><path d="M15 9a4 4 0 0 1 0 6"/>`,
  edit: `<path d="M4 20h4L18.5 9.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 15.5V20Z"/>`,
  smile: `<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="0.9" fill="currentColor"/><circle cx="15" cy="10" r="0.9" fill="currentColor"/><path d="M8 14.5c1 1.5 2.5 2.5 4 2.5s3-1 4-2.5"/>`,
  reply: `<path d="M9 17 4 12l5-5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/>`,
  music: `<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>`,
  food: `<path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3c0 1-1 1-1 2s1 1 1 2M12 3c0 1-1 1-1 2s1 1 1 2"/>`,
  briefcase: `<rect x="3" y="7" width="18" height="12" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>`,
  heart: `<path d="M12 20s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 5c-2.5 4.5-9.5 9-9.5 9Z"/>`,
  feed: `<rect x="4" y="5" width="16" height="4" rx="1"/><rect x="4" y="11" width="16" height="4" rx="1"/><rect x="4" y="17" width="10" height="4" rx="1"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
};

export function icon(name, { size = 20, strokeWidth = 1.8, className = '' } = {}) {
  const body = ICONS[name] || ICONS.close;
  if (name === 'google') {
    // Multi-color Google "G" mark (filled, not stroked)
    return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2v6h7.6c4.4-4.1 6.9-10.1 6.9-17.7Z"/>
      <path fill="#34A853" d="M24 47c6.3 0 11.6-2.1 15.5-5.7l-7.6-6c-2.1 1.4-4.8 2.3-7.9 2.3-6.1 0-11.2-4.1-13.1-9.6H3v6.1C6.9 41.9 14.8 47 24 47Z"/>
      <path fill="#FBBC05" d="M10.9 27.9A14.6 14.6 0 0 1 10.1 24c0-1.3.2-2.6.6-3.9v-6.1H3A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 3 10.9l7.9-7Z"/>
      <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.7-6.7C35.6 2.4 30.3 0 24 0 14.8 0 6.9 5.1 3 12.9l7.9 6.1c1.9-5.5 7-9.5 13.1-9.5Z"/>
    </svg>`;
  }
  return `<svg class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

// A wide wave shape used for the tide-divider signature element.
export function tideWaveSVG(className = 'tide-divider') {
  return `<svg class="${className}" viewBox="0 0 400 28" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 14 C 33 2, 66 2, 100 14 S 166 26, 200 14 S 266 2, 300 14 S 366 26, 400 14 V28 H0 Z"/>
  </svg>`;
}
