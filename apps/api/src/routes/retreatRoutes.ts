import { Router } from 'express';
import {
	getAllRetreats,
	createRetreat,
	getRetreatById,
	updateRetreat,
	getRetreatByIdPublic,
	getRetreatBySlugPublic,
	checkSlugAvailability,
	getPublicRetreats,
	getActiveRetreats,
	exportRoomLabelsToDocx,
	exportBadgesToDocx,
	uploadRetreatMemoryPhoto,
	updateRetreatMemory,
	getAttendedRetreats,
	refreshRetreatBeds,
} from '../controllers/retreatController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import { createRetreatSchema, updateRetreatSchema } from '@repo/types';
import { requirePermission, requireRetreatAccess } from '../middleware/authorization';

const router = Router();

// Public route for retreat validation (used in registration form)
router.get('/public', getPublicRetreats);
router.get('/public/slug/:slug', getRetreatBySlugPublic);
router.get('/public/slug-available/:slug', checkSlugAvailability);
router.get('/public/:id', getRetreatByIdPublic);

// Public route used by the AWS Lambda auto-stop scheduler to know whether
// a retreat is currently running (±1 day buffer) and the instance must stay up.
router.get('/active', getActiveRetreats);

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
router.post('/:id/memory-photo', requireRetreatAccess('id'), uploadRetreatMemoryPhoto);

router.put('/:id/memory', requireRetreatAccess('id'), updateRetreatMemory);

router.post(
	'/:id/refresh-beds',
	requirePermission('retreat:update'),
	(req: any, res: any, next: any) => refreshRetreatBeds(req, res, next),
);

export default router;
