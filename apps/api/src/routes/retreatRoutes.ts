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
	getRetreatMemories,
	addRetreatMemoryPhoto,
	deleteRetreatMemoryPhoto,
	setPrimaryRetreatMemoryPhoto,
	addRetreatMemorySong,
	updateRetreatMemorySong,
	deleteRetreatMemorySong,
	setPrimaryRetreatMemorySong,
	importRetreatMemorySongsFromMam,
	getAttendedRetreats,
	refreshRetreatBeds,
	deleteRetreat,
	getRetreatDeletionImpact,
} from '../controllers/retreatController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { validateRequest } from '../middleware/validateRequest';
import {
	createRetreatSchema,
	updateRetreatSchema,
	createRetreatMemoryPhotoSchema,
	createRetreatMemorySongSchema,
	updateRetreatMemorySongSchema,
} from '@repo/types';
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

router.delete(
	'/:id',
	requirePermission('retreat:delete'),
	(req: any, res: any, next: any) => deleteRetreat(req, res, next),
);

router.get(
	'/:id/deletion-impact',
	requirePermission('retreat:read'),
	(req: any, res: any, next: any) => getRetreatDeletionImpact(req, res, next),
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

// Retreat memory routes (legacy single-value, kept for cached clients)
router.post('/:id/memory-photo', requireRetreatAccess('id'), uploadRetreatMemoryPhoto);

router.put('/:id/memory', requireRetreatAccess('id'), updateRetreatMemory);

// Retreat memory gallery routes (multiple photos + songs)
router.get('/:id/memories', requireRetreatAccess('id'), getRetreatMemories);

router.post(
	'/:id/memory-photos',
	requireRetreatAccess('id'),
	validateRequest(createRetreatMemoryPhotoSchema),
	addRetreatMemoryPhoto,
);
router.delete(
	'/:id/memory-photos/:photoId',
	requireRetreatAccess('id'),
	deleteRetreatMemoryPhoto,
);
router.put(
	'/:id/memory-photos/:photoId/primary',
	requireRetreatAccess('id'),
	setPrimaryRetreatMemoryPhoto,
);

router.post(
	'/:id/memory-songs',
	requireRetreatAccess('id'),
	validateRequest(createRetreatMemorySongSchema),
	addRetreatMemorySong,
);
router.post(
	'/:id/memory-songs/import-from-mam',
	requireRetreatAccess('id'),
	importRetreatMemorySongsFromMam,
);
router.put(
	'/:id/memory-songs/:songId',
	requireRetreatAccess('id'),
	validateRequest(updateRetreatMemorySongSchema),
	updateRetreatMemorySong,
);
router.delete(
	'/:id/memory-songs/:songId',
	requireRetreatAccess('id'),
	deleteRetreatMemorySong,
);
router.put(
	'/:id/memory-songs/:songId/primary',
	requireRetreatAccess('id'),
	setPrimaryRetreatMemorySong,
);

router.post(
	'/:id/refresh-beds',
	requirePermission('retreat:update'),
	(req: any, res: any, next: any) => refreshRetreatBeds(req, res, next),
);

export default router;
