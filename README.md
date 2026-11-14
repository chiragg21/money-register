# Money Register

A small offline-first PWA for tracking personal finances — cash & accounts, loans with interest, recurring income, and committees (kameti / chit) — all in one place, with no backend and no account required.

## Features

- **Cash & accounts** — track balances across multiple accounts.
- **Loans** — principal, interest, and repayment tracking for money lent or borrowed.
- **Regular income** — recurring income entries (monthly/periodic).
- **Committees (kameti / chit)** — manage rotating savings groups.
- **People** — track who owes or is owed what.
- **Multiple owners** — switch between "whose money" views when tracking finances for more than one person.
- **Privacy-first** — all data stays in the browser (`localStorage`); nothing is sent to a server.
- **Optional PIN lock** — lock the app with a salted, hashed PIN.
- **Light / dark / auto theme.**
- **Backup & restore** — export/import a full JSON backup, or export the cash book as CSV. Backups from older versions of the app can also be imported.
- **Installable PWA** — works offline via a service worker, installable to your phone's home screen.

## Tech

Plain HTML, CSS, and vanilla JavaScript (ES modules) — no build step, no framework, no dependencies.

```
index.html        Entry point
js/main.js        App bootstrap, lock screen
js/core.js        Render loop, event binding, sheet/dialog UI
js/engine.js      Domain logic (loans, interest, income, committees)
js/store.js       State, persistence (localStorage), owners/scope
js/sheets.js      Form sheets (add/edit entities)
js/views-*.js     Screens (home, dues, more/settings)
js/kit.js         Shared UI helpers, icons, nav
js/util.js        Small utilities
manifest.json     PWA manifest
sw.js             Service worker (offline support)
netlify.toml      Netlify deploy config (static hosting + security headers)
```

## Running locally

No build step is needed — serve the folder with any static file server, since `index.html` loads JS as ES modules (which most browsers block over `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deployment

Configured for [Netlify](https://www.netlify.com) as a static site (`netlify.toml`) — just connect the repo and deploy, no build command required. Any static host (GitHub Pages, Vercel, Cloudflare Pages) works too.

## Data & privacy

All data is stored locally in the browser via `localStorage`. There is no server and no sync — clearing site data or switching devices/browsers will erase it, so use **Settings → Save backup** periodically to export a JSON backup you can restore later.
