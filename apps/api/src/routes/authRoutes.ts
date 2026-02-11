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
import { loginLimiter, passwordResetLimiter, emailBasedLimiter } from '../middleware/rateLimiting';

const router = Router();

// Local Auth
router.post('/register', loginLimiter, register);
router.post('/login', loginLimiter, login);

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
router.post('/password/request', passwordResetLimiter, emailBasedLimiter, requestPasswordReset);
router.post('/password/reset', passwordResetLimiter, resetPassword);

// Password Change (for authenticated users)
router.post('/password/change', isAuthenticated, changePassword);

export default router;
