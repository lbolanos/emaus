import { Router } from 'express';
import {
	createParticipant,
	createCoupleParticipant,
	deleteParticipant,
	getAllParticipants,
	getParticipantById,
	getParticipantNextMeeting,
	getParticipantShirtOrder,
	importParticipants,
	updateParticipant,
	updateSelfParticipant,
	checkParticipantEmail,
	confirmExistingParticipantEmail,
	checkInParticipant,
	updateAttendanceConfirmation,
	updateParticipantPhones,
	changeParticipantEmail,
	getReceptionStats,
	getParticipantByDeleteToken,
	deleteParticipantByDeleteToken,
	logHealthDataExport,
} from '../controllers/participantController';
import { validateRequest } from '../middleware/validateRequest';
import {
	createParticipantSchema,
	createCoupleParticipantSchema,
	updateParticipantSchema,
	updateParticipantPhonesSchema,
	changeParticipantEmailSchema,
	logHealthDataExportSchema,
} from '@repo/types';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';
import { publicParticipantLimiter, emailCheckLimiter } from '../middleware/rateLimiting';

const router = Router();

// Public routes for walker and server registration (with dedicated rate limiters)
router.post('/new', publicParticipantLimiter, validateRequest(createParticipantSchema), createParticipant);

// Public couple registration (retiros retreat_type='couples'): one submit → both spouses linked
router.post(
	'/couple/new',
	publicParticipantLimiter,
	validateRequest(createCoupleParticipantSchema),
	createCoupleParticipant,
);

// Public check-email with reCAPTCHA protection and rate limiting
router.get('/check-email/:email', emailCheckLimiter, checkParticipantEmail);

// Public confirm-registration: auto-register existing participant for a retreat
router.post('/confirm-registration', publicParticipantLimiter, confirmExistingParticipantEmail);

// Public self-service data deletion (LFPDPPP/GDPR) — token-based, rate-limited
router.get('/delete-data/:token', publicParticipantLimiter, getParticipantByDeleteToken);
router.post('/delete-data/:token', publicParticipantLimiter, deleteParticipantByDeleteToken);

router.use(isAuthenticated);

router.get('/', requirePermission('participant:list'), getAllParticipants);
router.get('/:id', requirePermission('participant:read'), getParticipantById);
router.get(
	'/:id/next-meeting',
	requirePermission('participant:read'),
	getParticipantNextMeeting,
);
router.get(
	'/:id/shirt-order',
	requirePermission('participant:read'),
	getParticipantShirtOrder,
);
router.post(
	'/import/:retreatId',
	requirePermission('participant:create'),
	requireRetreatAccess('retreatId'),
	importParticipants,
);
router.get(
	'/reception/:retreatId',
	requirePermission('participant:list'),
	requireRetreatAccess('retreatId'),
	getReceptionStats,
);
router.put('/self', updateSelfParticipant);
router.put(
	'/:id/checkin',
	requirePermission('participant:update'),
	requireRetreatAccess('retreatId', 'body'),
	checkInParticipant,
);
router.patch(
	'/:id/attendance-confirmation',
	requirePermission('participant:update'),
	requireRetreatAccess('retreatId', 'body'),
	updateAttendanceConfirmation,
);
// Quick phone edit (palancas): narrow schema also strips the body so the
// controller never sees fields outside the three phones + retreatId.
router.patch(
	'/:id/phones',
	validateRequest(updateParticipantPhonesSchema, { assignParsedBody: true }),
	requirePermission('participant:update'),
	requireRetreatAccess('retreatId', 'body'),
	updateParticipantPhones,
);
// Email correction (specs/participant-email-change, D1): the email is global
// identity, so it lives behind its own permission and schema. `assignParsedBody`
// so the controller receives the normalized email (invisible-chars stripped)
// and nothing else. contextRetreatId is optional context for the audit event;
// access to the participant itself is guarded by the permission, not by a
// retreat check — the email change is global by nature.
router.patch(
	'/:id/email',
	validateRequest(changeParticipantEmailSchema, { assignParsedBody: true }),
	requirePermission('participant:identity:update'),
	changeParticipantEmail,
);
router.put(
	'/:id',
	validateRequest(updateParticipantSchema),
	requirePermission('participant:update'),
	updateParticipant,
);
router.delete('/:id', requirePermission('participant:delete'), deleteParticipant);
router.post(
	'/health-export-audit',
	requirePermission('participant:health'),
	validateRequest(logHealthDataExportSchema),
	logHealthDataExport,
);

export default router;
