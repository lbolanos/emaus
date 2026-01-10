/**
 * Mock Email Service for testing
 * Tracks sent emails without actually sending them
 */
export class MockEmailService {
	sentEmails: Array<{ to: string; subject: string; html: string; text: string }> = [];

	async sendEmail(data: { to: string; subject: string; html: string; text: string }) {
		this.sentEmails.push(data);
		return { success: true };
	}

	clear() {
		this.sentEmails = [];
	}

	findByEmail(to: string) {
		return this.sentEmails.filter((email) => email.to === to);
	}

	findBySubject(subject: string) {
		return this.sentEmails.filter((email) => email.subject.includes(subject));
	}

	lastEmail() {
		return this.sentEmails[this.sentEmails.length - 1];
	}
}
