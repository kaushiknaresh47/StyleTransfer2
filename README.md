# StyleTransfer

Upload a photo, pick a painting, and apply its style.

PERN stack: React (Vite) + Express + Node.js + PostgreSQL.

## Layout

```
StyleTransfer/
├── client/                       React + Vite frontend — port 5173
│   ├── vite.config.js            dev proxy: /api → localhost:4000
│   └── src/
│       ├── api/styles.js         every backend call lives here
│       ├── useStyles.js          hook: loads the catalogue on mount
│       ├── App.jsx               page shell + wiring
│       └── components/
│           ├── ImageUploader.jsx drag/drop + file picker + preview
│           └── StylePicker.jsx   the grid (loading / error / ready)
│
└── server/                       Express API — port 4000
    ├── assets/styles/            the style images (served, not bundled)
    └── src/
        ├── index.js              entry, graceful shutdown
        ├── app.js                middleware, mounts routes at /api
        ├── data/stylePresets.js  source of truth for the style list
        ├── db/pool.js            pg connection pool
        └── routes/
            ├── index.js          /health, /styles
            ├── health.js
            └── styles.js         catalogue + image streaming
```

## How a request flows

The frontend never hard-codes the API host. It asks for a **relative** path,
and Vite's dev proxy forwards it to Express:

```
browser                     vite (5173)                 express (4000)
   │                             │                            │
   │  GET /api/styles            │                            │
   ├────────────────────────────>│  proxy /api → :4000        │
   │                             ├───────────────────────────>│  routes/styles.js
   │                             │                            │  reads data/stylePresets.js
   │   { styles: [ {id, name, artist, swatch, imageUrl}, … ] } │
   │<────────────────────────────┴────────────────────────────┤
   │
   │  then, one per tile, using the imageUrl from that JSON:
   │  GET /api/styles/starry-night/image
   ├────────────────────────────>│───────────────────────────>│  sendFile from assets/styles/
   │<─────────────── image/jpeg ─┴────────────────────────────┤
```

Two things worth noticing:

- **The client has no list of styles.** It renders whatever `/api/styles`
  returns. Add an entry to `server/src/data/stylePresets.js`, drop the file in
  `server/assets/styles/`, and the tile appears — no frontend change.
- **The browser never names a file.** It sends an `id`; the server looks up the
  filename in the manifest. A crafted id can't escape the assets folder.

Keeping paths relative also means the frontend is same-origin in development,
so there are no CORS preflights and no API URL baked into the bundle. In
production you'd serve the built client and the API behind one origin (or set
a base URL in `client/src/api/styles.js`).

## Endpoints

| Method | Path                     | Returns                                  |
| ------ | ------------------------ | ---------------------------------------- |
| GET    | `/api/health`            | API liveness                             |
| GET    | `/api/health/db`         | runs `SELECT NOW()` against PostgreSQL   |
| GET    | `/api/styles`            | the style catalogue as JSON              |
| GET    | `/api/styles/:id/image`  | one style image (`image/jpeg`)           |

## Setup

```bash
cd server && npm install && cp .env.example .env
```

```bash
cd client && npm install
```

Edit `server/.env` with your PostgreSQL credentials. There's no schema or
migrations yet — the pool just connects, and nothing on the landing page needs
the database.

## Run

Both are needed: the page gets its styles from the API.

```bash
cd server && npm run dev
```

```bash
cd client && npm run dev
```

Open http://localhost:5173. If the API is down the style grid shows an error
rather than failing silently.

## Not built yet

The **Apply style** button is a placeholder. Stylization needs a
`POST /api/stylize` endpoint that takes the uploaded image plus a style id.
