import { Router } from 'express';
import { passport } from '../services/authService';
import {
  googleCallback,
  getAuthStatus,
  logout,
  register,
  login,
  requestPasswordReset,
  resetPassword,
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
  googleCallback
);

// Session Management
router.get('/status', getAuthStatus);
router.post('/logout', logout);

// Password Reset
router.post('/password/request', requestPasswordReset);
router.post('/password/reset', resetPassword);

export default router;
