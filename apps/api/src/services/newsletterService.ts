import { AppDataSource } from '../data-source';
import { NewsletterSubscriber } from '../entities/newsletterSubscriber.entity';

export class NewsletterService {
	private subscriberRepo = AppDataSource.getRepository(NewsletterSubscriber);

	async subscribeToNewsletter(email: string, firstName?: string, lastName?: string) {
		// Check if email already exists
		const existing = await this.subscriberRepo.findOne({ where: { email } });

		if (existing) {
			// If exists but inactive, reactivate
			if (!existing.isActive) {
				existing.isActive = true;
				await this.subscriberRepo.save(existing);
				return existing;
			}
			// Already active, return existing
			return existing;
		}

		// Create new subscriber
		const subscriber = this.subscriberRepo.create({
			email,
			firstName,
			lastName,
			isActive: true,
		});

		return this.subscriberRepo.save(subscriber);
	}

	async getSubscribers() {
		return this.subscriberRepo.find({
			where: { isActive: true },
			order: { subscribedAt: 'DESC' },
		});
	}

	async unsubscribe(email: string) {
		const subscriber = await this.subscriberRepo.findOne({ where: { email } });
		if (!subscriber) {
			return null;
		}
		subscriber.isActive = false;
		return this.subscriberRepo.save(subscriber);
	}
}
