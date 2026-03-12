/**
 * Environment-agnostic trip itinerary parsing logic.
 * Used by browser parser (parser.js) and Node build script (scripts/parse-trip-pdf.mjs).
 */

const TIME_IN_COLUMN_PATTERN = /^(\d{1,2})h(\d{0,2})(?:\s*[-–]\s*(\d{1,2})h(\d{0,2}))?$/i;
const DAY_HEADER_PATTERN = /^(?:Ngày|Ngay|Day)\s*(\d+)\s*[:\s]*(.*)/i;
const DAY_HEADER_ANYWHERE = /(?:Ngày|Ngay|Day)\s*(\d+)\s*[:\s]*(.*)/i;
const DATE_PATTERN = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/;
const TITLE_PATTERN = /\([^)]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}[^)]*\)/;
const PAGE_FOOTER = /^--\s*\d+\s+of\s+\d+\s*--$/i;
const HEADER_TOKENS = ["Ngày", "Địa điểm", "Thời gian", "Hoạt động", "Note", "Nội dung"];

export function tokenFromItem(item) {
  const t = item.transform || [];
  const x = t[4] ?? 0;
  const y = t[5] ?? 0;
  const w = item.width ?? 0;
  const h = item.height ?? 12;
  const str = (item.str || "").trim();
  return str ? { str, x, y, w, h } : null;
}

export async function extractTokensFromPdfDoc(pdf) {
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const tokens = content.items.map(tokenFromItem).filter(Boolean);
    pages.push({ pageNum: i, tokens });
  }
  return pages;
}

export function buildPageTextFromPages(pages) {
  const LINE_Y_THRESHOLD = 5;
  const COLUMN_X_GAP = 18;
  const LARGE_COLUMN_X_GAP = 42;
  const chunks = [];
  for (const page of pages) {
    const withPos = page.tokens.map((t) => ({ str: t.str, x: t.x, y: t.y }));
    withPos.sort((a, b) => {
      if (Math.abs(a.y - b.y) > LINE_Y_THRESHOLD) return b.y - a.y;
      return a.x - b.x;
    });
    const groupedLines = [];
    for (const token of withPos) {
      const line = groupedLines.find((g) => Math.abs(g.y - token.y) <= LINE_Y_THRESHOLD);
      if (line) {
        line.items.push(token);
        line.y = (line.y + token.y) / 2;
      } else {
        groupedLines.push({ y: token.y, items: [token] });
      }
    }
    groupedLines.sort((a, b) => b.y - a.y);
    const lines = groupedLines
      .map((group) => {
        const row = group.items.sort((a, b) => a.x - b.x);
        let line = "";
        let prevX = null;
        for (const token of row) {
          if (line && prevX !== null) {
            const gap = token.x - prevX;
            if (gap > LARGE_COLUMN_X_GAP) line += " | ";
            else if (gap > COLUMN_X_GAP) line += " ";
          }
          line += token.str;
          prevX = token.x + Math.max((token.str?.length || 0) * 4.8, 8);
        }
        return line.trim();
      })
      .filter(Boolean);
    chunks.push(lines.join("\n"));
  }
  return chunks.join("\n\n");
}

function detectColumnBoundaries(tokens) {
  const LINE_Y = 5;
  const sorted = [...tokens].sort((a, b) => {
    if (Math.abs(a.y - b.y) > LINE_Y) return b.y - a.y;
    return a.x - b.x;
  });

  const headerCandidates = [];
  for (const t of sorted) {
    const s = t.str;
    for (const h of HEADER_TOKENS) {
      if (s === h || s.startsWith(h + " ") || s.endsWith(" " + h)) {
        headerCandidates.push({ ...t, label: h });
        break;
      }
    }
  }

  if (headerCandidates.length < 2) return null;

  headerCandidates.sort((a, b) => a.x - b.x);
  const bounds = [];
  for (let i = 0; i < headerCandidates.length; i++) {
    const curr = headerCandidates[i];
    const next = headerCandidates[i + 1];
    const xStart = curr.x;
    const xEnd = next ? (next.x + next.w) / 2 : curr.x + curr.w + 80;
    bounds.push({ xMin: xStart, xMax: xEnd, label: curr.label });
  }
  if (bounds.length > 0 && !headerCandidates[headerCandidates.length - 1]) {
    const last = headerCandidates[headerCandidates.length - 1];
    bounds[bounds.length - 1].xMax = last.x + last.w + 80;
  }
  return bounds;
}

function inferColumnBoundsFromAllPages(pages) {
  let best = null;
  let bestScore = 0;
  for (const p of pages) {
    const b = detectColumnBoundaries(p.tokens);
    if (b && b.length >= 3) {
      const score = b.length;
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
  }
  if (best) return best;

  const allTokens = pages.flatMap((p) => p.tokens);
  const fallback = detectColumnBoundaries(allTokens);
  if (fallback) return fallback;

  const timeFallback = inferColumnBoundsFromTimeTokens(pages);
  if (timeFallback) return timeFallback;

  const xs = allTokens.map((t) => t.x).filter((x) => x > 0);
  if (xs.length < 2) return null;
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const pageWidth = xMax - xMin || 400;
  const colWidth = pageWidth / 5;
  return [
    { xMin: xMin, xMax: xMin + colWidth, label: "day" },
    { xMin: xMin + colWidth, xMax: xMin + colWidth * 2, label: "location" },
    { xMin: xMin + colWidth * 2, xMax: xMin + colWidth * 3, label: "time" },
    { xMin: xMin + colWidth * 3, xMax: xMin + colWidth * 4, label: "activity" },
    { xMin: xMin + colWidth * 4, xMax: xMax + 100, label: "note" },
  ];
}

function inferColumnBoundsFromTimeTokens(pages) {
  const timeTokens = [];
  for (const page of pages) {
    for (const t of page.tokens) {
      const s = t.str;
      if (/^\d{1,2}h\d{0,2}$/i.test(s) || /^\d{1,2}h\d{0,2}\s*[-–]$/i.test(s) || /^\d{1,2}h\d{0,2}\s*[-–]\s*\d{1,2}h\d{0,2}$/i.test(s)) {
        timeTokens.push({ x: t.x, w: t.w, pageNum: page.pageNum });
      }
    }
  }
  if (timeTokens.length < 3) return null;
  const timeXs = timeTokens.map((t) => t.x + t.w / 2);
  timeXs.sort((a, b) => a - b);
  const timeCenter = timeXs[Math.floor(timeXs.length / 2)];
  const allXs = pages.flatMap((p) => p.tokens.map((t) => t.x)).filter((x) => x > 0);
  const xMin = Math.min(...allXs);
  const xMax = Math.max(...allXs);
  const colWidth = (xMax - xMin) / 5 || 80;
  const timeColLeft = Math.max(xMin, timeCenter - colWidth / 2);
  const timeColRight = Math.min(xMax, timeCenter + colWidth / 2);
  return [
    { xMin: xMin, xMax: timeColLeft - colWidth, label: "day" },
    { xMin: timeColLeft - colWidth, xMax: timeColLeft, label: "location" },
    { xMin: timeColLeft, xMax: timeColRight, label: "time" },
    { xMin: timeColRight, xMax: timeColRight + colWidth, label: "activity" },
    { xMin: timeColRight + colWidth, xMax: xMax + 100, label: "note" },
  ];
}

function clusterRows(tokens, yThreshold) {
  const byY = [];
  for (const t of tokens) {
    const row = byY.find((r) => Math.abs(r.y - t.y) <= yThreshold);
    if (row) {
      row.tokens.push(t);
      row.y = (row.y + t.y) / 2;
    } else {
      byY.push({ y: t.y, tokens: [t] });
    }
  }
  byY.sort((a, b) => b.y - a.y);
  return byY;
}

function assignTokenToColumn(token, bounds) {
  const cx = token.x + token.w / 2;
  for (let i = 0; i < bounds.length; i++) {
    if (cx >= bounds[i].xMin && cx <= bounds[i].xMax) return i;
  }
  if (cx < bounds[0].xMin) return 0;
  return bounds.length - 1;
}

function mapHeaderLabelToCol(label) {
  const l = (label || "").toLowerCase();
  if (/\bngày\b|ngay|day/.test(l)) return 0;
  if (/địa điểm|dia diem|location/.test(l)) return 1;
  if (/thời gian|thoi gian|time/.test(l)) return 2;
  if (/hoạt động|hoat dong|nội dung|noi dung|activity/.test(l)) return 3;
  if (/note/.test(l)) return 4;
  return -1;
}

function buildNormalizedBounds(bounds) {
  const byCol = [];
  for (let i = 0; i < 5; i++) byCol[i] = null;
  for (const b of bounds) {
    const c = mapHeaderLabelToCol(b.label);
    if (c >= 0 && c < 5) byCol[c] = b;
  }
  const have = byCol.filter(Boolean);
  if (have.length < 3) {
    return bounds.map((b, i) => ({
      xMin: b.xMin,
      xMax: b.xMax,
      colIndex: Math.min(i, 4),
    }));
  }
  have.sort((a, b) => a.xMin - b.xMin);
  return have.map((b, i) => ({
    xMin: b.xMin,
    xMax: b.xMax,
    colIndex: i,
  }));
}

function parseTimeFromTimeColumn(str) {
  const m = (str || "").trim().match(TIME_IN_COLUMN_PATTERN);
  if (!m) return null;
  const start = `${m[1]}h${(m[2] || "00").padStart(2, "0")}`;
  if (!m[3]) return start;
  const end = `${m[3]}h${(m[4] || "00").padStart(2, "0")}`;
  return `${start} - ${end}`;
}

const TIME_NOTE_KEYWORDS = /bắt đầu|trừ hao|tgian chờ|chờ bus|chờ xe/i;

function isTimeNote(paren) {
  return TIME_NOTE_KEYWORDS.test(paren) || /\d{1,2}h\d{0,2}\s*bắt đầu/i.test(paren);
}

function extractTimeNote(text) {
  if (!text || typeof text !== "string") return { note: "", rest: text };
  const trimmed = text.trim();
  const m = trimmed.match(/^\(([^)]+)\)\s*/);
  if (!m) return { note: "", rest: trimmed };
  const paren = m[1];
  if (isTimeNote(paren)) {
    return { note: "\n(" + paren + ")", rest: trimmed.slice(m[0].length).trim() };
  }
  return { note: "", rest: trimmed };
}

function stripTimeNotesFromActivity(activity) {
  if (!activity || typeof activity !== "string") return { notes: [], rest: activity };
  const notes = [];
  const rest = activity.replace(/\(([^)]+)\)/g, (full, paren) => {
    if (isTimeNote(paren)) {
      notes.push("\n(" + paren + ")");
      return " ";
    }
    return full;
  }).replace(/\s+/g, " ").trim();
  return { notes, rest };
}

function appendTimeNoteFromRemainder(timeStr, timeCell) {
  if (!timeStr || !timeCell) return timeStr;
  const remainder = timeCell.replace(TIME_IN_COLUMN_PATTERN, "").trim();
  const { note } = extractTimeNote(remainder);
  return note ? timeStr + note : timeStr;
}

function appendTimeNoteFromSegment(timeStr, segmentText) {
  const { note, rest } = extractTimeNote(segmentText);
  if (!note) return { time: timeStr, activity: segmentText };
  return { time: timeStr + note, activity: rest };
}

function splitActivityAndNotesFromSegment(segmentText) {
  const lines = (segmentText || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 0) return { activity: "", notes: "" };

  const hasExplicitNoteLine = lines.some((line) => {
    const idx = line.indexOf("|");
    if (idx < 0) return false;
    const left = line.slice(0, idx).trim();
    const right = line.slice(idx + 1).trim();
    return !!left && !!right;
  });

  const activityParts = [];
  const noteParts = [];

  for (const line of lines) {
    const idx = line.indexOf("|");
    if (idx < 0) {
      if (noteParts.length > 0 && /^\([^)]*\)$/.test(line)) {
        noteParts.push(line);
      } else {
        activityParts.push(line);
      }
      continue;
    }

    const left = line.slice(0, idx).trim();
    const right = line.slice(idx + 1).trim();

    if (left && right) {
      activityParts.push(left);
      noteParts.push(right);
      continue;
    }
    if (left) {
      activityParts.push(left);
      continue;
    }
    if (right) {
      if (hasExplicitNoteLine || activityParts.length > 0) noteParts.push(right);
      else activityParts.push(right);
    }
  }

  return {
    activity: activityParts.join(" ").replace(/\s+/g, " ").trim(),
    notes: noteParts.join("\n").replace(/[ \t]+\n/g, "\n").trim(),
  };
}

function normalizeForCompare(text) {
  return (text || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

function isHeaderOrFooter(tokenStr) {
  const s = (tokenStr || "").trim();
  if (PAGE_FOOTER.test(s)) return true;
  if (HEADER_TOKENS.some((h) => s === h || s.startsWith(h))) return true;
  if (/^(?:ngày|ngay)\s+địa điểm\b|^địa điểm$|^nội dung$|^thời gian\s*hoạt động/i.test(s)) return true;
  return false;
}

function buildTableFromPages(pages, bounds) {
  const normalized = buildNormalizedBounds(bounds);
  const xRanges = [];
  for (let i = 0; i < 5; i++) {
    const b = normalized.find((n) => n.colIndex === i) || normalized[i];
    if (b) xRanges.push({ xMin: b.xMin, xMax: b.xMax });
  }
  while (xRanges.length < 5) {
    const last = xRanges[xRanges.length - 1];
    xRanges.push({ xMin: last.xMax, xMax: last.xMax + 80 });
  }

  const allRows = [];
  const Y_THRESHOLD = 6;

  for (const page of pages) {
    const rows = clusterRows(page.tokens, Y_THRESHOLD);
    for (const row of rows) {
      const cells = [[], [], [], [], []];
      for (const t of row.tokens) {
        const col = assignTokenToColumn(t, xRanges);
        if (col >= 0 && col < 5) cells[col].push(t);
      }
      const cellTexts = cells.map((cell) =>
        cell
          .sort((a, b) => a.x - b.x)
          .map((t) => t.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      );
      const isHeaderRow = cellTexts.some((c) => isHeaderOrFooter(c));
      if (isHeaderRow) continue;
      allRows.push({
        y: row.y,
        cells: cellTexts,
        pageNum: page.pageNum,
      });
    }
  }

  allRows.sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    return b.y - a.y;
  });
  return allRows;
}

function assembleDaysFromTableRows(rows) {
  let title = "My Trip";
  const days = [];
  let currentDay = null;
  let currentLocation = "";

  for (const row of rows) {
    const [dayCell, locationCell, timeCell, activityCell, noteCell] = row.cells;
    const allCells = [dayCell, locationCell, timeCell, activityCell, noteCell];

    let dayMatch = (dayCell || "").match(DAY_HEADER_PATTERN);
    if (!dayMatch) {
      for (const cell of allCells) {
        const m = (cell || "").match(DAY_HEADER_ANYWHERE);
        if (!m || !m[1]) continue;
        const trimmed = cell.trim();
        if (/^\d{1,2}h/.test(trimmed)) continue;
        const isShortOrAtStart = trimmed.length < 70 || trimmed.indexOf(m[0].trim()) < 15;
        if (isShortOrAtStart) {
          dayMatch = m;
          break;
        }
      }
    }
    if (dayMatch) {
      const dayNum = dayMatch[1];
      let dateStr = (dayMatch[2] || "").trim();
      if (!dateStr && DATE_PATTERN.test(locationCell || "")) dateStr = locationCell.trim();
      if (!dateStr && DATE_PATTERN.test(dayCell || "")) dateStr = dayCell.trim();
      for (const cell of allCells) {
        if (!dateStr && cell && DATE_PATTERN.test(cell.trim())) {
          dateStr = cell.trim();
          break;
        }
      }
      if (currentDay) days.push(currentDay);
      currentDay = {
        dayNum,
        date: dateStr,
        location: "",
        items: [],
      };
      currentLocation = "";
    } else if (currentDay && !currentDay.date && DATE_PATTERN.test((dayCell || "").trim())) {
      currentDay.date = dayCell.trim();
    } else if (currentDay && !currentDay.date && DATE_PATTERN.test((locationCell || "").trim())) {
      currentDay.date = locationCell.trim();
    }

    if (locationCell && locationCell.trim() && !DAY_HEADER_PATTERN.test(locationCell) && !DATE_PATTERN.test(locationCell)) {
      currentLocation = locationCell.trim();
    }

    const timeStr = parseTimeFromTimeColumn(timeCell);
    if (timeStr && (activityCell || noteCell || locationCell || currentLocation)) {
      if (!currentDay) {
        currentDay = { dayNum: "1", date: "", location: "", items: [] };
        days.push(currentDay);
      }
      let timeWithNote = appendTimeNoteFromRemainder(timeStr, timeCell);
      let activity = [activityCell, noteCell].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
      const { note: stripNote, rest: activityRest } = extractTimeNote(activity);
      if (stripNote) {
        timeWithNote = timeWithNote + stripNote;
        activity = activityRest;
      }
      const { notes: stripNotes, rest: activityFinal } = stripTimeNotesFromActivity(activity);
      if (stripNotes.length > 0) {
        timeWithNote = timeWithNote + stripNotes.join("");
        activity = activityFinal;
      }
      currentDay.items.push({
        time: timeWithNote,
        location: currentLocation || currentDay.location || "",
        activity: activity || "",
        notes: noteCell ? noteCell.trim() : "",
        mapsUrl: "",
      });
      if (currentLocation) currentDay.location = currentDay.location || currentLocation;
    } else if ((timeCell || activityCell) && !timeStr && currentDay && currentDay.items.length > 0) {
      const last = currentDay.items[currentDay.items.length - 1];
      const extra = [timeCell, activityCell, noteCell].filter(Boolean).join(" ").trim();
      if (extra) last.activity = (last.activity + " " + extra).replace(/\s+/g, " ").trim();
    }

    if (TITLE_PATTERN.test(dayCell || locationCell || activityCell) && !title.match(TITLE_PATTERN)) {
      const m = (dayCell || " " + locationCell || " " + activityCell).match(/[^(]*\([^)]+\)/);
      if (m) title = m[0].trim();
    }
  }

  if (currentDay) days.push(currentDay);

  return {
    title: title.trim() || "My Trip",
    days: days.map((d, i) => ({
      label: `Day ${d.dayNum || i + 1}`,
      date: d.date || "",
      location: d.items[0]?.location || "",
      items: d.items.map((it) => ({ ...it, mapsUrl: it.mapsUrl ?? "" })),
    })),
  };
}

export function parseItineraryFromLayout(pages) {
  const bounds = inferColumnBoundsFromAllPages(pages);
  if (!bounds) return null;
  const rows = buildTableFromPages(pages, bounds);
  return assembleDaysFromTableRows(rows);
}

const TIME_TOKEN_PATTERN = /(\d{1,2})h(\d{0,2})(?:\s*[-–]\s*(\d{1,2})h(\d{0,2}))?/i;
const TIME_TOKEN_GLOBAL = new RegExp(TIME_TOKEN_PATTERN.source, "gi");

function hmToMinutes(hourStr, minuteStr) {
  const h = Number.parseInt(hourStr, 10);
  const m = Number.parseInt((minuteStr || "0").padStart(2, "0"), 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function splitCarryoverLinesForNextDay(bodyLines) {
  if (!Array.isArray(bodyLines) || bodyLines.length < 3) {
    return { stay: bodyLines || [], carry: [] };
  }

  const timed = [];
  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i] || "";
    const m = line.match(TIME_TOKEN_PATTERN);
    if (!m) continue;
    const startMin = hmToMinutes(m[1], m[2]);
    const endMin = m[3] ? hmToMinutes(m[3], m[4]) : startMin;
    if (!Number.isFinite(startMin)) continue;
    timed.push({
      lineIndex: i,
      startMin,
      endMin: Number.isFinite(endMin) ? endMin : startMin,
    });
  }

  if (timed.length < 2) return { stay: bodyLines, carry: [] };

  let splitAt = -1;
  for (let i = 1; i < timed.length; i++) {
    const prev = timed[i - 1];
    const curr = timed[i];
    const isMorningDrop =
      curr.startMin < prev.startMin &&
      prev.startMin <= 10 * 60 + 30 &&
      curr.startMin <= 10 * 60 + 30;
    const isBacktrackOverlap =
      curr.startMin + 30 < prev.endMin &&
      curr.startMin <= 11 * 60 + 30 &&
      prev.startMin >= 6 * 60 &&
      prev.startMin <= 11 * 60 + 30;
    if (isMorningDrop || isBacktrackOverlap) splitAt = curr.lineIndex;
  }

  if (splitAt < 0) return { stay: bodyLines, carry: [] };
  if (bodyLines.length - splitAt > 20) return { stay: bodyLines, carry: [] };

  const carryTimedCount = timed.filter((t) => t.lineIndex >= splitAt).length;
  if (carryTimedCount < 2) return { stay: bodyLines, carry: [] };

  return {
    stay: bodyLines.slice(0, splitAt),
    carry: bodyLines.slice(splitAt),
  };
}

function parseDayItemsFromTextFallback(dayBodyText, inheritedLocation) {
  const items = [];
  let lastLocation = inheritedLocation || "";
  let pendingActivityPrefix = "";
  let pendingNotesForNext = "";
  const matches = [...dayBodyText.matchAll(TIME_TOKEN_GLOBAL)];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].index : dayBodyText.length;
    const segmentText = dayBodyText.slice(match.index + match[0].length, nextStart).trim();
    const leadContext = dayBodyText.slice(Math.max(0, (match.index || 0) - 100), match.index || 0);
    const timeStr = `${match[1]}h${(match[2] || "00").padStart(2, "0")}` + (match[3] ? ` - ${match[3]}h${(match[4] || "00").padStart(2, "0")}` : "");
    const inParens = /^\([^)]*bắt đầu[^)]*\)\s*$/i.test(segmentText) || (/\([^)]*bắt đầu[^)]*\)/i.test(segmentText.slice(0, 50)) && segmentText.length < 120);
    if (inParens && segmentText.length < 120) {
      if (items.length > 0) {
        const last = items[items.length - 1];
        last.time = (last.time + "\n(" + match[0] + " bắt đầu)").replace(/\n+/g, "\n").trim();
        const remainder = segmentText
          .replace(/^\([^)]*bắt đầu[^)]*\)\s*/i, "")
          .replace(/^\s*bắt đầu\)\s*/i, "")
          .trim();
        if (remainder) {
          last.activity = (last.activity + " " + remainder).replace(/\s+/g, " ").trim();
        }
      }
      continue;
    }
    const isSingleTime = !match[3];
    const startsWithStartNote = /^bắt đầu\)/i.test(segmentText) || /^\([^)]*bắt đầu[^)]*\)\s*/i.test(segmentText);
    if (isSingleTime && startsWithStartNote && items.length > 0 && segmentText.length < 180) {
      const last = items[items.length - 1];
      last.time = (last.time + "\n(" + match[0] + " bắt đầu)").replace(/\n+/g, "\n").trim();
      const remainder = segmentText
        .replace(/^\([^)]*bắt đầu[^)]*\)\s*/i, "")
        .replace(/^\s*bắt đầu\)\s*/i, "")
        .trim();
      if (remainder) {
        last.activity = (last.activity + " " + remainder).replace(/\s+/g, " ").trim();
      }
      continue;
    }
    const isMissedShowTime =
      items.length > 0 &&
      /\(\s*nếu missed[^)]*$/i.test(leadContext) &&
      /^\)\s*\*\*/.test(segmentText) &&
      !!match[3];
    if (isMissedShowTime) {
      const last = items[items.length - 1];
      last.activity = (last.activity + " " + match[0] + ")").replace(/\s+/g, " ").trim();
      pendingActivityPrefix = segmentText
        .replace(/^\)\s*/, "")
        .replace(/(?:Ngày|Ngay|Day)\s*\d+\s*:\s*\|?/gi, " ")
        .replace(/\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b\s*\|?/g, " ")
        .replace(/\s*\|\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      continue;
    }
    let { time: timeWithNote, activity: activityText } = appendTimeNoteFromSegment(timeStr, segmentText);
    if (pendingActivityPrefix) {
      activityText = (pendingActivityPrefix + " " + activityText).replace(/\s+/g, " ").trim();
      pendingActivityPrefix = "";
    }
    const splitColumns = splitActivityAndNotesFromSegment(activityText);
    activityText = splitColumns.activity || activityText;
    let notesText = splitColumns.notes || "";
    if (pendingNotesForNext) {
      notesText = (pendingNotesForNext + (notesText ? "\n" + notesText : "")).trim();
      pendingNotesForNext = "";
    }
    if (i + 1 < matches.length && notesText) {
      const lines = notesText.split("\n").map((s) => s.trim()).filter(Boolean);
      const moveLines = lines.filter((line) => normalizeForCompare(line).startsWith("luc ve"));
      if (moveLines.length > 0) {
        notesText = lines.filter((line) => !normalizeForCompare(line).startsWith("luc ve")).join("\n").trim();
        pendingNotesForNext = moveLines.join("\n");
      }
    }
    let extractedLocation = "";
    if (notesText) {
      const trailingParen = activityText.match(/\s*\(([^)]+)\)\s*$/);
      if (trailingParen) {
        const maybeLoc = trailingParen[1].trim();
        if (/,/.test(maybeLoc) && maybeLoc.length <= 120) {
          extractedLocation = maybeLoc;
          activityText = activityText.slice(0, trailingParen.index).trim();
        }
      }
    }
    const { notes: stripNotes, rest: activityFinal } = stripTimeNotesFromActivity(activityText);
    if (stripNotes.length > 0) {
      timeWithNote = timeWithNote + stripNotes.join("");
      activityText = activityFinal;
    }
    items.push({
      time: timeWithNote,
      location: extractedLocation || lastLocation,
      activity: activityText.replace(/\s+/g, " ").trim(),
      notes: notesText,
      mapsUrl: "",
    });
    const loc = activityText.split("\n")[0].trim();
    if (extractedLocation) lastLocation = extractedLocation;
    if (loc && loc.length < 100 && !/^\d{1,2}h/.test(loc) && !/^\([^)]+\)\s*$/.test(loc)) lastLocation = loc;
  }
  return { items, lastLocation };
}

export function parseItineraryTextFallback(rawText) {
  const lines = rawText
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s && !PAGE_FOOTER.test(s))
    .filter((s) => !/^(?:ngày|ngay)\s+địa điểm\b|^(?:địa điểm|nội dung)$|^(?:thời gian)(?:\s+hoạt động)?$/i.test(s));

  let title = "My Trip";
  const sections = [];
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TITLE_PATTERN.test(line) && line.length < 100 && !currentSection) {
      title = line;
      continue;
    }
    let dayMatch = line.match(DAY_HEADER_PATTERN);
    if (!dayMatch && line.length < 80) {
      dayMatch = line.match(DAY_HEADER_ANYWHERE);
    }
    if (dayMatch) {
      const dayNum = dayMatch[1];
      const rawRemainder = (dayMatch[2] || "").trim();
      const cleanedRemainder = rawRemainder.replace(/^\|+\s*/, "").trim();
      const headerHasTime = TIME_TOKEN_PATTERN.test(cleanedRemainder);
      const headerBodyLines = [];
      if (headerHasTime && cleanedRemainder) {
        headerBodyLines.push(cleanedRemainder);
      }
      let dateStr = headerHasTime ? "" : cleanedRemainder;
      if (!dateStr && i + 1 < lines.length && DATE_PATTERN.test(lines[i + 1])) {
        dateStr = lines[i + 1].trim();
        i++;
      }
      if (currentSection && currentSection.dayNum === dayNum) {
        if (!currentSection.date && dateStr) currentSection.date = dateStr;
        if (headerBodyLines.length > 0) currentSection.body.push(...headerBodyLines);
        continue;
      }
      let carryBody = [];
      if (currentSection) {
        const split = splitCarryoverLinesForNextDay(currentSection.body);
        currentSection.body = split.stay;
        carryBody = split.carry;
        sections.push(currentSection);
      }
      currentSection = { dayNum, date: dateStr, body: [...carryBody, ...headerBodyLines] };
    } else if (currentSection) {
      currentSection.body.push(line);
    } else {
      if (!currentSection) currentSection = { dayNum: "1", date: "", body: [] };
      currentSection.body.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);

  const days = [];
  let carryLocation = "";
  for (const section of sections) {
    const dayText = section.body.join("\n").trim();
    const parsed = parseDayItemsFromTextFallback(dayText, carryLocation);
    carryLocation = parsed.lastLocation || carryLocation;
    days.push({
      label: `Day ${section.dayNum}`,
      date: section.date || "",
      location: parsed.items[0]?.location || carryLocation || "",
      items: parsed.items,
    });
  }
  if (days.length === 0) days.push({ label: "Day 1", date: "", location: "", items: [] });
  return { title, days };
}
