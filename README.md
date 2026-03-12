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

## Short links

Share links can be long. For a short, reliable URL, use the self-hosted GitHub Pages shortener in the `short-links/` folder.

1. Generate a share link in the app (Share → Copy).
2. Create a new GitHub repo and push the contents of `short-links/` to it.
3. Enable GitHub Pages: **Settings → Pages** → Source: **GitHub Actions**.
4. Edit `.github/urls.yml` and add a mapping: `slug: "https://...full-link..."`.
5. Push to `main`. The short URL will be live at `https://<username>.github.io/<repo>/slug`.

The share modal suggests a slug from your trip title and shows the exact `urls.yml` line to add. No third-party shorteners or CORS proxies are used.

## Tech

- Vanilla HTML, CSS, and JavaScript
- [Vite](https://vitejs.dev/) for build and bundling
- [pdf.js](https://mozilla.github.io/pdf.js/) for PDF text extraction
- [lz-string](https://github.com/pieroxy/lz-string/) and [pako](https://github.com/nodeca/pako) for compressing shareable URLs

## Development

```bash
npm install
npm run dev      # Start dev server at http://localhost:5173/trip-planning/
npm run build    # Production build to dist/
npm run preview  # Preview production build at http://localhost:4173/trip-planning/
```

## Deploy to GitHub Pages

Deployment uses GitHub Actions to build and publish the `dist/` folder.

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Set **Source** to **GitHub Actions** (not "Deploy from a branch").
4. Push to `main` — the workflow builds and deploys automatically.
5. Your site will be live at `https://<username>.github.io/trip-planning/`.

If you prefer branch-based deployment: set source to **main** branch, **/ (root)** folder, then run `npm run build` locally and commit the `dist/` contents to a `gh-pages` branch or a `docs/` folder. The recommended approach is GitHub Actions so the repo stays clean and deploys are reproducible.

## Code exposure and security

The app is bundled and minified for production. This reduces source readability and makes casual inspection harder, but **client-side code cannot be fully hidden**. Anyone can inspect network requests, DevTools, or the built assets and reconstruct or reverse-engineer the logic.

- **Do not** embed API keys, secrets, or proprietary algorithms in client code if they must stay confidential.
- For true secrecy of logic or credentials, move sensitive parts to a backend (e.g. Cloudflare Workers, Vercel Functions, or a small API). The client would call your backend; the backend holds secrets.
