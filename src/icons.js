const ICONS = {
  food: `<svg class="icon-activity icon-activity--filled" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2v9h1V2h-1zm4 0v11c0 1.2.9 2.2 2 2.2s2-1 2-2.2V2h-4zm6 0v7.5c0 1.2.9 2.2 2 2.2s2-1 2-2.2V2h-4z"/></svg>`,
  transport: `<svg class="icon-activity icon-activity--filled" viewBox="0 0 24 24" fill="currentColor"><path d="M3 8h18v9h-2l-.7 2H5.7L5 17H3V8zm3 2v5h12v-5H6zm2 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>`,
  hotel: `<svg class="icon-activity icon-activity--filled" viewBox="0 0 24 24" fill="currentColor"><path d="M4 20V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12H4zm2-10h4v6H6v-6zm6 0h4v6h-4v-6z"/></svg>`,
  activity: `<svg class="icon-activity icon-activity--filled" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z"/></svg>`,
  pin: `<svg class="icon-pin" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`,
  map: `<svg class="icon-map" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`,
  upload: `<svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>`,
  chevronDown: `<svg class="day-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
  default: `<svg class="icon-activity icon-activity--filled" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.1 2 5 5.1 5 9c0 5.3 7 13 7 13s7-7.7 7-13c0-3.9-3.1-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`,
};

function getActivityIconSvg(type) {
  if (type && ICONS[type]) return ICONS[type];
  return ICONS.default;
}

if (typeof window !== "undefined") {
  window.ICONS = ICONS;
  window.getActivityIconSvg = getActivityIconSvg;
}
