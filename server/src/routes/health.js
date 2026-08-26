import { Router } from 'express';
import { checkConnection } from '../db/pool.js';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'styletransfer-api' });
});

router.get('/db', async (_req, res) => {
  try {
    const now = await checkConnection();
    res.json({ status: 'ok', database: 'connected', time: now });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable', message: err.message });
  }
});

export default router;
