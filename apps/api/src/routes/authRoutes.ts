import { Router } from 'express';
import { passport } from '../services/authService';
import { isAuthenticated } from '../middleware/authentication';
import {
	googleCallback,
	getAuthStatus,
	logout,
	register,
	login,
	requestPasswordReset,
	resetPassword,
	changePassword,
} from '../controllers/authController';

const router = Router();

// Local Auth
router.post('/register', register);
router.post('/login', login);

// Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
	'/google/callback',
	passport.authenticate('google', { failureRedirect: '/login' }),
	googleCallback,
);

// Session Management
router.get('/status', getAuthStatus);
router.post('/logout', logout);

// Password Reset
router.post('/password/request', requestPasswordReset);
router.post('/password/reset', resetPassword);

// Password Change (for authenticated users)
router.post('/password/change', isAuthenticated, changePassword);

export default router;
