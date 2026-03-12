# Trip Shortener (Cloudflare Workers)

URL shortener for trip-planning share links. Uses Cloudflare Workers + KV.

## Setup

1. Install dependencies: `npm install`
2. Login: `npx wrangler login`
3. Create KV namespace: `npx wrangler kv namespace create SHORTENER_KV`
4. Create preview namespace: `npx wrangler kv namespace create SHORTENER_KV --preview`
5. Edit `wrangler.toml`: replace `REPLACE_WITH_KV_ID` and `REPLACE_WITH_PREVIEW_ID` with the IDs from step 3–4
6. Deploy: `npm run deploy`
7. Update `wrangler.toml` `HOST_URL` with your Worker URL (e.g. `https://trip-shortener.YOUR_SUBDOMAIN.workers.dev`)
8. Redeploy: `npm run deploy`
9. In the trip-planning app, set `data-shortener-url` on `<body>` to your Worker URL (e.g. `data-shortener-url="https://trip-shortener.YOUR_SUBDOMAIN.workers.dev"`)

## API

- `POST /` or `POST /shorten` — `{ "url": "https://..." }` → `{ "url": "https://.../abc123", "slug": "abc123" }`
- `GET /:slug` — 302 redirect to long URL
- `GET /` — redirect to trip planner app
