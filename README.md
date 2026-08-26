# StyleTransfer

PERN stack scaffold: React (Vite) + Express + Node.js + PostgreSQL.

```
StyleTransfer/
├── client/          # React + Vite frontend (port 5173, proxies /api → 4000)
└── server/          # Express API (port 4000)
    └── src/
        ├── app.js        # Express app + middleware
        ├── index.js      # server entry / graceful shutdown
        ├── db/pool.js    # pg connection pool
        └── routes/       # API routes
```

## Setup

```bash
cd server && npm install && cp .env.example .env
```

```bash
cd client && npm install
```

Edit `server/.env` with your PostgreSQL credentials (`DATABASE_URL`, or the
discrete `PG*` vars). No schema or migrations yet — the pool just connects.

## Run

Two terminals:

```bash
cd server && npm run dev
```

```bash
cd client && npm run dev
```

Open http://localhost:5173. The page reports API and database status.

## Endpoints

- `GET /api/health` — API liveness
- `GET /api/health/db` — runs `SELECT NOW()` against PostgreSQL
