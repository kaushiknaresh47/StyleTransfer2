import { Router } from 'express';
import health from './health.js';
import styles from './styles.js';

// Mounted at /api by app.js, so these become /api/health and /api/styles.
const router = Router();

router.use('/health', health);
router.use('/styles', styles);

export default router;
