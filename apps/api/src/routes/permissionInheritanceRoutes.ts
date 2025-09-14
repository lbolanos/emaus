import { Router } from 'express';
import {
	getInheritedPermissions,
	getEffectivePermissions,
	checkDelegationPossibility,
	createPermissionDelegation,
	getActiveDelegations,
	revokeDelegation,
	getInheritanceRules,
	getDelegationRules,
	addInheritanceRule,
	removeInheritanceRule,
} from '../controllers/permissionInheritanceController';
import { isAuthenticated } from '../middleware/authentication';

const router = Router();

// All permission inheritance routes require authentication
router.use(isAuthenticated);

// Get inherited permissions for a user in a retreat
router.get('/retreat/:retreatId/inherited-permissions', (req: any, res: any) =>
	getInheritedPermissions(req, res),
);

// Get effective permissions (including delegations) for a user in a retreat
router.get('/retreat/:retreatId/effective-permissions', (req: any, res: any) =>
	getEffectivePermissions(req, res),
);

// Check if delegation is possible between users
router.post('/retreat/:retreatId/user/:toUserId/delegation-check', (req: any, res: any) =>
	checkDelegationPossibility(req, res),
);

// Create permission delegation
router.post('/retreat/:retreatId/user/:toUserId/delegate', (req: any, res: any) =>
	createPermissionDelegation(req, res),
);

// Get active delegations for a user
router.get('/retreat/:retreatId/delegations', (req: any, res: any) =>
	getActiveDelegations(req, res),
);

// Revoke a delegation
router.delete('/delegation/:delegationId', (req: any, res: any) => revokeDelegation(req, res));

// System administration routes for managing inheritance rules
router.get('/inheritance-rules', (req: any, res: any) => getInheritanceRules(req, res));
router.get('/delegation-rules', (req: any, res: any) => getDelegationRules(req, res));

// Add inheritance rule (system admin only)
router.post('/inheritance-rules', (req: any, res: any) => addInheritanceRule(req, res));

// Remove inheritance rule (system admin only)
router.delete('/inheritance-rules/:parentRole/:childRole', (req: any, res: any) =>
	removeInheritanceRule(req, res),
);

export default router;
