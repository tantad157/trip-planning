#!/usr/bin/env node
/**
 * Offline PDF parser for trip itineraries.
 * Reads Phu Quoc 4N3D 2026.pdf and outputs normalized JSON.
 * Run: npm run parse-pdf
 */

import { readFile } from "fs/promises";
import { writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  extractTokensFromPdfDoc,
  parseItineraryFromLayout,
  parseItineraryTextFallback,
  buildPageTextFromPages,
} from "../parser-core.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PDF_PATH = join(ROOT, "Phu Quoc 4N3D 2026.pdf");
const OUTPUT_PATH = join(ROOT, "public", "data", "phu-quoc-4n3d-2026.json");

const workerPath = pathToFileURL(join(ROOT, "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs")).href;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;

async function main() {
  const buffer = await readFile(PDF_PATH);
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages = await extractTokensFromPdfDoc(pdf);

  let result = parseItineraryFromLayout(pages);
  const rawText = buildPageTextFromPages(pages);
  const textResult = parseItineraryTextFallback(rawText);
  const layoutDays = result?.days?.length ?? 0;
  const textDays = textResult?.days?.length ?? 0;
  if (textDays >= layoutDays && textDays > 0) {
    result = textResult;
  } else if (!result || layoutDays === 0) {
    result = textResult;
  }

  for (const day of result.days) {
    for (const item of day.items || []) {
      if (!("mapsUrl" in item)) item.mapsUrl = "";
    }
  }

  const dayCount = result.days.length;
  const itemCount = result.days.reduce((n, d) => n + (d.items?.length ?? 0), 0);
  console.log(`Parsed: ${dayCount} days, ${itemCount} activities.`);

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, JSON.stringify(result, null, 2), "utf8");
  console.log(`Wrote ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
