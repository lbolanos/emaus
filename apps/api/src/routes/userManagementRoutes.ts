import { Router } from 'express';
import { UserManagementController } from '../controllers/userManagementController';
import { isAuthenticated } from '../middleware/isAuthenticated';
import { requirePermission } from '../middleware/authorization';

const router = Router();
const userManagementController = new UserManagementController();

// All user management routes require authentication
router.use(isAuthenticated);

// Invite user to retreat
router.post('/invite', userManagementController.inviteUserToRetreat.bind(userManagementController));

// Send password reset email
router.post(
	'/password-reset',
	userManagementController.sendPasswordReset.bind(userManagementController),
);

// Notify retreat shared
router.post(
	'/notify-shared',
	userManagementController.notifyRetreatShared.bind(userManagementController),
);

// Verify SMTP connection (admin-only operation)
router.get(
	'/verify-smtp',
	requirePermission('user:manage'),
	userManagementController.verifySmtpConnection.bind(userManagementController),
);

export default router;
