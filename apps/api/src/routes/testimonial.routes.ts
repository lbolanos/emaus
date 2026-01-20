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

// All other routes require authentication
router.use(isAuthenticated);

// ==================== TESTIMONIAL CRUD ====================

// Create testimonial
router.post('/testimonials', createTestimonialController);

// Get feed of testimonials (filtered by visibility)
router.get('/testimonials', getTestimonialsController);

// Get testimonials by retreat
router.get('/testimonials/retreat/:retreatId', getTestimonialsByRetreatController);

// Get testimonials by user
router.get('/testimonials/user/:userId', getUserTestimonialsController);

// Update testimonial
router.put('/testimonials/:id', updateTestimonialController);

// Delete testimonial
router.delete('/testimonials/:id', deleteTestimonialController);

// ==================== LANDING PAGE APPROVAL (SUPERADMIN) ====================

// Approve testimonial for landing page
router.put('/testimonials/:id/approve-landing', approveForLandingController);

// Revoke landing page approval
router.put('/testimonials/:id/revoke-landing', revokeLandingApprovalController);

// ==================== USER PREFERENCES ====================

// Get default visibility setting
router.get('/testimonials/settings/default-visibility', getDefaultVisibilityController);

// Set default visibility setting
router.put('/testimonials/settings/default-visibility', setDefaultVisibilityController);

export default router;
