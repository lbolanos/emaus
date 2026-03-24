import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/userRole.entity';
import { UserService } from '../services/userService';
import { GlobalMessageTemplateService } from '../services/globalMessageTemplateService';
import { RecaptchaService } from '../services/recaptchaService';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { z } from 'zod';

const userService = new UserService();
const globalMessageTemplateService = new GlobalMessageTemplateService();
const recaptchaService = new RecaptchaService();

const RegisterSchema = z.object({
	email: z.string().email().max(254).toLowerCase().trim(),
	password: z.string().min(8).max(128),
	displayName: z.string().min(1).max(100).trim(),
	recaptchaToken: z.string().optional(),
});

export const register = async (req: Request, res: Response, next: NextFunction) => {
	const parsed = RegisterSchema.safeParse(req.body);
	if (!parsed.success) {
		return res.status(400).json({
			message: 'Datos de registro inválidos.',
			errors: parsed.error.flatten().fieldErrors,
		});
	}

	const { email, password, displayName, recaptchaToken } = parsed.data;

	// Verify reCAPTCHA token
	const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken, {
		minScore: 0.5,
	});

	if (!recaptchaResult.valid) {
		return res
			.status(400)
			.json({ message: recaptchaResult.error || 'reCAPTCHA verification failed' });
	}

	const userRepository = AppDataSource.getRepository(User);

	const startTime = Date.now();
	const antiEnumResponse = {
		message: 'No se pudo completar el registro. Verifica los datos ingresados.',
	};

	const ensureMinResponseTime = async () => {
		const elapsed = Date.now() - startTime;
		const minTime = 500;
		if (elapsed < minTime) {
			await new Promise((resolve) => setTimeout(resolve, minTime - elapsed));
		}
	};

	try {
		const existingUser = await userRepository
			.createQueryBuilder('user')
			.where('LOWER(user.email) = :email', { email })
			.getOne();
		if (existingUser) {
			await ensureMinResponseTime();
			return res.status(400).json(antiEnumResponse);
		}

		const newUser = userRepository.create({
			id: uuidv4(),
			email,
			password,
			displayName,
		});

		await userRepository.save(newUser);

		// Assign default role (same as Google OAuth flow)
		const defaultRole = await AppDataSource.getRepository(Role).findOne({
			where: { name: 'regular' },
		});
		if (defaultRole) {
			const userRoleRepo = AppDataSource.getRepository(UserRole);
			const userRole = userRoleRepo.create({
				userId: newUser.id,
				roleId: defaultRole.id,
			});
			await userRoleRepo.save(userRole);
		}

		res.status(201).json({ message: 'Usuario creado exitosamente.' });
	} catch (error: any) {
		// Handle race condition: concurrent registration with same email
		if (error?.message?.includes('UNIQUE') || error?.code === 'SQLITE_CONSTRAINT') {
			await ensureMinResponseTime();
			return res.status(400).json(antiEnumResponse);
		}
		next(error);
	}
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
	const { recaptchaToken } = req.body;

	// Verify reCAPTCHA token
	const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken, {
		minScore: 0.5,
	});

	if (!recaptchaResult.valid) {
		return res
			.status(400)
			.json({ message: recaptchaResult.error || 'reCAPTCHA verification failed' });
	}

	passport.authenticate('local', async (err: Error, user: User, info: any) => {
		if (err) {
			console.error('Error during login:', err);
			return next(err);
		}
		if (!user) {
			console.error('Login failed:', info.message);
			return res.status(401).json({ message: info.message });
		}
		req.logIn(user, (err) => {
			if (err) {
				console.error('Error during login2:', err);
				return next(err);
			}

			// Regenerate session ID after login (prevent session fixation)
			const oldCsrfToken = req.session.csrfToken;
			req.session.regenerate(async (err) => {
				if (err) {
					console.error('Session regeneration error:', err);
					return next(err);
				}

				// Restore CSRF token to new session
				if (oldCsrfToken) {
					req.session.csrfToken = oldCsrfToken;
				}

				// Re-serialize user to new session
				req.logIn(user, async (loginErr) => {
					if (loginErr) {
						console.error('Error re-logging in after session regeneration:', loginErr);
						return next(loginErr);
					}

					try {
						const userProfile = await userService.getUserProfile(user.id);
						return res.json({
							...user.toJSON(),
							profile: userProfile,
						});
					} catch (error) {
						console.error('Error fetching user profile:', error);
						return res.json(user);
					}
				});
			});
		});
	})(req, res, next);
};

export const googleCallback = (req: Request, res: Response) => {
	// Build redirect URL from request host, validated against allowlist
	const protocol = req.headers['x-forwarded-proto'] || req.protocol;
	const host = req.headers['x-forwarded-host'] || req.headers.host;
	let redirectBase = config.frontend.url;

	if (host) {
		const candidate = `${protocol}://${host}`;
		const isAllowed =
			host === 'localhost:5173' ||
			host === '127.0.0.1:5173' ||
			host.endsWith('.ngrok-free.dev') ||
			host.endsWith('.ngrok.io') ||
			candidate === config.frontend.url;
		if (isAllowed) {
			redirectBase = candidate;
		}
	}

	res.redirect(`${redirectBase}/app`);
};

export const getAuthStatus = async (req: Request, res: Response) => {
	if (req.isAuthenticated()) {
		try {
			const userProfile = await userService.getUserProfile((req.user as any).id);
			const safeUser = typeof (req.user as any).toJSON === 'function' ? (req.user as any).toJSON() : req.user;
			res.json({
				...safeUser,
				profile: userProfile,
			});
		} catch (error) {
			console.error('Error fetching user profile:', error);
			res.json(req.user);
		}
	} else {
		// Return 200 with authenticated: false instead of 401
		res.json({ authenticated: false });
	}
};

export const logout = (req: Request, res: Response, next: NextFunction) => {
	req.logout((err) => {
		if (err) {
			return next(err);
		}
		req.session.destroy((err) => {
			if (err) {
				return next(err);
			}
			res.clearCookie('emaus.sid');
			res.json({ message: 'Logged out' });
		});
	});
};

export const requestPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
	const { email: rawEmail, recaptchaToken } = req.body;
	const startTime = Date.now();

	if (!rawEmail || typeof rawEmail !== 'string') {
		// Still use minimum response time to prevent enumeration
		const elapsed = Date.now() - startTime;
		if (elapsed < 500) {
			await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
		}
		return res.json({
			message:
				'Si existe un usuario con ese correo, se ha enviado un enlace para restablecer la contraseña.',
		});
	}

	const email = rawEmail.toLowerCase().trim();

	// Verify reCAPTCHA token
	const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken, {
		minScore: 0.5,
	});

	if (!recaptchaResult.valid) {
		return res
			.status(400)
			.json({ message: recaptchaResult.error || 'reCAPTCHA verification failed' });
	}

	const userRepository = AppDataSource.getRepository(User);

	try {
		const user = await userRepository
			.createQueryBuilder('user')
			.where('LOWER(user.email) = :email', { email })
			.getOne();

		if (user) {
			// Generate cryptographically secure token
			const plainToken = crypto.randomBytes(32).toString('hex');
			const hashedToken = crypto.createHash('sha256').update(plainToken).digest('hex');

			// Invalidate any existing tokens
			user.passwordResetToken = hashedToken;
			user.passwordResetTokenExpiresAt = new Date(Date.now() + 3600000); // 1 hour
			user.passwordResetTokenUsedAt = null;
			await userRepository.save(user);

			const resetUrl = `${config.frontend.url}/reset-password?token=${plainToken}`;

			try {
				await globalMessageTemplateService.sendPasswordResetEmail(user, resetUrl);
			} catch (emailError) {
				console.error('Error sending password reset email:', emailError);
				// Continue - don't reveal if email failed
			}
		}

		// Artificial delay to prevent timing attacks
		const elapsedTime = Date.now() - startTime;
		const minResponseTime = 500; // 500ms minimum
		if (elapsedTime < minResponseTime) {
			await new Promise((resolve) => setTimeout(resolve, minResponseTime - elapsedTime));
		}

		// Always return same message to prevent user enumeration
		res.json({
			message:
				'Si existe un usuario con ese correo, se ha enviado un enlace para restablecer la contraseña.',
		});
	} catch (error) {
		next(error);
	}
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
	const { token, password } = req.body;

	if (!token || typeof token !== 'string' || !password || typeof password !== 'string') {
		return res.status(400).json({
			message: 'Token de restablecimiento inválido o expirado.',
		});
	}

	if (password.length < 8) {
		return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
	}
	if (password.length > 128) {
		return res.status(400).json({ message: 'La contraseña no puede tener más de 128 caracteres' });
	}

	const userRepository = AppDataSource.getRepository(User);

	try {
		// Hash the provided token
		const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

		// Find user with matching unused token
		const user = await userRepository.findOne({
			where: {
				passwordResetToken: hashedToken,
			},
		});

		if (
			!user ||
			!user.passwordResetTokenExpiresAt ||
			user.passwordResetTokenExpiresAt < new Date() ||
			user.passwordResetTokenUsedAt !== null
		) {
			return res.status(400).json({
				message: 'Token de restablecimiento inválido o expirado.',
			});
		}

		// Mark token as used
		user.passwordResetTokenUsedAt = new Date();

		// Update password (will be hashed by @BeforeUpdate hook)
		user.password = password;

		await userRepository.save(user);

		res.json({ message: 'La contraseña ha sido restablecida exitosamente.' });
	} catch (error) {
		next(error);
	}
};

export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
	// Check if user is authenticated
	if (!req.isAuthenticated()) {
		return res.status(401).json({ message: 'No autorizado' });
	}

	const { currentPassword, newPassword, confirmPassword } = req.body;
	const user = req.user as User;

	// Validate request body (confirmPassword is optional, for client-side validation)
	if (!newPassword) {
		return res.status(400).json({ message: 'La nueva contraseña es requerida' });
	}

	// Validate new password and confirm password match (if confirmPassword is provided)
	if (confirmPassword !== undefined && newPassword !== confirmPassword) {
		return res.status(400).json({ message: 'Las contraseñas no coinciden' });
	}

	// Validate password length (bcrypt truncates beyond 72 bytes)
	if (newPassword.length < 8) {
		return res.status(400).json({ message: 'La contraseña debe tener al menos 8 caracteres' });
	}
	if (newPassword.length > 128) {
		return res.status(400).json({ message: 'La contraseña no puede tener más de 128 caracteres' });
	}

	const userRepository = AppDataSource.getRepository(User);

	try {
		// Get fresh user data from database
		const freshUser = await userRepository.findOne({ where: { id: user.id } });

		if (!freshUser) {
			return res.status(400).json({ message: 'Usuario no encontrado' });
		}

		// If user has a password, validate the current password
		const userHadPassword = !!freshUser.password;

		if (userHadPassword) {
			if (!currentPassword) {
				return res.status(400).json({ message: 'La contraseña actual es requerida' });
			}

			// Validate new password is different from current password
			if (currentPassword === newPassword) {
				return res.status(400).json({
					message: 'La nueva contraseña debe ser diferente a la actual',
				});
			}

			// Verify current password
			const isCurrentPasswordValid = await bcrypt.compare(currentPassword, freshUser.password);

			if (!isCurrentPasswordValid) {
				return res.status(400).json({ message: 'La contraseña actual es incorrecta' });
			}
		}

		// Update password (will be hashed automatically by @BeforeUpdate hook)
		freshUser.password = newPassword;
		await userRepository.save(freshUser);

		// Return appropriate success message based on whether user had a password before
		const successMessage = userHadPassword
			? 'Tu contraseña ha sido cambiada exitosamente.'
			: 'Tu contraseña ha sido configurada exitosamente.';

		res.json({ message: successMessage });
	} catch (error) {
		next(error);
	}
};
