import { Router } from 'express';
import { getRetreatPreview } from '../controllers/ogController';

const router = Router();

// Public: nginx proxies crawler requests for /<slug> and /<slug>/server here.
// No authentication — the response only exposes data already shown on the
// public registration page (parish, dates, house and city).
router.get('/:slug', getRetreatPreview);
router.get('/:slug/server', getRetreatPreview);

export default router;
