import { Request, Response, NextFunction } from 'express';
import { passport } from '../services/authService';

export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
	passport.authenticate('session', (err: any, user: any, info: any) => {
		if (err) {
			return next(err);
		}
		if (!user) {
			return res.status(401).json({ message: 'Unauthorized' });
		}
		req.user = user;
		next();
	})(req, res, next);
};
