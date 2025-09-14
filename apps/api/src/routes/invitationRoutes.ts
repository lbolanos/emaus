import { Router } from 'express';
import { InvitationController } from '../controllers/invitationController';
import { rateLimit } from 'express-rate-limit';

const router = Router();
const invitationController = new InvitationController();

// Rate limiting for invitation endpoint (10 requests per 15 minutes)
const invitationRateLimit = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10,
	message: {
		error: 'Too many invitation requests. Please try again later.',
	},
	standardHeaders: true,
	legacyHeaders: false,
});

// Invite users to retreat (rate limited)
router.post('/', invitationRateLimit, invitationController.inviteUsers.bind(invitationController));

// Accept invitation (no auth required)
router.post('/:id/accept', invitationController.acceptInvitation.bind(invitationController));

// Check invitation status (no auth required)
router.get('/status/:token', invitationController.getInvitationStatus.bind(invitationController));

// Validate invitation token (no auth required)
router.post(
	'/validate-token',
	invitationController.validateInvitationToken.bind(invitationController),
);

export default router;
