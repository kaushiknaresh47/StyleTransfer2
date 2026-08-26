import 'dotenv/config';
import app from './app.js';
import { pool } from './db/pool.js';

const PORT = Number(process.env.PORT) || 4000;

const server = app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

const shutdown = async (signal) => {
  console.log(`\n${signal} received, shutting down...`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
