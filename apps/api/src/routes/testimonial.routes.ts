import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
	createTestimonialController,
	getTestimonialsController,
	getTestimonialsByRetreatController,
	getUserTestimonialsController,
	updateTestimonialController,
	deleteTestimonialController,
	approveForLandingController,
	revokeLandingApprovalController,
	getLandingTestimonialsController,
	getDefaultVisibilityController,
	setDefaultVisibilityController,
} from '../controllers/testimonialController';
import { isAuthenticated } from '../middleware/authentication';

const router = Router();

// Rate limiter for public landing endpoint
const landingLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per windowMs
	message: { message: 'Demasiadas solicitudes, por favor intenta más tarde' },
	standardHeaders: true,
	legacyHeaders: false,
});

// ==================== PUBLIC ROUTES ====================

// Get testimonials for landing page (public, no auth required, rate limited)
router.get('/landing/testimonials', landingLimiter, getLandingTestimonialsController);

// ==================== AUTHENTICATED ROUTES ====================
// IMPORTANT: this router is mounted in `mainRouter` WITHOUT a path prefix
// (`router.use(testimonialRoutes)`), so any blanket `router.use(middleware)`
// here applies to EVERY request flowing through mainRouter — even ones meant
// for sibling routers registered later (e.g. `/schedule/public/...`). To
// avoid that side effect, attach `isAuthenticated` per-route instead of via
// `router.use(isAuthenticated)`.

// ==================== TESTIMONIAL CRUD ====================

router.post('/testimonials', isAuthenticated, createTestimonialController);
router.get('/testimonials', isAuthenticated, getTestimonialsController);
router.get('/testimonials/retreat/:retreatId', isAuthenticated, getTestimonialsByRetreatController);
router.get('/testimonials/user/:userId', isAuthenticated, getUserTestimonialsController);
router.put('/testimonials/:id', isAuthenticated, updateTestimonialController);
router.delete('/testimonials/:id', isAuthenticated, deleteTestimonialController);

// ==================== LANDING PAGE APPROVAL (SUPERADMIN) ====================

router.put('/testimonials/:id/approve-landing', isAuthenticated, approveForLandingController);
router.put('/testimonials/:id/revoke-landing', isAuthenticated, revokeLandingApprovalController);

// ==================== USER PREFERENCES ====================

router.get(
	'/testimonials/settings/default-visibility',
	isAuthenticated,
	getDefaultVisibilityController,
);
router.put(
	'/testimonials/settings/default-visibility',
	isAuthenticated,
	setDefaultVisibilityController,
);

export default router;
