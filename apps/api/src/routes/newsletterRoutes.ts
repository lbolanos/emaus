import { Router } from 'express';
import { NewsletterController } from '../controllers/newsletterController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';
import { newsletterLimiter } from '../middleware/rateLimiting';

const router = Router();

// Public routes - no authentication required (rate-limited to prevent abuse)
router.post('/subscribe', newsletterLimiter, (req, res, next) => NewsletterController.subscribe(req, res, next));
router.post('/unsubscribe', newsletterLimiter, (req, res, next) => NewsletterController.unsubscribe(req, res, next));

// Admin routes - require authentication and permission
router.use(isAuthenticated);
router.get('/subscribers', requirePermission('newsletter:read'), (req, res, next) =>
	NewsletterController.getSubscribers(req, res, next),
);

export default router;
