# Trip Planner

A simple, modern web app for planning family trips. Upload your itinerary PDF, edit it online, and share a link with your travel group.

## Features

- **Upload PDF** — Drag & drop or click to upload any itinerary PDF. The app extracts text and converts it into an editable format.
- **Edit online** — Edit trip title, days, times, activities, and notes. Add or remove activities and days.
- **Auto-save** — Changes are saved automatically to your browser's local storage.
- **Shareable links** — Generate a link that encodes your full itinerary. Anyone with the link can view and edit their own copy.
- **Free hosting** — Runs entirely in the browser. No backend required. Host for free on GitHub Pages.

## Usage

1. Open the app (or [host it on GitHub Pages](https://tantad157.github.io/trip-planning)).
2. Upload your itinerary PDF by dragging it onto the drop zone or clicking to browse.
3. Review and edit the parsed itinerary. Click day headers to collapse/expand.
4. Use **Share** to copy a link. Send it to family members so they can view and edit their own copy.
5. Use **New** to start over with a fresh upload.

## Tech

- Vanilla HTML, CSS, and JavaScript
- [pdf.js](https://mozilla.github.io/pdf.js/) for PDF text extraction
- [lz-string](https://github.com/pieroxy/lz-string/) for compressing shareable URLs
- No build step — deploy as static files

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Set source to **main** branch, root folder.
4. Your site will be live at `https://<username>.github.io/trip-planning/`.
