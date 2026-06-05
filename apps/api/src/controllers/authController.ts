import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/userRole.entity';
import { Participant } from '../entities/participant.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { UserService } from '../services/userService';
import { CommunityService } from '../services/communityService';
import { GlobalMessageTemplateService } from '../services/globalMessageTemplateService';
import { RecaptchaService, resolveMinScore } from '../services/recaptchaService';
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

		// Generate an email verification token. This stays plaintext in the DB
		// (no hash) because the surface is narrow: only the user with access to
		// the email inbox can present the token, and we expire it in 48h.
		const emailVerificationToken = crypto.randomBytes(32).toString('hex');
		const emailVerificationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

		const newUser = userRepository.create({
			id: uuidv4(),
			email,
			password,
			displayName,
			emailVerified: false,
			emailVerificationToken,
			emailVerificationExpiresAt,
		});

		await userRepository.save(newUser);

		// Fire-and-forget email with verification link. Failure here does NOT
		// block registration — user can request a resend later.
		try {
			const { EmailService } = await import('../services/emailService');
			const emailService = new EmailService();
			if (emailService.isSmtpConfigured()) {
				const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
				const verifyUrl = `${frontendUrl}/verify-email?token=${emailVerificationToken}`;
				const escape = (s: string) =>
					s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
				await emailService.sendEmail({
					to: email,
					subject: 'Verifica tu correo — Retiros Emaús',
					html: `
						<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
							<h2 style="color:#1c1917;margin-bottom:8px;">Hola ${escape(displayName)}</h2>
							<p style="color:#57534e;margin:0 0 16px;">Confirma tu correo para activar tu cuenta en Retiros Emaús.</p>
							<div style="text-align:center;margin:24px 0;">
								<a href="${verifyUrl}" style="display:inline-block;padding:12px 32px;background:#1c1917;color:white;text-decoration:none;border-radius:8px;font-weight:500;">Verificar correo</a>
							</div>
							<p style="color:#a8a29e;margin:8px 0 0;font-size:12px;">Este link expira en 48 horas. Si no creaste esta cuenta, ignora este correo.</p>
						</div>
					`.trim(),
				});
			}
		} catch (emailErr) {
			console.error('[register] verification email failed:', emailErr);
		}

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

		// Link any existing participant records that share this email so the
		// user immediately sees their retreat history after registering.
		try {
			const participantRepo = AppDataSource.getRepository(Participant);
			const existingParticipants = await participantRepo
				.createQueryBuilder('participant')
				.where('LOWER(participant.email) = :email', { email })
				.getMany();

			if (existingParticipants.length > 0) {
				const mostRecent = existingParticipants.sort(
					(a, b) => b.registrationDate.getTime() - a.registrationDate.getTime(),
				)[0];
				newUser.participantId = mostRecent.id;
				await userRepository.save(newUser);

				for (const p of existingParticipants) {
					if (!p.userId) {
						p.userId = newUser.id;
						await participantRepo.save(p);
					}
				}

				// Also stamp userId on any retreat_participants rows linked to
				// these participants so /history/my-retreats picks them up.
				await AppDataSource.getRepository(RetreatParticipant)
					.createQueryBuilder()
					.update(RetreatParticipant)
					.set({ userId: newUser.id })
					.where('userId IS NULL AND participantId IN (:...ids)', {
						ids: existingParticipants.map((p) => p.id),
					})
					.execute();
			}
		} catch (linkError) {
			console.error('Error linking existing participants on register:', linkError);
			// Do not fail registration if linking fails.
		}

		// Auto-vincular al líder con sus comunidades si su email coincide con
		// el `contactEmail` de alguna comunidad registrada (flujo híbrido).
		try {
			const communityService = new CommunityService();
			await communityService.linkUserToContactCommunities(newUser);
		} catch (linkError) {
			console.error('Error linking user to contact communities on register:', linkError);
			// No fallar el registro si el link falla.
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

	// Verify reCAPTCHA token. Login uses a more lenient threshold than public forms:
	// v3 scores legitimate users low for many benign reasons, and rate limiting +
	// account lockout are the real brute-force defenses here.
	const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken, {
		minScore: resolveMinScore('RECAPTCHA_MIN_SCORE_LOGIN', 0.3),
	});

	if (!recaptchaResult.valid) {
		console.warn(
			`Login bloqueado por reCAPTCHA${
				recaptchaResult.score !== undefined ? ` (score ${recaptchaResult.score.toFixed(2)})` : ''
			}: ${recaptchaResult.error}`,
		);
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

		// Consuming a password-reset link from the user's inbox proves they own
		// the email address. Mark them as verified and clear any stale token so
		// the EmailVerificationBanner disappears and acceptCommunityInvitation
		// stops rejecting them with EMAIL_NOT_VERIFIED.
		user.emailVerified = true;
		user.emailVerificationToken = null;
		user.emailVerificationExpiresAt = null;

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

/**
 * Re-sends the email-verification link to the user with the given email.
 *
 * SECURITY: always returns the same generic 200 response (regardless of whether
 * the email exists or is already verified) to avoid email enumeration. Rate
 * limited at the middleware layer by lowercased email.
 *
 * Side effects: regenerates the verification token + extends TTL 48h. The
 * previous token is invalidated (so an attacker who phished the old token
 * cannot use it after a legitimate user requests a resend).
 */
export const resendVerification = async (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const startTime = Date.now();
	const genericResponse = {
		message:
			'Si la cuenta existe y no está verificada, te enviamos un nuevo correo de verificación.',
	};

	const ensureMinResponseTime = async () => {
		const elapsed = Date.now() - startTime;
		if (elapsed < 500) {
			await new Promise((resolve) => setTimeout(resolve, 500 - elapsed));
		}
	};

	const rawEmail = req.body?.email;
	if (!rawEmail || typeof rawEmail !== 'string') {
		await ensureMinResponseTime();
		return res.json(genericResponse);
	}
	const email = rawEmail.toLowerCase().trim();

	const userRepository = AppDataSource.getRepository(User);
	try {
		const user = await userRepository
			.createQueryBuilder('user')
			.where('LOWER(user.email) = :email', { email })
			.getOne();

		if (user && !user.emailVerified) {
			user.emailVerificationToken = crypto.randomBytes(32).toString('hex');
			user.emailVerificationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
			await userRepository.save(user);

			try {
				const { EmailService } = await import('../services/emailService');
				const emailService = new EmailService();
				if (emailService.isSmtpConfigured()) {
					const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
					const verifyUrl = `${frontendUrl}/verify-email?token=${user.emailVerificationToken}`;
					const escape = (s: string) =>
						s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
					await emailService.sendEmail({
						to: user.email,
						subject: 'Verifica tu correo — Retiros Emaús',
						html: `
							<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
								<h2 style="color:#1c1917;margin-bottom:8px;">Hola ${escape(user.displayName)}</h2>
								<p style="color:#57534e;margin:0 0 16px;">Solicitaste un nuevo enlace de verificación. Confirma tu correo para activar tu cuenta.</p>
								<div style="text-align:center;margin:24px 0;">
									<a href="${verifyUrl}" style="display:inline-block;padding:12px 32px;background:#1c1917;color:white;text-decoration:none;border-radius:8px;font-weight:500;">Verificar correo</a>
								</div>
								<p style="color:#a8a29e;margin:8px 0 0;font-size:12px;">Este link expira en 48 horas. Si no fuiste tú, ignora este correo: el link anterior queda inutilizado.</p>
							</div>
						`.trim(),
					});
				}
			} catch (emailErr) {
				console.error('[resendVerification] email failed:', emailErr);
				// fall through to generic response
			}
		}

		await ensureMinResponseTime();
		return res.json(genericResponse);
	} catch (error) {
		next(error);
	}
};

/**
 * Verifies a user's email address using the token emitted at registration.
 *
 * SECURITY: token is single-use (cleared on success), 48h TTL, plaintext in
 * DB (narrow surface: only the email inbox owner can present it). On success
 * sets `emailVerified=true` and nullifies the token.
 *
 * Always returns a generic message on failure to avoid leaking whether a
 * given token existed.
 */
export const verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
	const token = req.body?.token || req.query?.token;
	if (!token || typeof token !== 'string' || token.length < 32) {
		return res.status(400).json({ message: 'Token de verificación inválido o expirado.' });
	}

	const userRepository = AppDataSource.getRepository(User);
	try {
		const user = await userRepository.findOne({ where: { emailVerificationToken: token } });
		if (
			!user ||
			!user.emailVerificationExpiresAt ||
			user.emailVerificationExpiresAt.getTime() < Date.now()
		) {
			return res.status(400).json({ message: 'Token de verificación inválido o expirado.' });
		}

		user.emailVerified = true;
		user.emailVerificationToken = null;
		user.emailVerificationExpiresAt = null;
		await userRepository.save(user);

		res.json({ message: 'Correo verificado correctamente.' });
	} catch (error) {
		next(error);
	}
};
