import { EmailService } from '@/services/emailService';

/**
 * Candado de seguridad: fuera de producción NUNCA se envían correos reales,
 * aunque haya credenciales SMTP presentes (la DB local suele ser copia de prod
 * con emails reales). Se libera a propósito con ALLOW_REAL_EMAILS=true.
 */
describe('EmailService — candado de envíos en dev', () => {
	const ORIG = {
		NODE_ENV: process.env.NODE_ENV,
		ALLOW_REAL_EMAILS: process.env.ALLOW_REAL_EMAILS,
		SMTP_HOST: process.env.SMTP_HOST,
		SMTP_USER: process.env.SMTP_USER,
		SMTP_PASS: process.env.SMTP_PASS,
	};

	beforeEach(() => {
		// SMTP "bien configurado" para aislar el efecto del candado.
		process.env.SMTP_HOST = 'smtp.example.com';
		process.env.SMTP_USER = 'user';
		process.env.SMTP_PASS = 'pass';
		delete process.env.ALLOW_REAL_EMAILS;
	});

	afterAll(() => {
		for (const [k, v] of Object.entries(ORIG)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	});

	it('NO envía en development aunque haya SMTP completo', () => {
		process.env.NODE_ENV = 'development';
		expect(new EmailService().isSmtpConfigured()).toBe(false);
	});

	it('NO envía en test aunque haya SMTP completo', () => {
		process.env.NODE_ENV = 'test';
		expect(new EmailService().isSmtpConfigured()).toBe(false);
	});

	it('SÍ envía en production con SMTP completo', () => {
		process.env.NODE_ENV = 'production';
		expect(new EmailService().isSmtpConfigured()).toBe(true);
	});

	it('production sin SMTP completo → no envía', () => {
		process.env.NODE_ENV = 'production';
		delete process.env.SMTP_PASS;
		expect(new EmailService().isSmtpConfigured()).toBe(false);
	});

	it('opt-in explícito (ALLOW_REAL_EMAILS=true) libera el candado en dev', () => {
		process.env.NODE_ENV = 'development';
		process.env.ALLOW_REAL_EMAILS = 'true';
		expect(new EmailService().isSmtpConfigured()).toBe(true);
	});
});
