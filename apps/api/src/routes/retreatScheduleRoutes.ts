import { Router } from 'express';
import {
	listItems,
	createItem,
	updateItem,
	deleteItem,
	startItem,
	completeItem,
	shiftItem,
	shiftDay,
	reorderDay,
	materialize,
	resolveSantisimo,
	ringBell,
	dashboardStats,
	suggestResponsables,
	bulkAssignResponsables,
	relinkResponsibilities,
	canonicalResponsabilities,
	publicGetSchedule,
	downloadRetreatBundle,
} from '../controllers/retreatScheduleController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';
import { validateRequest } from '../middleware/validateRequest';
import {
	CreateRetreatScheduleItemSchema,
	UpdateRetreatScheduleItemSchema,
	MaterializeScheduleSchema,
	ShiftScheduleSchema,
	ShiftDaySchema,
	ReorderDaySchema,
} from '@repo/types';

const router = Router();

// Public endpoint (auth-less) — must be registered BEFORE the global
// `router.use(isAuthenticated)` below. Used by the big-screen view at
// /mam/:slug for projecting the schedule in the salon during a retreat.
// Only retreats with `isPublic=true` are exposed; the response excludes
// PII (no participant emails/phones), notes, or descriptions.
router.get('/public/mam/:slug', publicGetSchedule);

router.use(isAuthenticated);

router.get('/retreats/:retreatId/items', requirePermission('schedule:read'), listItems);
router.get(
	'/retreats/:retreatId/bundle.zip',
	requirePermission('schedule:read'),
	downloadRetreatBundle,
);
router.get(
	'/retreats/:retreatId/dashboard',
	requirePermission('schedule:read'),
	dashboardStats,
);
router.post(
	'/retreats/:retreatId/items',
	validateRequest(CreateRetreatScheduleItemSchema),
	requirePermission('schedule:manage'),
	createItem,
);
router.post(
	'/retreats/:retreatId/materialize',
	validateRequest(MaterializeScheduleSchema),
	requirePermission('schedule:manage'),
	materialize,
);
router.post(
	'/retreats/:retreatId/resolve-santisimo',
	requirePermission('schedule:manage'),
	resolveSantisimo,
);
router.post(
	'/retreats/:retreatId/bell',
	requirePermission('schedule:manage'),
	ringBell,
);
router.get(
	'/retreats/:retreatId/suggest-responsables',
	requirePermission('schedule:read'),
	suggestResponsables,
);
router.post(
	'/retreats/:retreatId/bulk-assign-responsables',
	requirePermission('schedule:manage'),
	bulkAssignResponsables,
);
router.post(
	'/retreats/:retreatId/relink-responsibilities',
	requirePermission('schedule:manage'),
	relinkResponsibilities,
);
router.get(
	'/canonical-responsabilities',
	requirePermission('scheduleTemplate:read'),
	canonicalResponsabilities,
);
router.patch(
	'/items/:id',
	validateRequest(UpdateRetreatScheduleItemSchema),
	requirePermission('schedule:manage'),
	updateItem,
);
router.delete('/items/:id', requirePermission('schedule:manage'), deleteItem);
router.post('/items/:id/start', requirePermission('schedule:manage'), startItem);
router.post('/items/:id/complete', requirePermission('schedule:manage'), completeItem);
router.post(
	'/items/:id/shift',
	validateRequest(ShiftScheduleSchema),
	requirePermission('schedule:manage'),
	shiftItem,
);
router.post(
	'/retreats/:retreatId/days/:day/shift',
	validateRequest(ShiftDaySchema),
	requirePermission('schedule:manage'),
	shiftDay,
);
router.post(
	'/retreats/:retreatId/days/:day/reorder',
	validateRequest(ReorderDaySchema),
	requirePermission('schedule:manage'),
	reorderDay,
);

export default router;
