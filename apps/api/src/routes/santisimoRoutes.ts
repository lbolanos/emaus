import { Router } from 'express';
import {
	listSlots,
	createSlot,
	updateSlot,
	deleteSlot,
	generateSlots,
	listSignupsForSlot,
	adminCreateSignup,
	deleteSignup,
	publicGetSchedule,
	publicCreateSignup,
	publicCancelSignup,
} from '../controllers/santisimoController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';
import { validateRequest } from '../middleware/validateRequest';
import { publicParticipantLimiter } from '../middleware/rateLimiting';
import {
	CreateSantisimoSlotSchema,
	UpdateSantisimoSlotSchema,
	GenerateSantisimoSlotsSchema,
	AdminCreateSantisimoSignupSchema,
	PublicSantisimoSignupSchema,
} from '@repo/types';

const router = Router();

// -- Public routes (no auth) --
router.get('/public/:slug', publicGetSchedule);
router.post(
	'/public/:slug/signups',
	publicParticipantLimiter,
	validateRequest(PublicSantisimoSignupSchema),
	publicCreateSignup,
);
router.delete('/public/signups/:token', publicCancelSignup);

// -- Authenticated routes --
router.use(isAuthenticated);

router.get(
	'/retreats/:retreatId/slots',
	requirePermission('santisimo:read'),
	listSlots,
);
router.post(
	'/retreats/:retreatId/slots',
	validateRequest(CreateSantisimoSlotSchema),
	requirePermission('santisimo:manage'),
	createSlot,
);
router.post(
	'/retreats/:retreatId/slots/generate',
	validateRequest(GenerateSantisimoSlotsSchema),
	requirePermission('santisimo:manage'),
	generateSlots,
);
router.patch(
	'/slots/:id',
	validateRequest(UpdateSantisimoSlotSchema),
	requirePermission('santisimo:manage'),
	updateSlot,
);
router.delete('/slots/:id', requirePermission('santisimo:manage'), deleteSlot);
router.get('/slots/:id/signups', requirePermission('santisimo:read'), listSignupsForSlot);
router.post(
	'/retreats/:retreatId/signups',
	validateRequest(AdminCreateSantisimoSignupSchema),
	requirePermission('santisimo:manage'),
	adminCreateSignup,
);
router.delete('/signups/:id', requirePermission('santisimo:manage'), deleteSignup);

export default router;
