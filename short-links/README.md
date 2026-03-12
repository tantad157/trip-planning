# Short Links for Trip Planner

Static GitHub Pages URL shortener for trip-planning share links. Uses [gh-pages-url-shortener-action](https://github.com/pndurette/gh-pages-url-shortener-action).

## Setup

1. Create a new GitHub repo (e.g. `short-links` or `trip-links`).
2. Copy the contents of this folder into the new repo.
3. Enable GitHub Pages: **Settings → Pages** → Source: **GitHub Actions**.
4. Push to `main` — the workflow deploys automatically.

## Adding a short link

1. Generate a share link in the Trip Planner app (Share → Copy).
2. Edit `.github/urls.yml` and add a mapping:

```yaml
---
trip: "https://tantad157.github.io/trip-planning/"
my-vacation: "https://tantad157.github.io/trip-planning/#d=YOUR_HASH_HERE"
```

3. Push to `main`. The short URL will be live at `https://<username>.github.io/<repo>/my-vacation`.

## Default redirect

The root path (`/`) redirects to the Trip Planner app. To change this, add `default_redirect` to the workflow step:

```yaml
- name: Generate URL Shortener
  uses: pndurette/gh-pages-url-shortener-action@v2
  with:
    default_redirect: "https://tantad157.github.io/trip-planning/"
```
