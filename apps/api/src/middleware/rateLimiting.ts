import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

/**
 * Aggressive rate limit for password reset
 */
export const passwordResetLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 3, // Max 3 requests per IP
	message: {
		message: 'Demasiadas solicitudes de restablecimiento. Inténtalo en 15 minutos.',
		error: 'RATE_LIMIT_EXCEEDED',
	},
	standardHeaders: true,
	legacyHeaders: false,
	keyGenerator: (req: Request) => req.ip || 'unknown',
	handler: (req: Request, res: Response) => {
		console.warn(`⚠️  Rate limit - Password reset: IP=${req.ip}, Email=${req.body.email}`);
		res.status(429).json({
			message: 'Demasiadas solicitudes. Por favor, espera.',
			error: 'RATE_LIMIT_EXCEEDED',
		});
	},
	skip: (req: Request) => {
		// Skip rate limiting in development if needed
		return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
	},
});

/**
 * Per-email rate limiter (prevent email bombing)
 */
export const emailBasedLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 5, // Max 5 requests per email per hour
	keyGenerator: (req: Request) => {
		const email = req.body.email || req.query.email || 'unknown';
		return `email-${email}`;
	},
	message: {
		message: 'Este correo ha recibido demasiadas solicitudes. Espera 1 hora.',
		error: 'EMAIL_RATE_LIMIT_EXCEEDED',
	},
	skip: (req: Request) => {
		// Skip rate limiting in development if needed
		return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
	},
});

/**
 * Login rate limiter (prevent credential stuffing)
 */
export const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 10, // Max 10 attempts
	skipSuccessfulRequests: true,
	message: {
		message: 'Demasiados intentos de inicio de sesión. Inténtalo en 15 minutos.',
		error: 'LOGIN_RATE_LIMIT_EXCEEDED',
	},
	keyGenerator: (req: Request) => {
		const email = req.body.email || 'unknown';
		return `${req.ip}-${email}`;
	},
	skip: (req: Request) => {
		// Skip rate limiting in development if needed
		return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
	},
});

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
	windowMs: 1 * 60 * 1000, // 1 minute
	max: 100, // 100 requests per minute
	message: {
		message: 'Demasiadas solicitudes. Reduce la velocidad.',
		error: 'API_RATE_LIMIT_EXCEEDED',
	},
	skip: (req: Request) => {
		// Skip rate limiting in development if needed
		return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
	},
});
