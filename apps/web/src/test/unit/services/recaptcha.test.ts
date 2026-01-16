/**
 * Tests for reCAPTCHA service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	isRecaptchaConfigured,
	installRecaptcha,
	getRecaptchaToken,
	RECAPTCHA_ACTIONS,
} from '@/services/recaptcha';
import type { App } from 'vue';

// Mock import.meta.env
const mockEnv = {
	VITE_RECAPTCHA_SITE_KEY: '',
};

vi.mock('@/services/recaptcha', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@/services/recaptcha')>();
	// We'll handle the environment variable mocking in beforeEach
	return actual;
});

// Mock window.grecaptcha
const mockGrecaptcha = {
	ready: vi.fn((callback: () => void) => callback()),
	execute: vi.fn(),
};

// Mock document.createElement
const mockScriptElement = {
	src: '',
	async: true,
	defer: true,
	onload: null as (() => void) | null,
	onerror: null as (() => void) | null,
};

const createElementMock = vi.fn(() => mockScriptElement);
const appendChildMock = vi.fn();

describe('recaptcha service', () => {
	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Reset module state by reimporting
		vi.resetModules();

		// Mock DOM APIs
		global.document = {
			createElement: createElementMock,
			head: { appendChild: appendChildMock },
		} as any;

		(window as any).grecaptcha = undefined;
	});

	afterEach(() => {
		// Clean up
		delete (window as any).grecaptcha;
	});

	describe('isRecaptchaConfigured', () => {
		it('should return true when VITE_RECAPTCHA_SITE_KEY is set and not placeholder', async () => {
			// Set a real site key
			vi.stubGlobal('import.meta', {
				env: {
					VITE_RECAPTCHA_SITE_KEY: 'real-site-key-abc123',
				},
			});

			// Reimport the module to get fresh values
			const { isRecaptchaConfigured: checkConfigured } = await import('@/services/recaptcha');

			expect(checkConfigured()).toBe(true);
		});

		it('should return false when VITE_RECAPTCHA_SITE_KEY is placeholder', async () => {
			vi.stubGlobal('import.meta', {
				env: {
					VITE_RECAPTCHA_SITE_KEY: 'YOUR_RECAPTCHA_V3_SITE_KEY_HERE',
				},
			});

			const { isRecaptchaConfigured: checkConfigured } = await import('@/services/recaptcha');

			expect(checkConfigured()).toBe(false);
		});

		it('should return false when VITE_RECAPTCHA_SITE_KEY is empty', async () => {
			vi.stubGlobal('import.meta', {
				env: {
					VITE_RECAPTCHA_SITE_KEY: '',
				},
			});

			const { isRecaptchaConfigured: checkConfigured } = await import('@/services/recaptcha');

			expect(checkConfigured()).toBe(false);
		});
	});

	describe('installRecaptcha', () => {
		it('should preload script when configured', async () => {
			vi.stubGlobal('import.meta', {
				env: {
					VITE_RECAPTCHA_SITE_KEY: 'real-site-key-abc123',
				},
			});

			const { installRecaptcha: install } = await import('@/services/recaptcha');

			const mockApp = {
				use: vi.fn(),
			} as unknown as App;

			install(mockApp);

			// Should have attempted to create a script element
			expect(createElementMock).toHaveBeenCalledWith('script');
		});

		it('should not throw when not configured', async () => {
			vi.stubGlobal('import.meta', {
				env: {
					VITE_RECAPTCHA_SITE_KEY: '',
				},
			});

			const { installRecaptcha: install } = await import('@/services/recaptcha');

			const mockApp = {
				use: vi.fn(),
			} as unknown as App;

			expect(() => install(mockApp)).not.toThrow();
			expect(mockApp.use).not.toHaveBeenCalled();
		});
	});

	describe('getRecaptchaToken', () => {
		beforeEach(() => {
			// Setup a valid site key
			vi.stubGlobal('import.meta', {
				env: {
					VITE_RECAPTCHA_SITE_KEY: 'real-site-key-abc123',
				},
			});
		});

		it('should return empty string when not configured', async () => {
			// Set empty site key
			vi.stubGlobal('import.meta', {
				env: {
					VITE_RECAPTCHA_SITE_KEY: '',
				},
			});

			const { getRecaptchaToken: getToken } = await import('@/services/recaptcha');

			const token = await getToken('test_action');

			expect(token).toBe('');
		});

		it('should load reCAPTCHA script dynamically', async () => {
			const { getRecaptchaToken: getToken } = await import('@/services/recaptcha');

			// Mock script loading success
			vi.spyOn(mockScriptElement, 'onload', 'set').mockImplementation((callback) => {
				(window as any).grecaptcha = mockGrecaptcha;
				callback?.();
			});

			mockGrecaptcha.execute.mockResolvedValue('valid-token-123');

			await getToken('newsletter_subscribe');

			expect(createElementMock).toHaveBeenCalledWith('script');
			expect(mockScriptElement.src).toContain('https://www.google.com/recaptcha/api.js');
		});

		it('should call grecaptcha.execute with correct parameters', async () => {
			const { getRecaptchaToken: getToken } = await import('@/services/recaptcha');

			// Setup grecaptcha as already loaded
			(window as any).grecaptcha = mockGrecaptcha;
			mockGrecaptcha.execute.mockResolvedValue('test-token');

			const action = 'newsletter_subscribe';
			await getToken(action);

			expect(mockGrecaptcha.execute).toHaveBeenCalledWith('real-site-key-abc123', { action });
		});

		it('should return token when execution succeeds', async () => {
			const { getRecaptchaToken: getToken } = await import('@/services/recaptcha');

			(window as any).grecaptcha = mockGrecaptcha;
			mockGrecaptcha.execute.mockResolvedValue('valid-token-xyz');

			const token = await getToken('test_action');

			expect(token).toBe('valid-token-xyz');
		});

		it('should return empty string when token is empty', async () => {
			const { getRecaptchaToken: getToken } = await import('@/services/recaptcha');

			(window as any).grecaptcha = mockGrecaptcha;
			mockGrecaptcha.execute.mockResolvedValue('');

			const token = await getToken('test_action');

			expect(token).toBe('');
		});

		it('should handle errors gracefully', async () => {
			const { getRecaptchaToken: getToken } = await import('@/services/recaptcha');

			(window as any).grecaptcha = mockGrecaptcha;
			mockGrecaptcha.execute.mockRejectedValue(new Error('Network error'));

			const token = await getToken('test_action');

			expect(token).toBe('');
		});

		it('should not reload script if already loaded', async () => {
			const { getRecaptchaToken: getToken } = await import('@/services/recaptcha');

			// Setup grecaptcha as already loaded
			(window as any).grecaptcha = mockGrecaptcha;
			mockGrecaptcha.execute.mockResolvedValue('token-1');

			await getToken('action1');
			await getToken('action2');

			// Should only call createElement once (first load)
			expect(createElementMock).toHaveBeenCalledTimes(0); // Already loaded via grecaptcha
		});

		it('should wait for script to be ready before executing', async () => {
			const { getRecaptchaToken: getToken } = await import('@/services/recaptcha');

			let readyCallback: (() => void) | null = null;

			// Mock grecaptcha.ready to store callback
			mockGrecaptcha.ready = vi.fn((callback: () => void) => {
				readyCallback = callback;
			});

			// Mock script onload to trigger ready
			vi.spyOn(mockScriptElement, 'onload', 'set').mockImplementation((callback) => {
				// First, set up the mock grecaptcha
				(window as any).grecaptcha = mockGrecaptcha;
				mockGrecaptcha.execute.mockResolvedValue('ready-token');
				callback?.();
			});

			const tokenPromise = getToken('test_action');

			// The script should have been created
			expect(createElementMock).toHaveBeenCalled();

			const token = await tokenPromise;
			expect(token).toBe('ready-token');
		});

		it('should handle missing grecaptcha after script load', async () => {
			const { getRecaptchaToken: getToken } = await import('@/services/recaptcha');

			// Mock script onload but don't set grecaptcha
			vi.spyOn(mockScriptElement, 'onload', 'set').mockImplementation((callback) => {
				callback?.();
			});

			const token = await getToken('test_action');

			expect(token).toBe('');
		});
	});

	describe('RECAPTCHA_ACTIONS', () => {
		beforeEach(() => {
			vi.stubGlobal('import.meta', {
				env: {
					VITE_RECAPTCHA_SITE_KEY: 'real-site-key-abc123',
				},
			});
		});

		it('should have all required action constants', async () => {
			const { RECAPTCHA_ACTIONS: actions } = await import('@/services/recaptcha');

			expect(actions).toHaveProperty('NEWSLETTER_SUBSCRIBE');
			expect(actions).toHaveProperty('COMMUNITY_JOIN');
			expect(actions).toHaveProperty('PUBLIC_CONTACT');
			expect(actions).toHaveProperty('LOGIN');
			expect(actions).toHaveProperty('PASSWORD_RESET_REQUEST');
			expect(actions).toHaveProperty('PASSWORD_RESET');
			expect(actions).toHaveProperty('PARTICIPANT_REGISTER');
			expect(actions).toHaveProperty('INVITATION_ACCEPT');
			expect(actions).toHaveProperty('COMMUNITY_INVITATION_ACCEPT');
			expect(actions).toHaveProperty('PUBLIC_ATTENDANCE_TOGGLE');
		});

		it('should have correct values for each action', async () => {
			const { RECAPTCHA_ACTIONS: actions } = await import('@/services/recaptcha');

			expect(actions.NEWSLETTER_SUBSCRIBE).toBe('newsletter_subscribe');
			expect(actions.COMMUNITY_JOIN).toBe('community_join');
			expect(actions.PUBLIC_CONTACT).toBe('public_contact');
			expect(actions.LOGIN).toBe('login');
			expect(actions.PASSWORD_RESET_REQUEST).toBe('password_reset_request');
			expect(actions.PASSWORD_RESET).toBe('password_reset');
			expect(actions.PARTICIPANT_REGISTER).toBe('participant_register');
			expect(actions.INVITATION_ACCEPT).toBe('invitation_accept');
			expect(actions.COMMUNITY_INVITATION_ACCEPT).toBe('community_invitation_accept');
			expect(actions.PUBLIC_ATTENDANCE_TOGGLE).toBe('public_attendance_toggle');
		});
	});

	describe('integration scenarios', () => {
		beforeEach(() => {
			vi.stubGlobal('import.meta', {
				env: {
					VITE_RECAPTCHA_SITE_KEY: 'integration-test-key',
				},
			});
		});

		it('should complete full flow for newsletter subscription', async () => {
			const { getRecaptchaToken: getToken, RECAPTCHA_ACTIONS: actions } = await import(
				'@/services/recaptcha'
			);

			(window as any).grecaptcha = mockGrecaptcha;
			mockGrecaptcha.execute.mockResolvedValue('newsletter-token-123');

			const token = await getToken(actions.NEWSLETTER_SUBSCRIBE);

			expect(mockGrecaptcha.execute).toHaveBeenCalledWith('integration-test-key', {
				action: 'newsletter_subscribe',
			});
			expect(token).toBe('newsletter-token-123');
		});

		it('should handle multiple concurrent requests', async () => {
			const { getRecaptchaToken: getToken } = await import('@/services/recaptcha');

			(window as any).grecaptcha = mockGrecaptcha;
			mockGrecaptcha.execute
				.mockResolvedValueOnce('token-1')
				.mockResolvedValueOnce('token-2')
				.mockResolvedValueOnce('token-3');

			const [token1, token2, token3] = await Promise.all([
				getToken('action1'),
				getToken('action2'),
				getToken('action3'),
			]);

			expect(token1).toBe('token-1');
			expect(token2).toBe('token-2');
			expect(token3).toBe('token-3');
		});
	});
});
