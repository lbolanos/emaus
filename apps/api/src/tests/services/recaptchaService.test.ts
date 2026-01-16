/**
 * Tests for RecaptchaService
 */

import { RecaptchaService } from '../../services/recaptchaService';
import { jest } from '@jest/globals';

// Mock global fetch
global.fetch = jest.fn() as jest.MockedFunction<typeof fetch>;

describe('RecaptchaService', () => {
	let service: RecaptchaService;
	const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

	beforeEach(() => {
		service = new RecaptchaService();
		jest.clearAllMocks();
	});

	afterEach(() => {
		// Reset environment variables
		delete process.env.RECAPTCHA_SECRET_KEY;
	});

	describe('Constructor', () => {
		it('should initialize without errors when RECAPTCHA_SECRET_KEY is set', () => {
			process.env.RECAPTCHA_SECRET_KEY = 'test-secret-key';
			expect(() => new RecaptchaService()).not.toThrow();
		});

		it('should initialize without errors when RECAPTCHA_SECRET_KEY is not set', () => {
			expect(() => new RecaptchaService()).not.toThrow();
		});
	});

	describe('verifyToken', () => {
		const demoSecretKey = '6Lf_NUssAAAAAJNezAhbH6Ym26f8qA6ac4pGGXAe';
		const validToken = 'valid-recaptcha-token';

		it('should return valid: true when demo keys are used', async () => {
			process.env.RECAPTCHA_SECRET_KEY = demoSecretKey;

			const result = await service.verifyToken(validToken);

			expect(result.valid).toBe(true);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should return valid: true when no secret key is configured (dev mode)', async () => {
			delete process.env.RECAPTCHA_SECRET_KEY;

			const result = await service.verifyToken(validToken);

			expect(result.valid).toBe(true);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should return valid: true when placeholder secret key is used', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'YOUR_RECAPTCHA_V3_SECRET_KEY_HERE';

			const result = await service.verifyToken(validToken);

			expect(result.valid).toBe(true);
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should return valid: false when token is empty but secret key is configured', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';

			const result = await service.verifyToken('');

			expect(result.valid).toBe(false);
			expect(result.error).toBe('reCAPTCHA token is required');
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should return valid: false when token is only whitespace', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';

			const result = await service.verifyToken('   ');

			expect(result.valid).toBe(false);
			expect(result.error).toBe('reCAPTCHA token is required');
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should return valid: false when token is undefined but secret key is configured', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';

			const result = await service.verifyToken(undefined);

			expect(result.valid).toBe(false);
			expect(result.error).toBe('reCAPTCHA token is required');
			expect(mockFetch).not.toHaveBeenCalled();
		});

		it('should call Google verification API with correct parameters', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.9 }),
			} as Response);

			await service.verifyToken(validToken);

			expect(mockFetch).toHaveBeenCalledTimes(1);
			expect(mockFetch).toHaveBeenCalledWith(
				'https://www.google.com/recaptcha/api/siteverify',
				expect.objectContaining({
					method: 'POST',
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
				}),
			);
			// Verify the body is a URLSearchParams object with correct secret
			const callArgs = mockFetch.mock.calls[0];
			expect(callArgs[1].body).toBeInstanceOf(URLSearchParams);
			expect(callArgs[1].body.toString()).toContain('secret=real-secret-key');
			expect(callArgs[1].body.toString()).toContain('response=valid-recaptcha-token');
		});

		it('should return valid: true when Google returns success=true', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.8 }),
			} as Response);

			const result = await service.verifyToken(validToken);

			expect(result.valid).toBe(true);
			expect(result.score).toBe(0.8);
		});

		it('should return valid: false when Google returns success=false', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					'error-codes': ['invalid-input-response'],
				}),
			} as Response);

			const result = await service.verifyToken(validToken);

			expect(result.valid).toBe(false);
			expect(result.error).toBe('reCAPTCHA verification failed: invalid-input-response');
		});

		it('should handle invalid-input-secret error gracefully (allow request)', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					'error-codes': ['invalid-input-secret'],
				}),
			} as Response);

			const result = await service.verifyToken(validToken);

			expect(result.valid).toBe(true);
		});

		it('should return valid: false when score is below threshold', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.3 }),
			} as Response);

			const result = await service.verifyToken(validToken, { minScore: 0.5 });

			expect(result.valid).toBe(false);
			expect(result.error).toContain('score too low');
			expect(result.score).toBe(0.3);
		});

		it('should return valid: true when score meets threshold', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.6 }),
			} as Response);

			const result = await service.verifyToken(validToken, { minScore: 0.5 });

			expect(result.valid).toBe(true);
			expect(result.score).toBe(0.6);
		});

		it('should return valid: true when score exceeds threshold', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.9 }),
			} as Response);

			const result = await service.verifyToken(validToken, { minScore: 0.5 });

			expect(result.valid).toBe(true);
			expect(result.score).toBe(0.9);
		});

		it('should return valid: true when no score is returned (skip score check)', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true }),
			} as Response);

			const result = await service.verifyToken(validToken, { minScore: 0.5 });

			expect(result.valid).toBe(true);
			expect(result.score).toBeUndefined();
		});

		it('should return valid: false when hostname does not match (if specified)', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: true,
					score: 0.9,
					hostname: 'evil.com',
				}),
			} as Response);

			const result = await service.verifyToken(validToken, { hostname: 'example.com' });

			expect(result.valid).toBe(false);
			expect(result.error).toBe('reCAPTCHA hostname mismatch');
		});

		it('should return valid: true when hostname matches (if specified)', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: true,
					score: 0.9,
					hostname: 'example.com',
				}),
			} as Response);

			const result = await service.verifyToken(validToken, { hostname: 'example.com' });

			expect(result.valid).toBe(true);
			expect(result.score).toBe(0.9);
		});

		it('should skip hostname validation when hostname is not specified', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: true,
					score: 0.9,
					hostname: 'any-host.com',
				}),
			} as Response);

			const result = await service.verifyToken(validToken);

			expect(result.valid).toBe(true);
		});

		it('should handle network errors gracefully', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockRejectedValueOnce(new Error('Network error'));

			const result = await service.verifyToken(validToken);

			expect(result.valid).toBe(false);
			expect(result.error).toBe('Failed to verify reCAPTCHA token');
		});

		it('should include score in response when available', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.7 }),
			} as Response);

			const result = await service.verifyToken(validToken);

			expect(result.score).toBeDefined();
			expect(result.score).toBe(0.7);
		});

		it('should use default minScore of 0.5 when not specified', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.4 }),
			} as Response);

			const result = await service.verifyToken(validToken);

			expect(result.valid).toBe(false);
			expect(result.error).toContain('0.40 < 0.5');
		});

		it('should handle multiple error codes from Google', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					'error-codes': ['invalid-input-response', 'timeout-or-duplicate'],
				}),
			} as Response);

			const result = await service.verifyToken(validToken);

			expect(result.valid).toBe(false);
			expect(result.error).toBe('reCAPTCHA verification failed: invalid-input-response, timeout-or-duplicate');
		});
	});

	describe('createVerifyMiddleware', () => {
		it('should call next() when verification passes', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'demo-keys-6Lf_NUssAAAAAJNezAhbH6Ym26f8qA6ac4pGGXAe';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.9 }),
			} as Response);

			const middleware = RecaptchaService.createVerifyMiddleware();
			const req = {
				body: { recaptchaToken: 'valid-token' },
				headers: {},
			};
			const res = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn(),
			};
			const next = jest.fn();

			await middleware(req, res, next);

			expect(next).toHaveBeenCalled();
			expect(res.status).not.toHaveBeenCalled();
		});

		it('should return 400 when verification fails', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'real-secret-key';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					success: false,
					'error-codes': ['invalid-input-response'],
				}),
			} as Response);

			const middleware = RecaptchaService.createVerifyMiddleware();
			const req = {
				body: { recaptchaToken: 'invalid-token' },
				headers: {},
			};
			const res = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn(),
			};
			const next = jest.fn();

			await middleware(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				message: 'reCAPTCHA verification failed: invalid-input-response',
			});
			expect(next).not.toHaveBeenCalled();
		});

		it('should attach score to request when available', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'demo-keys-6Lf_NUssAAAAAJNezAhbH6Ym26f8qA6ac4pGGXAe';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.8 }),
			} as Response);

			const middleware = RecaptchaService.createVerifyMiddleware();
			const req: any = {
				body: { recaptchaToken: 'valid-token' },
				headers: {},
			};
			const res = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn(),
			};
			const next = jest.fn();

			await middleware(req, res, next);

			expect(req.recaptchaScore).toBe(0.8);
		});

		it('should extract token from request body', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'demo-keys-6Lf_NUssAAAAAJNezAhbH6Ym26f8qA6ac4pGGXAe';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.9 }),
			} as Response);

			const middleware = RecaptchaService.createVerifyMiddleware();
			const req = {
				body: { recaptchaToken: 'body-token' },
				headers: {},
			};
			const res = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn(),
			};
			const next = jest.fn();

			await middleware(req, res, next);

			expect(next).toHaveBeenCalled();
		});

		it('should extract token from x-recaptcha-token header', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'demo-keys-6Lf_NUssAAAAAJNezAhbH6Ym26f8qA6ac4pGGXAe';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.9 }),
			} as Response);

			const middleware = RecaptchaService.createVerifyMiddleware();
			const req = {
				body: {},
				headers: { 'x-recaptcha-token': 'header-token' },
			};
			const res = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn(),
			};
			const next = jest.fn();

			await middleware(req, res, next);

			expect(next).toHaveBeenCalled();
		});

		it('should prioritize body token over header token', async () => {
			process.env.RECAPTCHA_SECRET_KEY = 'demo-keys-6Lf_NUssAAAAAJNezAhbH6Ym26f8qA6ac4pGGXAe';
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: async () => ({ success: true, score: 0.9 }),
			} as Response);

			const middleware = RecaptchaService.createVerifyMiddleware();
			const req = {
				body: { recaptchaToken: 'body-token' },
				headers: { 'x-recaptcha-token': 'header-token' },
			};
			const res = {
				status: jest.fn().mockReturnThis(),
				json: jest.fn(),
			};
			const next = jest.fn();

			await middleware(req, res, next);

			expect(next).toHaveBeenCalled();
		});
	});
});
