import { Router } from 'express';
import {
	listSlots,
	createSlot,
	updateSlot,
	deleteSlot,
	generateSlots,
	regenerateFromSchedule,
	listSignupsForSlot,
	adminCreateSignup,
	deleteSignup,
	getParticipantAssignedSlots,
	publicGetSchedule,
	publicCreateSignup,
	publicCancelSignup,
} from '../controllers/santisimoController';
import {
	getParticipantAvailability,
	setParticipantAvailability,
	listEligibleServersForSlot,
	getMealWindowAngelitoCoverage,
} from '../controllers/participantAvailabilityController';
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
router.post(
	'/retreats/:retreatId/slots/regenerate-from-schedule',
	requirePermission('santisimo:manage'),
	regenerateFromSchedule,
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

// Slots asignados a un participante en un retiro
router.get(
	'/retreats/:retreatId/participants/:participantId/assigned-slots',
	requirePermission('santisimo:read'),
	getParticipantAssignedSlots,
);

// Angelito availability per retreat
router.get(
	'/retreats/:retreatId/participants/:participantId/availability',
	requirePermission('santisimo:read'),
	getParticipantAvailability,
);
router.put(
	'/retreats/:retreatId/participants/:participantId/availability',
	requirePermission('santisimo:manage'),
	setParticipantAvailability,
);

// Lista de servidores elegibles para un slot (filtra angelitos por horario)
router.get(
	'/retreats/:retreatId/slots/:slotId/eligible-servers',
	requirePermission('santisimo:read'),
	listEligibleServersForSlot,
);

// Conteo de angelitos disponibles por cada slot mealWindow del retiro
router.get(
	'/retreats/:retreatId/mealwindow-coverage',
	requirePermission('santisimo:read'),
	getMealWindowAngelitoCoverage,
);

export default router;
