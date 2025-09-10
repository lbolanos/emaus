import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { AppDataSource } from '../data-source';
import { User } from '../entities/user.entity';
import { config } from '../config';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

// Temporary store for password reset tokens
const passwordResetTokens = new Map<string, { userId: string; expires: number }>();

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

export const login = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('local', (err: Error, user: User, info: any) => {
		if (err) {
			return next(err);
		}
		if (!user) {
			return res.status(401).json({ message: info.message });
		}
		req.logIn(user, (err) => {
			if (err) {
				return next(err);
			}
			return res.json(user);
		});
	})(req, res, next);
};

export const googleCallback = (req: Request, res: Response) => {
	res.redirect(config.frontend.url);
};

export const getAuthStatus = (req: Request, res: Response) => {
	if (req.isAuthenticated()) {
		res.json(req.user);
	} else {
		res.status(401).json({ message: 'Unauthorized' });
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
				message: 'If a user with that email exists, a password reset link has been sent.',
			});
		}

		const token = crypto.randomBytes(32).toString('hex');
		passwordResetTokens.set(token, { userId: user.id, expires: Date.now() + 3600000 }); // 1 hour expiry

		// In a real app, you would email this token to the user
		console.log(`Password reset token for ${email}: ${token}`);

		res.json({ message: 'If a user with that email exists, a password reset link has been sent.' });
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
