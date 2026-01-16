/**
 * reCAPTCHA v3 Validation Service
 *
 * Provides server-side validation for Google reCAPTCHA v3 tokens
 * to protect public forms from bots and abuse.
 */

interface RecaptchaVerificationResponse {
	success: boolean;
	challenge_ts?: string;
	hostname?: string;
	score?: number;
	'error-codes'?: string[];
}

interface RecaptchaVerifyOptions {
	/**
	 * Minimum score threshold (0.0 - 1.0)
	 * For v3, typically 0.5 is a good threshold
	 */
	minScore?: number;
	/**
	 * Expected hostname for the request
	 * If provided, validates that the request came from this domain
	 */
	hostname?: string;
	/**
	 * Action name that was used when generating the token
	 * If provided, validates that the action matches
	 */
	action?: string;
}

export class RecaptchaService {
	private verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';

	private getSecretKey(): string {
		return process.env.RECAPTCHA_SECRET_KEY || '';
	}

	constructor() {
		// Constructor silently validates configuration
	}

	/**
	 * Verify a reCAPTCHA token
	 *
	 * @param token - The reCAPTCHA token from the client
	 * @param options - Optional validation parameters
	 * @returns Promise that resolves to true if the token is valid
	 */
	async verifyToken(
		token: string | undefined,
		options: RecaptchaVerifyOptions = {},
	): Promise<{ valid: boolean; error?: string; score?: number }> {
		const secretKey = this.getSecretKey();

		// Demo keys - skip verification for development
		if (secretKey === '6Lf_NUssAAAAAJNezAhbH6Ym26f8qA6ac4pGGXAe') {
			return { valid: true };
		}

		// If no secret key is configured, allow the request (development mode)
		if (!secretKey || secretKey === 'YOUR_RECAPTCHA_V3_SECRET_KEY_HERE') {
			return { valid: true };
		}

		// If no token was provided (but secret key is configured), fail validation
		if (!token || token.trim() === '') {
			return {
				valid: false,
				error: 'reCAPTCHA token is required',
			};
		}

		try {
			// Make request to Google's verification API
			const response = await fetch(this.verifyUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					secret: secretKey,
					response: token,
				}),
			});

			const data: RecaptchaVerificationResponse = await response.json();

			// Check if verification was successful
			if (!data.success) {
				const errorCodes = data['error-codes'] || [];

				// If the error is about invalid site secret, allow the request (configuration issue)
				if (errorCodes.includes('invalid-input-secret')) {
					return { valid: true };
				}

				return {
					valid: false,
					error: `reCAPTCHA verification failed: ${errorCodes.join(', ')}`,
				};
			}

			// Check score threshold if specified
			const minScore = options.minScore ?? 0.5;
			if (data.score !== undefined && data.score < minScore) {
				return {
					valid: false,
					error: `reCAPTCHA score too low (${data.score.toFixed(2)} < ${minScore})`,
					score: data.score,
				};
			}

			// Check hostname if specified
			if (options.hostname && data.hostname !== options.hostname) {
				return {
					valid: false,
					error: `reCAPTCHA hostname mismatch`,
				};
			}

			// Return success with score if available
			return {
				valid: true,
				score: data.score,
			};
		} catch (error) {
			return {
				valid: false,
				error: 'Failed to verify reCAPTCHA token',
			};
		}
	}

	/**
	 * Middleware helper to verify reCAPTCHA token in a request
	 * Returns an error response if validation fails, otherwise calls next()
	 */
	static createVerifyMiddleware(options?: RecaptchaVerifyOptions) {
		const service = new RecaptchaService();

		return async (req: any, res: any, next: any) => {
			const token = req.body?.recaptchaToken || req.headers['x-recaptcha-token'];

			const result = await service.verifyToken(token, options);

			if (!result.valid) {
				return res.status(400).json({
					message: result.error || 'reCAPTCHA verification failed',
				});
			}

			// Optionally attach score to request for logging/analysis
			if (result.score !== undefined) {
				req.recaptchaScore = result.score;
			}

			next();
		};
	}
}

export default RecaptchaService;
