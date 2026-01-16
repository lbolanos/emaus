import { Request, Response, NextFunction } from 'express';
import { NewsletterService } from '../services/newsletterService';
import { RecaptchaService } from '../services/recaptchaService';

const newsletterService = new NewsletterService();
const recaptchaService = new RecaptchaService();

export class NewsletterController {
	static async subscribe(req: Request, res: Response, next: NextFunction) {
		try {
			const { email, firstName, lastName, recaptchaToken } = req.body;

			// Verify reCAPTCHA token
			const recaptchaResult = await recaptchaService.verifyToken(recaptchaToken, {
				minScore: 0.5,
			});

			if (!recaptchaResult.valid) {
				return res
					.status(400)
					.json({ message: recaptchaResult.error || 'reCAPTCHA verification failed' });
			}

			// Basic email validation
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			if (!email || !emailRegex.test(email)) {
				return res.status(400).json({ message: 'Invalid email format' });
			}

			const subscriber = await newsletterService.subscribeToNewsletter(email, firstName, lastName);

			// Check if this was a new subscription or already subscribed
			const wasAlreadySubscribed = subscriber.subscribedAt.getTime() < Date.now() - 1000;

			res.status(201).json({
				...subscriber,
				alreadySubscribed: wasAlreadySubscribed,
			});
		} catch (error) {
			next(error);
		}
	}

	static async getSubscribers(req: Request, res: Response, next: NextFunction) {
		try {
			const subscribers = await newsletterService.getSubscribers();
			res.json(subscribers);
		} catch (error) {
			next(error);
		}
	}

	static async unsubscribe(req: Request, res: Response, next: NextFunction) {
		try {
			const { email } = req.body;

			if (!email) {
				return res.status(400).json({ message: 'Email is required' });
			}

			const subscriber = await newsletterService.unsubscribe(email);

			if (!subscriber) {
				return res.status(404).json({ message: 'Subscriber not found' });
			}

			res.json({ message: 'Successfully unsubscribed', subscriber });
		} catch (error) {
			next(error);
		}
	}
}
