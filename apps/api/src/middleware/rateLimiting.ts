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
 * Registration rate limiter (prevent mass account creation)
 * Stricter than login: IP-only key, lower cap
 */
export const registerLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 5, // Max 5 registration attempts per IP per hour
	skipSuccessfulRequests: false,
	message: {
		message: 'Demasiados intentos de registro. Inténtalo en 1 hora.',
		error: 'REGISTER_RATE_LIMIT_EXCEEDED',
	},
	keyGenerator: (req: Request) => req.ip || 'unknown',
	handler: (req: Request, res: Response) => {
		console.warn(`⚠️  Rate limit - Register: IP=${req.ip}`);
		res.status(429).json({
			message: 'Demasiados intentos de registro. Por favor, espera.',
			error: 'REGISTER_RATE_LIMIT_EXCEEDED',
		});
	},
	skip: (req: Request) => {
		return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
	},
});

/**
 * General API rate limiter
 */
export const apiLimiter = rateLimit({
	windowMs: 1 * 60 * 1000, // 1 minute
	max: 300, // 300 requests per minute per IP
	message: {
		message: 'Demasiadas solicitudes. Reduce la velocidad.',
		error: 'API_RATE_LIMIT_EXCEEDED',
	},
	skip: (req: Request) => {
		// Skip rate limiting in development if needed
		return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
	},
});

/**
 * Public participant registration rate limiter
 */
export const publicParticipantLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 10, // Max 10 registrations per IP per hour
	keyGenerator: (req: Request) => req.ip || 'unknown',
	message: {
		message: 'Demasiados registros. Inténtalo en 1 hora.',
		error: 'PARTICIPANT_RATE_LIMIT_EXCEEDED',
	},
	skip: (req: Request) => {
		return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
	},
});

/**
 * Public community registration rate limiter (prevent spam communities)
 */
export const publicCommunityRegisterLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 3, // Max 3 registrations per IP per hour
	keyGenerator: (req: Request) => req.ip || 'unknown',
	message: {
		message: 'Demasiados registros de comunidad. Inténtalo en 1 hora.',
		error: 'COMMUNITY_REGISTER_RATE_LIMIT_EXCEEDED',
	},
	handler: (req: Request, res: Response) => {
		console.warn(`⚠️  Rate limit - Community register: IP=${req.ip}`);
		res.status(429).json({
			message: 'Demasiados registros de comunidad. Inténtalo en 1 hora.',
			error: 'COMMUNITY_REGISTER_RATE_LIMIT_EXCEEDED',
		});
	},
	skip: (req: Request) => {
		return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
	},
});

/**
 * Newsletter subscribe/unsubscribe rate limiter (prevent email bombing)
 */
export const newsletterLimiter = rateLimit({
	windowMs: 60 * 60 * 1000, // 1 hour
	max: 5, // Max 5 requests per IP per hour
	keyGenerator: (req: Request) => req.ip || 'unknown',
	message: {
		message: 'Demasiadas solicitudes de suscripción. Inténtalo en 1 hora.',
		error: 'NEWSLETTER_RATE_LIMIT_EXCEEDED',
	},
	skip: (req: Request) => {
		return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
	},
});

/**
 * Email check rate limiter (prevent email enumeration)
 */
export const emailCheckLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 15, // Max 15 checks per IP per 15 min
	keyGenerator: (req: Request) => req.ip || 'unknown',
	message: {
		message: 'Demasiadas consultas. Inténtalo en 15 minutos.',
		error: 'EMAIL_CHECK_RATE_LIMIT_EXCEEDED',
	},
	skip: (req: Request) => {
		return process.env.NODE_ENV === 'development' && process.env.SKIP_RATE_LIMIT === 'true';
	},
});
