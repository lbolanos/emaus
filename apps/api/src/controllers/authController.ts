import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { UserService } from '../services/userService';
import { GlobalMessageTemplateService } from '../services/globalMessageTemplateService';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

// Temporary store for password reset tokens
const passwordResetTokens = new Map<string, { userId: string; expires: number }>();
const userService = new UserService();
const globalMessageTemplateService = new GlobalMessageTemplateService();

export const register = async (req: Request, res: Response, next: NextFunction) => {
	const { email, password, displayName } = req.body;
	const userRepository = AppDataSource.getRepository(User);

	try {
		const existingUser = await userRepository.findOne({ where: { email } });
		if (existingUser) {
			return res.status(400).json({ message: 'User already exists' });
		}

		const newUser = userRepository.create({
			id: uuidv4(),
			email,
			password,
			displayName,
		});

		await userRepository.save(newUser);

		res.status(201).json({ message: 'User created successfully' });
	} catch (error) {
		next(error);
	}
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('local', async (err: Error, user: User, info: any) => {
		if (err) {
			console.error('Error during login:', err);
			return next(err);
		}
		if (!user) {
			console.error('Login failed:', info.message);
			return res.status(401).json({ message: info.message });
		}
		req.logIn(user, async (err) => {
			if (err) {
				console.error('Error during login2:', err);
				return next(err);
			}

			try {
				const userProfile = await userService.getUserProfile(user.id);
				return res.json({
					...user,
					profile: userProfile,
				});
			} catch (error) {
				console.error('Error fetching user profile:', error);
				return res.json(user);
			}
		});
	})(req, res, next);
};

export const googleCallback = (req: Request, res: Response) => {
	// Redirect to /app so the router guard can handle redirecting to the dashboard
	res.redirect(`${config.frontend.url}/app`);
};

export const getAuthStatus = async (req: Request, res: Response) => {
	if (req.isAuthenticated()) {
		try {
			const userProfile = await userService.getUserProfile((req.user as any).id);
			res.json({
				...req.user,
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
			res.clearCookie('connect.sid');
			res.json({ message: 'Logged out' });
		});
	});
};

export const requestPasswordReset = async (req: Request, res: Response, next: NextFunction) => {
	const { email } = req.body;
	const userRepository = AppDataSource.getRepository(User);

	try {
		const user = await userRepository.findOne({ where: { email } });

		if (!user) {
			// To prevent user enumeration, we send a success response even if the user doesn't exist.
			return res.json({
				message:
					'Si existe un usuario con ese correo, se ha enviado un enlace para restablecer la contraseña.',
			});
		}

		const token = crypto.randomBytes(32).toString('hex');
		passwordResetTokens.set(token, { userId: user.id, expires: Date.now() + 3600000 }); // 1 hour expiry

		// Create the password reset URL
		const resetUrl = `${config.frontend.url}/reset-password?token=${token}`;

		// Send password reset email using the template service
		try {
			await globalMessageTemplateService.sendPasswordResetEmail(user, resetUrl);
		} catch (emailError) {
			console.error('Error sending password reset email:', emailError);
			// Still return success to prevent user enumeration, but log the error
		}

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
	const tokenData = passwordResetTokens.get(token);

	if (!tokenData || tokenData.expires < Date.now()) {
		return res.status(400).json({ message: 'Invalid or expired password reset token.' });
	}

	const userRepository = AppDataSource.getRepository(User);

	try {
		const user = await userRepository.findOne({ where: { id: tokenData.userId } });

		if (!user) {
			return res.status(400).json({ message: 'Invalid token.' });
		}

		user.password = password;
		await userRepository.save(user);

		passwordResetTokens.delete(token);

		res.json({ message: 'Password has been reset successfully.' });
	} catch (error) {
		next(error);
	}
};
