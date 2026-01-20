import { Router } from 'express';
import {
	getAllRetreats,
	createRetreat,
	getRetreatById,
	updateRetreat,
	getRetreatByIdPublic,
	getPublicRetreats,
	exportRoomLabelsToDocx,
	exportBadgesToDocx,
	uploadRetreatMemoryPhoto,
	updateRetreatMemory,
	getAttendedRetreats,
} from '../controllers/retreatController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import { createRetreatSchema, updateRetreatSchema } from '@repo/types';
import { requirePermission } from '../middleware/authorization';

const router = Router();

// Public route for retreat validation (used in registration form)
router.get('/public', getPublicRetreats);
router.get('/public/:id', getRetreatByIdPublic);

// Authenticated routes
router.use(isAuthenticated);

router.get('/', requirePermission('retreat:read'), (req: any, res: any, next: any) =>
	getAllRetreats(req, res, next),
);
router.post('/', validateRequest(createRetreatSchema), (req: any, res: any, next: any) =>
	createRetreat(req, res, next),
);

// Get retreats attended by the current user (must be before /:id route)
router.get('/attended', getAttendedRetreats);

router.get('/:id', requirePermission('retreat:read'), (req: any, res: any, next: any) =>
	getRetreatById(req, res, next),
);
router.put(
	'/:id',
	validateRequest(updateRetreatSchema),
	requirePermission('retreat:update'),
	(req: any, res: any, next: any) => updateRetreat(req, res, next),
);

router.post(
	'/:id/export-room-labels',
	requirePermission('retreat:read'),
	(req: any, res: any, next: any) => exportRoomLabelsToDocx(req, res, next),
);

router.post(
	'/:id/export-badges',
	requirePermission('retreat:read'),
	(req: any, res: any, next: any) => exportBadgesToDocx(req, res, next),
);

// Retreat memory routes
router.post('/:id/memory-photo', uploadRetreatMemoryPhoto);

router.put('/:id/memory', updateRetreatMemory);

export default router;
