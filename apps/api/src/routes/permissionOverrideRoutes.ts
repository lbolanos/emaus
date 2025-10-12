import { Router } from 'express';
import {
	setPermissionOverrides,
	getPermissionOverrides,
	clearPermissionOverrides,
	getRetreatPermissionOverrides,
	getUserPermissionsWithOverrides,
} from '../controllers/permissionOverrideController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requireRetreatAccessOrCreator } from '../middleware/authorization';

const router = Router();

// All routes require authentication
router.use(isAuthenticated);

// Set permission overrides for a user in a retreat - only retreat creators
router.post(
	'/retreats/:retreatId/users/:userId/overrides',
	requireRetreatAccessOrCreator,
	(req: any, res: any) => setPermissionOverrides(req, res),
);

// Get permission overrides for a user in a retreat
router.get(
	'/retreats/:retreatId/users/:userId/overrides',
	requireRetreatAccessOrCreator,
	(req: any, res: any) => getPermissionOverrides(req, res),
);

// Clear permission overrides for a user in a retreat - only retreat creators
router.delete(
	'/retreats/:retreatId/users/:userId/overrides',
	requireRetreatAccessOrCreator,
	(req: any, res: any) => clearPermissionOverrides(req, res),
);

// Get all permission overrides for a retreat - only retreat creators
router.get('/retreats/:retreatId/overrides', requireRetreatAccessOrCreator, (req: any, res: any) =>
	getRetreatPermissionOverrides(req, res),
);

// Get user's effective permissions with overrides applied
router.get(
	'/retreats/:retreatId/users/:userId/effective-permissions',
	requireRetreatAccessOrCreator,
	(req: any, res: any) => getUserPermissionsWithOverrides(req, res),
);

export default router;
