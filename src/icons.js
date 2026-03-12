const ICONS = {
  food: `<svg class="icon-activity icon-activity--filled" viewBox="0 0 24 24" fill="currentColor"><path d="M5 2h1v5h1V2h1v5h1V2h1v7a3 3 0 0 1-2 2.83V21H7v-9.17A3 3 0 0 1 5 9V2Zm10 0a3 3 0 0 1 3 3v6a3 3 0 0 1-2 2.83V21h-2v-7.17A3 3 0 0 1 12 11V5a3 3 0 0 1 3-3Z"/></svg>`,
  transport: `<svg class="icon-activity icon-activity--filled" viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h10a3 3 0 0 1 3 3v8a3 3 0 0 1-2 2.83V19h1a1 1 0 1 1 0 2h-2a1 1 0 0 1-1-1v-2H8v2a1 1 0 0 1-1 1H5a1 1 0 1 1 0-2h1v-2.17A3 3 0 0 1 4 14V6a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v6h12V6a1 1 0 0 0-1-1H7Zm1 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/></svg>`,
  hotel: `<svg class="icon-activity icon-activity--filled" viewBox="0 0 24 24" fill="currentColor"><path d="M5 6a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4h1a2 2 0 0 1 2 2v7h-2v-2H4v2H2v-7a2 2 0 0 1 2-2h1V6Zm2 0v4h10V6a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1Zm-3 8v1h16v-1a1 1 0 0 0-1-1h-5v1h-4v-1H5a1 1 0 0 0-1 1Z"/></svg>`,
  activity: `<svg class="icon-activity icon-activity--filled" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5 4 7.1 6H5a2 2 0 0 0-2 2v9a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3V8a2 2 0 0 0-2-2h-2.1L15.5 4h-7Zm3.5 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>`,
  pin: `<svg class="icon-pin" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 1 7 7c0 5.3-7 13-7 13S5 14.3 5 9a7 7 0 0 1 7-7Zm0 3a4 4 0 0 0-4 4c0 1.9 1.4 3.9 4 6.9 2.6-3 4-5 4-6.9a4 4 0 0 0-4-4Z"/></svg>`,
  map: `<svg class="icon-map" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 1 7 7c0 5.3-7 13-7 13S5 14.3 5 9a7 7 0 0 1 7-7Zm0 3a4 4 0 0 0-4 4c0 1.9 1.4 3.9 4 6.9 2.6-3 4-5 4-6.9a4 4 0 0 0-4-4Z"/></svg>`,
  upload: `<svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>`,
  chevronDown: `<svg class="day-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
  default: `<svg class="icon-activity icon-activity--filled" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 1 7 7c0 5.3-7 13-7 13S5 14.3 5 9a7 7 0 0 1 7-7Zm0 3a4 4 0 0 0-4 4c0 1.9 1.4 3.9 4 6.9 2.6-3 4-5 4-6.9a4 4 0 0 0-4-4Z"/></svg>`,
};

function getActivityIconSvg(type) {
  if (type && ICONS[type]) return ICONS[type];
  return ICONS.default;
}

if (typeof window !== "undefined") {
  window.ICONS = ICONS;
  window.getActivityIconSvg = getActivityIconSvg;
}
