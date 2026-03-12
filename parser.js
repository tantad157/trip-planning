/**
 * PDF parser for trip itineraries (browser).
 * Uses parser-core for layout logic; pdf.js for PDF loading.
 * Kept as fallback/debug when static JSON is not loaded.
 */

import {
  tokenFromItem,
  extractTokensFromPdfDoc,
  parseItineraryFromLayout,
  parseItineraryTextFallback,
  buildPageTextFromPages,
} from "./parser-core.js";

(function (global) {
  "use strict";

  if (typeof pdfjsLib !== "undefined") {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  function extractTokensFromPdf(source) {
    return pdfjsLib.getDocument(source).promise.then((pdf) => extractTokensFromPdfDoc(pdf));
  }

  async function extractTextFromPdf(source) {
    const pdf = await pdfjsLib.getDocument(source).promise;
    const numPages = pdf.numPages;
    const chunks = [];
    for (let i = 1; i <= numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const withPos = content.items
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
      const LINE_Y_THRESHOLD = 3;
      const COLUMN_X_GAP = 18;
      const LARGE_COLUMN_X_GAP = 42;
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
      chunks.push(lines.join("\n"));
    }
    return chunks.join("\n\n");
  }

  async function parsePdfFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pages = await extractTokensFromPdf(arrayBuffer);
    const layoutResult = parseItineraryFromLayout(pages);
    const rawText = buildPageTextFromPages(pages);
    const textResult = parseItineraryTextFallback(rawText);
    const layoutDays = layoutResult?.days?.length ?? 0;
    const textDays = textResult?.days?.length ?? 0;
    if (textDays >= layoutDays && textDays > 0) return textResult;
    if (layoutResult && layoutDays > 0) return layoutResult;
    return textResult;
  }

  global.TripParser = {
    parsePdfFile,
    parseItineraryText: parseItineraryTextFallback,
    extractTextFromPdf,
    extractTokensFromPdf,
    parseItineraryFromLayout,
  };
})(typeof window !== "undefined" ? window : this);
