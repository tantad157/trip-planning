/**
 * Trip Planner - Main application logic
 */

(function () {
  "use strict";

  const STORAGE_KEY = "trip-planner-data";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  let tripData = null;
  let editMode = false;

  /** Migrate old data: note -> notes, ensure location and mapsUrl exist */
  function migrateData(data) {
    if (!data?.days) return data;
    data.days.forEach((day) => {
      if (!day.items) return;
      day.items.forEach((item) => {
        if ("note" in item && !("notes" in item)) item.notes = item.note || "";
        if (!("location" in item)) item.location = "";
        if (!("mapsUrl" in item)) item.mapsUrl = "";
      });
    });
    return data;
  }

  function showScreen(id) {
    $$(".screen").forEach((el) => el.classList.remove("active"));
    const screen = $(`#${id}`);
    if (screen) screen.classList.add("active");
  }

  function setTrip(data) {
    tripData = migrateData(data);
    saveTrip();
    renderTrip();
    showScreen("trip-screen");
  }

  function saveTrip() {
    if (!tripData) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tripData));
    } catch (e) {
      console.warn("localStorage save failed", e);
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && data.days && Array.isArray(data.days)) return migrateData(data);
      }
    } catch (e) {
      console.warn("localStorage load failed", e);
    }
    return null;
  }

  function decompressFromPakoBase64Url(str) {
    if (!str || typeof pako === "undefined") return null;
    try {
      const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
      const pad = base64.length % 4;
      const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const inflated = pako.inflateRaw(bytes, { to: "string" });
      return inflated;
    } catch (e) {
      return null;
    }
  }

  function loadFromUrlHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const encodedNew = params.get("d");
    const encodedOld = params.get("data");
    const encoded = encodedNew ?? encodedOld;
    if (!encoded) return null;
    try {
      let json = null;
      if (encodedNew) {
        json = decompressFromPakoBase64Url(encodedNew);
      } else {
        json = LZString.decompressFromEncodedURIComponent(encodedOld);
      }
      if (!json) return null;
      const data = JSON.parse(json);
      if (!data) return null;
      const full = data.days ? data : expandFromShare(data);
      return full && full.days ? migrateData(full) : null;
    } catch (e) {
      console.warn("URL decode failed", e);
    }
    return null;
  }

  /** Abbreviate trip data for shorter share URLs (t=title, d=days, l=label, dt=date, o=loc, i=items, m=time, a=activity, n=notes). mapsUrl omitted - can be regenerated from location. */
  function abbreviateForShare(data) {
    if (!data?.days) return data;
    return {
      t: data.title || "My Trip",
      d: data.days.map((day) => {
        const dayLoc = day.location ?? "";
        const dayObj = {};
        if (day.label) dayObj.l = day.label;
        if (day.date) dayObj.dt = day.date;
        if (dayLoc) dayObj.o = dayLoc;
        dayObj.i = (day.items || []).map((it) => {
          const item = {};
          if (it.time) item.m = it.time;
          if (it.activity) item.a = it.activity;
          const n = it.notes ?? it.note ?? "";
          if (n) item.n = n;
          const itemLoc = it.location ?? "";
          if (itemLoc && itemLoc !== dayLoc) item.o = itemLoc;
          return item;
        });
        return dayObj;
      }),
    };
  }

  function expandFromShare(abbr) {
    if (!abbr?.d) return null;
    return {
      title: abbr.t || "My Trip",
      days: abbr.d.map((day) => {
        const dayLoc = day.o || "";
        return {
          label: day.l || "",
          date: day.dt || "",
          location: dayLoc,
          items: (day.i || []).map((it) => ({
            time: it.m || "",
            location: it.o ?? dayLoc,
            activity: it.a || "",
            notes: it.n ?? "",
            mapsUrl: "",
          })),
        };
      }),
    };
  }

  function compressToPakoBase64Url(str) {
    if (typeof pako === "undefined") return null;
    try {
      const deflated = pako.deflateRaw(str, { to: "string", level: 9 });
      const binary = deflated.split("").map((c) => c.charCodeAt(0));
      const base64 = btoa(String.fromCharCode.apply(null, binary));
      return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } catch (e) {
      return null;
    }
  }

  function getShareUrl() {
    if (!tripData) return "";
    const abbr = abbreviateForShare(tripData);
    const json = JSON.stringify(abbr);
    let encoded;
    let usePako = false;
    if (typeof pako !== "undefined") {
      encoded = compressToPakoBase64Url(json);
      usePako = !!encoded;
    }
    if (!encoded) {
      encoded = LZString.compressToEncodedURIComponent(json);
    }
    const url = new URL(window.location.href);
    url.hash = usePako ? "d=" + encoded : "data=" + encoded;
    return url.toString();
  }

  const CORS_PROXIES = [
    (url) => "https://api.cors.lol/?url=" + encodeURIComponent(url),
    (url) => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
    (url) => "https://corsproxy.io/?" + encodeURIComponent(url),
  ];

  function isValidShortUrl(text) {
    const t = (text || "").trim();
    if (!t || t.length > 500) return false;
    if (t.startsWith("http://") || t.startsWith("https://")) {
      if (/<(html|!DOCTYPE|script)/i.test(t) || /cloudflare|blocked|captcha/i.test(t)) return false;
      return true;
    }
    return false;
  }

  async function shortenUrlViaProxy(longUrl) {
    const target = "https://is.gd/create.php?format=simple&url=" + encodeURIComponent(longUrl);
    for (const toProxyUrl of CORS_PROXIES) {
      try {
        const res = await fetch(toProxyUrl(target));
        if (!res.ok) continue;
        const short = await res.text();
        if (isValidShortUrl(short)) return short.trim();
      } catch (e) {
        /* try next proxy */
      }
    }
    return longUrl;
  }

  function updateTitle() {
    const el = $("#trip-title");
    if (!el || !tripData) return;
    const text = el.textContent.trim();
    tripData.title = text || "My Trip";
    saveTrip();
  }

  function addItem(dayIndex) {
    if (!tripData || !tripData.days[dayIndex]) return;
    tripData.days[dayIndex].items.push({
      time: "",
      location: "",
      activity: "",
      notes: "",
      mapsUrl: "",
    });
    saveTrip();
    renderTrip();
  }

  function removeItem(dayIndex, itemIndex) {
    if (!tripData || !tripData.days[dayIndex]) return;
    tripData.days[dayIndex].items.splice(itemIndex, 1);
    saveTrip();
    renderTrip();
  }

  function addDay() {
    if (!tripData) return;
    const n = tripData.days.length + 1;
    tripData.days.push({
      label: `Day ${n}`,
      date: "",
      location: "",
      items: [{ time: "", location: "", activity: "", notes: "", mapsUrl: "" }],
    });
    saveTrip();
    renderTrip();
  }

  function removeDay(dayIndex) {
    if (!tripData || tripData.days.length <= 1) return;
    tripData.days.splice(dayIndex, 1);
    saveTrip();
    renderTrip();
  }

  function onItemEdit(dayIndex, itemIndex, field, value) {
    if (!tripData || !tripData.days[dayIndex]) return;
    const item = tripData.days[dayIndex].items[itemIndex];
    if (item) item[field] = value;
    saveTrip();
  }

  function onDayEdit(dayIndex, field, value) {
    if (!tripData || !tripData.days[dayIndex]) return;
    tripData.days[dayIndex][field] = value;
    saveTrip();
  }

  function resolveMapsUrl(mapsUrl) {
    if (!mapsUrl || !mapsUrl.trim()) return null;
    const s = mapsUrl.trim();
    if (/^https?:\/\//i.test(s)) return s;
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(s);
  }

  /** Return icon name for activity type (food, transport, hotel, activity) for styling */
  function getActivityIcon(activity, location) {
    const text = ((activity || "") + " " + (location || "")).toLowerCase();
    if (/\b(ăn|eat|breakfast|lunch|dinner|buffet|trưa|tối|sáng|quán|nhà hàng|restaurant|food)\b/.test(text)) return "food";
    if (/\b(xe|bus|grab|taxi|bay|sân bay|airport|khởi hành|di chuyển|checkin|checkout)\b/.test(text)) return "transport";
    if (/\b(khách sạn|hotel|resort|checkin và nghỉ|phòng)\b/.test(text)) return "hotel";
    if (/\b(show|xem|thăm quan|chơi|game|vinwonders|safari|grand world)\b/.test(text)) return "activity";
    return "";
  }

  function getActivityIconSvg(type) {
    if (type === "food") {
      return '<svg class="icon-activity" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 3v8M7 3v8M4 7h3M12 3v18M12 12c3 0 5-2 5-5V3"/></svg>';
    }
    if (type === "transport") {
      return '<svg class="icon-activity" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="11" rx="2"/><path d="M7 16l-1.5 3M17 16l1.5 3M7 10h.01M17 10h.01"/></svg>';
    }
    if (type === "hotel") {
      return '<svg class="icon-activity" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v13"/><path d="M4 12h16M8 9h.01M12 9h.01M16 9h.01"/></svg>';
    }
    if (type === "activity") {
      return '<svg class="icon-activity" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.14 1.91 6.09L12 17.77 5.09 19.5 7 13.41 2 9.27l6.91-1.01L12 2z"/></svg>';
    }
    return '<svg class="icon-activity" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  }

  const PIN_ICON =
    '<svg class="icon-pin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  function renderTrip() {
    const container = $("#trip-content");
    if (!container || !tripData) return;

    const titleEl = $("#trip-title");
    if (titleEl) {
      titleEl.textContent = tripData.title || "My Trip";
      titleEl.dataset.placeholder = "Trip title";
      titleEl.contentEditable = editMode ? "true" : "false";
    }

    const ce = editMode ? "true" : "false";
    const today = new Date().toISOString().slice(0, 10);
    const parseDayDate = (d) => {
      if (!d) return "";
      const m = d.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
      return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
    };

    container.innerHTML = tripData.days
      .map(
        (day, dayIndex) => {
          const dayDate = parseDayDate(day.date);
          const isCurrentDay = dayDate && dayDate === today;
          const expanded = dayIndex === 0 || isCurrentDay;
          return `
        <article class="day-card ${expanded ? "expanded" : ""} ${editMode ? "" : "view-mode"}" data-day="${dayIndex}">
          <div class="day-header day-header-sticky" role="button" tabindex="0" aria-expanded="${expanded}">
            <div>
              <h3 contenteditable="${ce}" data-field="label">${escapeHtml(day.label)}</h3>
              <p class="day-meta">
                <span contenteditable="${ce}" data-field="date">${escapeHtml(day.date)}</span>
                <span class="day-location" contenteditable="${ce}" data-field="location">${escapeHtml(day.location)}</span>
              </p>
            </div>
            <svg class="day-toggle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
          <div class="day-body">
            <div class="timeline">
              ${(day.items || [])
                .map(
                  (item, itemIndex) => {
                    const notes = item.notes ?? item.note ?? "";
                    const location = item.location ?? "";
                    const mapsUrl = item.mapsUrl ?? "";
                    const iconType = getActivityIcon(item.activity, location);
                    const iconSvg = getActivityIconSvg(iconType);
                    return `
                <div class="timeline-item" data-day="${dayIndex}" data-item="${itemIndex}">
                  <div class="timeline-time-col">
                    <span class="timeline-time" contenteditable="${ce}" data-field="time">${escapeHtml(item.time || "")}</span>
                  </div>
                  <div class="timeline-track-col">
                    <div class="timeline-dot"></div>
                    <div class="timeline-line"></div>
                  </div>
                  <div class="timeline-content-col">
                    <div class="timeline-card ${iconType ? "timeline-card--" + iconType : ""}" data-activity-type="${escapeHtml(iconType)}">
                      <div class="timeline-card-compact" role="button" tabindex="0">
                        <div class="timeline-card-top-left">
                          <span class="timeline-time-inline" contenteditable="${ce}" data-field="time">${escapeHtml(item.time || "")}</span>
                          <span class="timeline-activity-icon" aria-hidden="true">${iconSvg}</span>
                          <p class="timeline-activity" contenteditable="${ce}" data-field="activity">${escapeHtml(formatForDisplay(item.activity || ""))}</p>
                        </div>
                        ${editMode ? '<button type="button" class="btn btn-ghost btn-icon btn-remove" aria-label="Remove item">×</button>' : ""}
                      </div>
                        <div class="timeline-card-expanded">
                        <div class="timeline-card-location-row">
                          ${location ? PIN_ICON : ""}
                          <h4 class="timeline-location" contenteditable="${ce}" data-field="location" data-placeholder="Location">${escapeHtml(location)}</h4>
                        </div>
                        <div class="timeline-card-maps-row">
                          <input type="text" class="timeline-maps-input" data-field="mapsUrl" placeholder="Paste Maps URL or address..." value="${escapeHtml(mapsUrl)}" ${editMode ? "" : 'readonly'} />
                          <button type="button" class="btn btn-map" data-action="open-maps">Open in Maps</button>
                        </div>
                        ${notes ? `<div class="timeline-notes" contenteditable="${ce}" data-field="notes">${escapeHtml(formatForDisplay(notes))}</div>` : '<div class="timeline-notes" contenteditable="' + ce + '" data-field="notes" data-placeholder="Add note..."></div>'}
                      </div>
                    </div>
                  </div>
                </div>
              `
                  }
                )
                .join("")}
            </div>
            ${editMode ? `<div class="day-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-action="add-item">+ Add activity</button>
              ${tripData.days.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="remove-day">Remove day</button>` : ""}
            </div>` : ""}
          </div>
        </article>
      `;
        }
      )
      .join("");

    const currentDayIndex = tripData.days.findIndex((day) => parseDayDate(day.date) === today);
    if (currentDayIndex >= 0) {
      const indicator = document.createElement("button");
      indicator.type = "button";
      indicator.className = "current-day-indicator";
      indicator.id = "current-day-indicator";
      indicator.textContent = `Today: ${tripData.days[currentDayIndex].label}`;
      container.appendChild(indicator);
    }

    const addDayWrap = document.createElement("div");
    addDayWrap.className = "day-add-section";
    addDayWrap.innerHTML = editMode ? '<button type="button" class="btn btn-secondary" id="btn-add-day">+ Add day</button>' : "";
    if (addDayWrap.innerHTML) container.appendChild(addDayWrap);

    updateModeButton();
    bindTripEvents();
  }

  const MAP_ICON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /** Split dense text into readable lines (preserves newlines, adds breaks before bullets/sections) */
  function formatForDisplay(text) {
    if (!text || typeof text !== "string") return "";
    return text
      .replace(/\s*\n\s*/g, "\n")
      .replace(/\s+\*\*/g, "\n\n**")
      .replace(/\s{2,}/g, "\n")
      .trim();
  }

  function bindTripEvents() {
    // Title edit
    const titleEl = $("#trip-title");
    if (titleEl) {
      titleEl.onblur = () => updateTitle();
    }

    // Day toggle
    $$(".day-header").forEach((el) => {
      el.onclick = () => {
        const card = el.closest(".day-card");
        if (card) {
          const expanded = card.classList.toggle("expanded");
          el.setAttribute("aria-expanded", expanded ? "true" : "false");
        }
      };
      el.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          el.click();
        }
      };
    });

    // Contenteditable fields
    $$("[contenteditable=true][data-field]").forEach((el) => {
      el.onblur = () => {
        const card = el.closest(".day-card");
        const item = el.closest(".timeline-item");
        const field = el.dataset.field;
        const value = el.textContent.trim();
        const fieldMap = { note: "notes" };

        if (item) {
          const dayIndex = parseInt(item.dataset.day, 10);
          const itemIndex = parseInt(item.dataset.item, 10);
          onItemEdit(dayIndex, itemIndex, fieldMap[field] || field, value);
        } else if (card) {
          const dayIndex = parseInt(card.dataset.day, 10);
          if (["label", "date", "location"].includes(field)) {
            onDayEdit(dayIndex, field, value);
          }
        } else if (field === "label" && tripData) {
          tripData.title = value || "My Trip";
          saveTrip();
        }
      };
    });

    // Maps URL input
    $$(".timeline-maps-input").forEach((input) => {
      input.onblur = () => {
        const item = input.closest(".timeline-item");
        if (!item) return;
        const dayIndex = parseInt(item.dataset.day, 10);
        const itemIndex = parseInt(item.dataset.item, 10);
        onItemEdit(dayIndex, itemIndex, "mapsUrl", input.value.trim());
      };
    });

    // Open in Maps button
    $$("[data-action=open-maps]").forEach((btn) => {
      btn.onclick = () => {
        const item = btn.closest(".timeline-item");
        if (!item) return;
        const input = item.querySelector(".timeline-maps-input");
        const url = input ? resolveMapsUrl(input.value.trim()) : null;
        if (url) window.open(url, "_blank", "noopener");
      };
    });

    // Timeline item expand/collapse
    $$(".timeline-card-compact").forEach((el) => {
      el.onclick = (e) => {
        if (e.target.closest(".btn-remove")) return;
        if (e.target.closest("[contenteditable=true]")) return;
        const item = el.closest(".timeline-item");
        if (item) item.classList.toggle("timeline-item--expanded");
      };
      el.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          el.click();
        }
      };
    });

    // Remove item
    $$(".btn-remove").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const item = btn.closest(".timeline-item");
        if (!item) return;
        const dayIndex = parseInt(item.dataset.day, 10);
        const itemIndex = parseInt(item.dataset.item, 10);
        removeItem(dayIndex, itemIndex);
      };
    });

    // Add item
    $$("[data-action=add-item]").forEach((btn) => {
      btn.onclick = () => {
        const card = btn.closest(".day-card");
        if (card) addItem(parseInt(card.dataset.day, 10));
      };
    });

    // Remove day
    $$("[data-action=remove-day]").forEach((btn) => {
      btn.onclick = () => {
        const card = btn.closest(".day-card");
        if (card) removeDay(parseInt(card.dataset.day, 10));
      };
    });

    // Add day
    const addDayBtn = $("#btn-add-day");
    if (addDayBtn) addDayBtn.onclick = addDay;

    const currentDayIndicator = $("#current-day-indicator");
    if (currentDayIndicator) {
      currentDayIndicator.onclick = () => {
        const today = new Date().toISOString().slice(0, 10);
        const parseDayDate = (d) => {
          if (!d) return "";
          const m = d.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
          return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
        };
        const idx = (tripData?.days || []).findIndex((d) => parseDayDate(d.date) === today);
        if (idx < 0) return;
        const card = document.querySelector(`.day-card[data-day="${idx}"]`);
        if (!card) return;
        card.classList.add("expanded");
        const header = card.querySelector(".day-header");
        if (header) header.setAttribute("aria-expanded", "true");
        card.scrollIntoView({ behavior: "smooth", block: "start" });
      };
    }
  }

  function initUpload() {
    const dropZone = $("#drop-zone");
    const fileInput = $("#file-input");
    const statusEl = $("#parse-status");

    if (!dropZone || !fileInput) return;

    function setStatus(msg, isError = false) {
      if (statusEl) {
        statusEl.textContent = msg;
        statusEl.classList.toggle("error", isError);
      }
    }

    function handleFile(file) {
      if (!file || file.type !== "application/pdf") {
        setStatus("Please upload a PDF file.", true);
        return;
      }
      setStatus("Parsing PDF...");
      TripParser.parsePdfFile(file)
        .then((data) => {
          setTrip(data);
          setStatus("");
        })
        .catch((err) => {
          console.error(err);
          setStatus("Failed to parse PDF. Try another file.", true);
        });
    }

    dropZone.onclick = () => fileInput.click();

    dropZone.ondragover = (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    };

    dropZone.ondragleave = () => {
      dropZone.classList.remove("dragover");
    };

    dropZone.ondrop = (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
      const file = e.dataTransfer?.files?.[0];
      handleFile(file);
    };

    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      handleFile(file);
      fileInput.value = "";
    };
  }

  function initShareModal() {
    const modal = $("#share-modal");
    const input = $("#share-link-input");
    const copyBtn = $("#btn-copy");
    const closeBtn = $("#btn-close-modal");
    const backdrop = modal?.querySelector(".modal-backdrop");
    const feedback = $("#copy-feedback");
    const qrWrap = $("#share-qr");

    function renderQrOrFallback(qrWrapEl, url) {
      if (!qrWrapEl) return;
      qrWrapEl.innerHTML = "";
      const maxQrChars = 1200;
      if (url.length > maxQrChars || typeof QRCode === "undefined") {
        qrWrapEl.innerHTML =
          '<p class="share-qr-fallback">URL too long for QR code—use <strong>Copy</strong> to share</p>';
      } else {
        try {
          new QRCode(qrWrapEl, {
            text: url,
            width: 132,
            height: 132,
            colorDark: "#2d2a26",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L,
          });
        } catch (e) {
          console.warn("QR code generation failed:", e);
          qrWrapEl.innerHTML =
            '<p class="share-qr-fallback">QR code unavailable—use <strong>Copy</strong> to share</p>';
        }
      }
    }

    async function openShareModal() {
      if (!tripData) return;
      const longUrl = getShareUrl();
      modal?.classList.add("active");
      modal?.setAttribute("aria-hidden", "false");
      if (input) input.value = longUrl;
      if (feedback) feedback.textContent = "";
      if (qrWrap) {
        qrWrap.innerHTML = '<p class="share-qr-fallback">Shortening…</p>';
        const displayUrl = await shortenUrlViaProxy(longUrl);
        if (input) input.value = displayUrl;
        renderQrOrFallback(qrWrap, displayUrl);
      }
      if (feedback) feedback.textContent = "";
    }

    document.addEventListener("click", (e) => {
      if (e.target.closest("#btn-share")) {
        e.preventDefault();
        openShareModal();
      }
    });

    function closeModal() {
      modal?.classList.remove("active");
      modal?.setAttribute("aria-hidden", "true");
    }

    copyBtn?.addEventListener("click", () => {
      if (!input) return;
      input.select();
      input.setSelectionRange(0, 99999);
      navigator.clipboard
        .writeText(input.value)
        .then(() => {
          if (feedback) feedback.textContent = "Copied!";
        })
        .catch(() => {
          if (feedback) feedback.textContent = "Copy failed";
        });
    });

    closeBtn?.addEventListener("click", closeModal);
    backdrop?.addEventListener("click", closeModal);
  }

  function initNewTrip() {
    $("#btn-new").onclick = () => {
      tripData = null;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
      window.location.hash = "";
      showScreen("upload-screen");
    };
  }

  function updateModeButton() {
    const btn = $("#btn-mode");
    if (btn) {
      btn.textContent = editMode ? "View" : "Edit";
      btn.title = editMode ? "Switch to view mode" : "Switch to edit mode";
    }
  }

  function initModeToggle() {
    const btn = $("#btn-mode");
    if (btn) {
      btn.onclick = () => {
        editMode = !editMode;
        renderTrip();
      };
    }
  }

  function init() {
    initUpload();
    initShareModal();
    initNewTrip();
    initModeToggle();

    // Priority: URL hash > localStorage > upload screen
    let data = loadFromUrlHash();
    if (data) {
      setTrip(data);
      return;
    }
    data = loadFromStorage();
    if (data) {
      setTrip(data);
      return;
    }
    showScreen("upload-screen");
  }

  // Run when DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
