import { Router } from 'express';
import { UserManagementController } from '../controllers/userManagementController';

const router = Router();
const userManagementController = new UserManagementController();

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

// Verify SMTP connection
router.get(
	'/verify-smtp',
	userManagementController.verifySmtpConnection.bind(userManagementController),
);

export default router;
