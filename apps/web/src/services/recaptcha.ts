/**
 * reCAPTCHA v3 Service
 *
 * Provides a wrapper around Google reCAPTCHA v3 for bot protection
 * on public forms (newsletter subscription, community join requests, etc.)
 */

import type { App } from 'vue';

/**
 * Get the reCAPTCHA site key from environment variables
 * Wrapped in a function to allow testing
 */
function getRecaptchaSiteKey(): string {
	return import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';
}

// Track if script is loaded
let scriptLoaded = false;
let loadPromise: Promise<void> | null = null;

/**
 * Load the reCAPTCHA script dynamically
 */
function loadRecaptchaScript(): Promise<void> {
	if (scriptLoaded) {
		return Promise.resolve();
	}

	if (loadPromise) {
		return loadPromise;
	}

	loadPromise = new Promise((resolve, reject) => {
		// Check if already loaded
		if ((window as any).grecaptcha) {
			scriptLoaded = true;
			resolve();
			return;
		}

		// Create script element
		const script = document.createElement('script');
		script.src = `https://www.google.com/recaptcha/api.js?render=${getRecaptchaSiteKey()}`;
		script.async = true;
		script.defer = true;

		script.onload = () => {
			// Wait for grecaptcha to be ready
			(window as any).grecaptcha.ready(() => {
				scriptLoaded = true;
				resolve();
			});
		};

		script.onerror = () => {
			reject(new Error('Failed to load reCAPTCHA script'));
		};

		document.head.appendChild(script);
	});

	return loadPromise;
}

/**
 * Check if reCAPTCHA is properly configured
 */
export function isRecaptchaConfigured(): boolean {
	const configured =
		!!getRecaptchaSiteKey() && getRecaptchaSiteKey() !== 'YOUR_RECAPTCHA_V3_SITE_KEY_HERE';
	return configured;
}

/**
 * Plugin to install reCAPTCHA in the Vue app
 */
export function installRecaptcha(app: App): void {
	if (!isRecaptchaConfigured()) {
		return;
	}

	// Preload the script
	loadRecaptchaScript().catch(() => {
		// Silent fail - script will load when first token is requested
	});
}

/**
 * Get a reCAPTCHA token for the specified action
 *
 * @param action - The action name for this token request (e.g., 'subscribe', 'join_community')
 * @returns The reCAPTCHA token, or empty string if not configured
 */
export async function getRecaptchaToken(action: string): Promise<string> {
	if (!isRecaptchaConfigured()) {
		return '';
	}

	try {
		// Ensure script is loaded
		await loadRecaptchaScript();

		const grecaptcha = (window as any).grecaptcha;

		if (!grecaptcha) {
			return '';
		}

		// Execute reCAPTCHA
		const token = await grecaptcha.execute(getRecaptchaSiteKey(), { action });

		if (!token) {
			return '';
		}

		return token;
	} catch (error) {
		return '';
	}
}

/**
 * Available reCAPTCHA action names
 * Use these constants for consistency across the application
 */
export const RECAPTCHA_ACTIONS = {
	NEWSLETTER_SUBSCRIBE: 'newsletter_subscribe',
	COMMUNITY_JOIN: 'community_join',
	PUBLIC_CONTACT: 'public_contact',
	LOGIN: 'login',
	PASSWORD_RESET_REQUEST: 'password_reset_request',
	PASSWORD_RESET: 'password_reset',
	PARTICIPANT_REGISTER: 'participant_register',
	INVITATION_ACCEPT: 'invitation_accept',
	COMMUNITY_INVITATION_ACCEPT: 'community_invitation_accept',
	PUBLIC_ATTENDANCE_TOGGLE: 'public_attendance_toggle',
} as const;
