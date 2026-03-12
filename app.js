/**
 * Trip Planner - Main application logic
 */

(function () {
  "use strict";

  const STORAGE_KEY = "trip-planner-data";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

  let tripData = null;

  /** Migrate old data: note -> notes, ensure location exists */
  function migrateData(data) {
    if (!data?.days) return data;
    data.days.forEach((day) => {
      if (!day.items) return;
      day.items.forEach((item) => {
        if ("note" in item && !("notes" in item)) item.notes = item.note || "";
        if (!("location" in item)) item.location = "";
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

  function loadFromUrlHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const encoded = params.get("data");
    if (!encoded) return null;
    try {
      const json = LZString.decompressFromEncodedURIComponent(encoded);
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

  /** Abbreviate trip data for shorter share URLs (t=title, d=days, l=label, dt=date, o=loc, i=items, m=time, a=activity, n=notes) */
  function abbreviateForShare(data) {
    if (!data?.days) return data;
    return {
      t: data.title || "My Trip",
      d: data.days.map((day) => ({
        l: day.label,
        dt: day.date,
        o: day.location,
        i: (day.items || []).map((it) => ({
          m: it.time,
          o: it.location,
          a: it.activity,
          n: it.notes ?? it.note ?? "",
        })),
      })),
    };
  }

  function expandFromShare(abbr) {
    if (!abbr?.d) return null;
    return {
      title: abbr.t || "My Trip",
      days: abbr.d.map((day) => ({
        label: day.l || "",
        date: day.dt || "",
        location: day.o || "",
        items: (day.i || []).map((it) => ({
          time: it.m || "",
          location: it.o || "",
          activity: it.a || "",
          notes: it.n ?? "",
        })),
      })),
    };
  }

  function getShareUrl() {
    if (!tripData) return "";
    const abbr = abbreviateForShare(tripData);
    const encoded = LZString.compressToEncodedURIComponent(JSON.stringify(abbr));
    const url = new URL(window.location.href);
    url.hash = "data=" + encoded;
    return url.toString();
  }

  async function shortenUrlViaProxy(longUrl) {
    try {
      const target = "https://is.gd/create.php?format=simple&url=" + encodeURIComponent(longUrl);
      const res = await fetch("https://corsproxy.io/?" + encodeURIComponent(target));
      if (!res.ok) return longUrl;
      const short = await res.text();
      return short && short.startsWith("http") ? short.trim() : longUrl;
    } catch (e) {
      return longUrl;
    }
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
      items: [{ time: "", location: "", activity: "", notes: "" }],
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

  function getMapsUrl(location) {
    if (!location || !location.trim()) return null;
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(location.trim());
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
      return '<svg class="icon-activity" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v6M12 16v6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24M2 12h6M16 12h6M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24"/></svg>';
    }
    return "";
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
    }

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
        <article class="day-card ${expanded ? "expanded" : ""}" data-day="${dayIndex}">
          <div class="day-header day-header-sticky" role="button" tabindex="0" aria-expanded="${expanded}">
            <div>
              <h3 contenteditable="true" data-field="label">${escapeHtml(day.label)}</h3>
              <p class="day-meta">
                <span contenteditable="true" data-field="date">${escapeHtml(day.date)}</span>
                <span class="day-location" contenteditable="true" data-field="location">${escapeHtml(day.location)}</span>
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
                    const mapsUrl = getMapsUrl(location);
                    const iconType = getActivityIcon(item.activity, location);
                    const iconSvg = getActivityIconSvg(iconType);
                    return `
                <div class="timeline-item" data-day="${dayIndex}" data-item="${itemIndex}">
                  <div class="timeline-time-col">
                    <span class="timeline-time" contenteditable="true" data-field="time">${escapeHtml(item.time || "")}</span>
                  </div>
                  <div class="timeline-track-col">
                    <div class="timeline-dot"></div>
                    <div class="timeline-line"></div>
                  </div>
                  <div class="timeline-content-col">
                    <div class="timeline-card ${iconType ? "timeline-card--" + iconType : ""}" data-activity-type="${escapeHtml(iconType)}">
                      <div class="timeline-card-top">
                        <div class="timeline-card-top-left">
                          ${iconSvg ? `<span class="timeline-activity-icon" aria-hidden="true">${iconSvg}</span>` : ""}
                          <span class="timeline-time-badge" contenteditable="true" data-field="time">${escapeHtml(item.time || "")}</span>
                        </div>
                        <button type="button" class="btn btn-ghost btn-icon btn-remove" aria-label="Remove item">×</button>
                      </div>
                      <div class="timeline-card-location-row">
                        ${location ? PIN_ICON : ""}
                        <h4 class="timeline-location" contenteditable="true" data-field="location" data-placeholder="Location">${escapeHtml(location)}</h4>
                        ${mapsUrl ? `<a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener" class="btn-map" title="Open in Google Maps" aria-label="Open in Google Maps">${MAP_ICON}</a>` : ""}
                      </div>
                      <p class="timeline-activity" contenteditable="true" data-field="activity">${escapeHtml(formatForDisplay(item.activity || ""))}</p>
                      ${notes ? `<div class="timeline-notes" contenteditable="true" data-field="notes">${escapeHtml(formatForDisplay(notes))}</div>` : '<div class="timeline-notes" contenteditable="true" data-field="notes" data-placeholder="Add note..."></div>'}
                    </div>
                  </div>
                </div>
              `
                  }
                )
                .join("")}
            </div>
            <div class="day-actions">
              <button type="button" class="btn btn-ghost btn-sm" data-action="add-item">+ Add activity</button>
              ${tripData.days.length > 1 ? `<button type="button" class="btn btn-ghost btn-sm btn-danger" data-action="remove-day">Remove day</button>` : ""}
            </div>
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
    addDayWrap.innerHTML = '<button type="button" class="btn btn-secondary" id="btn-add-day">+ Add day</button>';
    container.appendChild(addDayWrap);

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

  function init() {
    initUpload();
    initShareModal();
    initNewTrip();

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
