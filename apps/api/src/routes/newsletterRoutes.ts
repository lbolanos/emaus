import { Router } from 'express';
import { NewsletterController } from '../controllers/newsletterController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();

// Public routes - no authentication required
router.post('/subscribe', (req, res, next) => NewsletterController.subscribe(req, res, next));
router.post('/unsubscribe', (req, res, next) => NewsletterController.unsubscribe(req, res, next));

// Admin routes - require authentication and permission
router.use(isAuthenticated);
router.get('/subscribers', requirePermission('newsletter:read'), (req, res, next) =>
	NewsletterController.getSubscribers(req, res, next),
);

export default router;
