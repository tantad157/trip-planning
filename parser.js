/**
 * PDF parser for trip itineraries.
 * Extracts text via pdf.js and segments by time stamps into { time, location, activity, notes }.
 */

(function (global) {
  "use strict";

  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const TIME_RANGE_PATTERN = /(\d{1,2})h(\d{0,2})\s*[-–]\s*(\d{1,2})h(\d{0,2})/i;
  const TIME_RANGE_GLOBAL_PATTERN = /(\d{1,2})h(\d{0,2})\s*[-–]\s*(\d{1,2})h(\d{0,2})/gi;
  const DAY_HEADER_PATTERN = /^(?:Ngày|Ngay|Day)\s*(\d+)\s*[:\s]*(.*)/i;
  const DATE_PATTERN = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/;

  /**
   * Build one page's text with line breaks from item positions.
   * pdf.js items have transform[4]=X, transform[5]=Y (PDF coords: origin bottom-left).
   */
  function buildPageTextFromItems(items) {
    if (!items || items.length === 0) return "";

    const LINE_Y_THRESHOLD = 3;
    const COLUMN_X_GAP = 18;
    const LARGE_COLUMN_X_GAP = 42;

    const withPos = items
      .map((item) => {
      const t = item.transform || [];
      return {
        str: item.str || "",
        x: t[4] ?? 0,
        y: t[5] ?? 0,
        height: item.height ?? 12,
      };
      })
      .filter((o) => o.str !== "");

    // Sort: Y descending (top to bottom in visual order), then X ascending
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
          prevX = token.x + Math.max(token.str.length * 4.8, 8);
        }
        return line.trim();
      })
      .filter(Boolean);

    return lines.join("\n");
  }

  async function extractTextFromPdf(source) {
    const pdf = await pdfjsLib.getDocument(source).promise;
    const numPages = pdf.numPages;
    const chunks = [];

    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = buildPageTextFromItems(content.items);
      chunks.push(pageText);
    }

    return chunks.join("\n\n");
  }

  function formatTimeStr(m) {
    return `${m[1]}h${(m[2] || "00").padStart(2, "0")} - ${m[3]}h${(m[4] || "00").padStart(2, "0")}`;
  }

  /** Extract parenthetical chunks into notes, return { main, notes } */
  function splitActivityAndNotes(text) {
    const mainParts = [];
    const noteParts = [];
    let rest = (text || "").trim();
    while (rest.length > 0) {
      const open = rest.indexOf("(");
      if (open === -1) {
        mainParts.push(rest);
        break;
      }
      mainParts.push(rest.slice(0, open).trim());
      let depth = 1;
      let close = open + 1;
      while (close < rest.length && depth > 0) {
        if (rest[close] === "(") depth++;
        else if (rest[close] === ")") depth--;
        close++;
      }
      const paren = rest.slice(open, close);
      noteParts.push(paren);
      rest = rest.slice(close).trim();
    }
    return {
      activity: mainParts.join(" ").replace(/\s+/g, " ").trim(),
      notes: noteParts.join(" ").replace(/\s+/g, " ").trim(),
    };
  }

  function looksLikeLocation(text) {
    if (!text) return false;
    const s = text.trim();
    if (!s || s.length > 140) return false;
    if (/^\d{1,2}h\d{0,2}\s*[-–]/i.test(s)) return false;
    if (/,/.test(s)) return true;
    if (/\([^)]*(đường|duong|st\.?|street|phường|ward|tp|city|airport|sân bay|san bay)[^)]*\)/i.test(s)) {
      return true;
    }
    return /\b(sân bay|san bay|airport|khách sạn|hotel|resort|beach|biển|vinwonders|safari|grand world|cảng|port|chợ|market|cafe|nhà hàng|restaurant|đường|duong|street)\b/i.test(
      s
    );
  }

  function pickLocationFromPrefix(prefixText) {
    if (!prefixText) return "";
    const parts = prefixText
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (looksLikeLocation(parts[i])) return parts[i];
    }
    return "";
  }

  function parseDayItemsFromText(dayBodyText, inheritedLocation) {
    const items = [];
    let lastLocation = inheritedLocation || "";
    const matches = [...dayBodyText.matchAll(TIME_RANGE_GLOBAL_PATTERN)];

    if (matches.length === 0) {
      const fallback = dayBodyText
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
      fallback.forEach((line) => {
        const m = line.match(TIME_RANGE_PATTERN);
        if (m) {
          const textAfter = line.replace(TIME_RANGE_PATTERN, "").trim();
          const split = splitActivityAndNotes(textAfter);
          items.push({
            time: formatTimeStr(m),
            location: lastLocation,
            activity: split.activity,
            notes: split.notes,
          });
        } else if (items.length > 0) {
          const split = splitActivityAndNotes(line);
          const last = items[items.length - 1];
          if (split.activity) last.activity = `${last.activity}\n${split.activity}`.trim();
          if (split.notes) last.notes = `${last.notes}\n${split.notes}`.trim();
        }
      });
      return { items, lastLocation };
    }

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const prevEnd = i === 0 ? 0 : matches[i - 1].index + matches[i - 1][0].length;
      const nextStart = i + 1 < matches.length ? matches[i + 1].index : dayBodyText.length;
      const prefixText = dayBodyText.slice(prevEnd, match.index).trim();
      const segmentText = dayBodyText.slice(match.index + match[0].length, nextStart).trim();

      let location = pickLocationFromPrefix(prefixText);
      if (!location && looksLikeLocation(segmentText.split("\n")[0])) {
        location = segmentText.split("\n")[0].trim();
      }
      if (!location) location = lastLocation || "";

      let normalizedSegment = segmentText;
      if (location && normalizedSegment.toLowerCase().startsWith(location.toLowerCase())) {
        normalizedSegment = normalizedSegment.slice(location.length).trim();
      }
      if (!normalizedSegment) normalizedSegment = prefixText;

      const split = splitActivityAndNotes(normalizedSegment);
      const entry = {
        time: formatTimeStr(match),
        location,
        activity: split.activity || "",
        notes: split.notes || "",
      };
      items.push(entry);
      if (entry.location) lastLocation = entry.location;
    }

    return { items, lastLocation };
  }

  /**
   * Parse raw PDF text into structured trip data.
   * Uses time-range anchors to segment; items: { time, location, activity, notes }
   */
  function parseItineraryText(rawText) {
    const lines = rawText
      .split(/\n+/)
      .map((s) => s.trim())
      .filter((s) => s && !/^--\s*\d+\s+of\s+\d+\s*--/i.test(s));

    let title = "My Trip";
    const sections = [];
    let currentSection = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const dateRangeMatch = line.match(/\(([^)]*?\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}[^)]*)\)/);
      if (dateRangeMatch && line.length < 100 && !currentSection) {
        title = line;
        continue;
      }

      const dayMatch = line.match(DAY_HEADER_PATTERN);
      if (dayMatch) {
        if (currentSection) sections.push(currentSection);
        const dayNum = dayMatch[1];
        let dateStr = (dayMatch[2] || "").trim();
        if (!dateStr && i + 1 < lines.length && DATE_PATTERN.test(lines[i + 1])) {
          dateStr = lines[i + 1].trim();
          i++;
        }
        currentSection = { dayNum, date: dateStr, body: [] };
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
    sections.forEach((section, index) => {
      const dayText = section.body.join("\n").trim();
      const parsed = parseDayItemsFromText(dayText, carryLocation);
      carryLocation = parsed.lastLocation || carryLocation;
      const day = {
        label: `Day ${section.dayNum || index + 1}`,
        date: section.date || "",
        location: parsed.items[0]?.location || carryLocation || "",
        items: parsed.items,
      };
      days.push(day);
    });

    if (days.length === 0) {
      days.push({ label: "Day 1", date: "", location: "", items: [] });
    }

    return { title, days };
  }

  async function parsePdfFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const rawText = await extractTextFromPdf(arrayBuffer);
    return parseItineraryText(rawText);
  }

  global.TripParser = {
    parsePdfFile,
    parseItineraryText,
    extractTextFromPdf,
  };
})(typeof window !== "undefined" ? window : this);
