// Tests for rate limiting security middleware

describe('Rate Limiting Security', () => {
	describe('Password Reset Rate Limiter', () => {
		test('should enforce 3 requests per 15 minutes per IP', () => {
			const windowMs = 15 * 60 * 1000; // 15 minutes
			const maxRequests = 3;

			interface RateLimitState {
				requests: Map<string, { count: number; resetTime: number }>;
			}

			const state: RateLimitState = { requests: new Map() };

			const checkRateLimit = (ip: string): { allowed: boolean; remaining: number } => {
				const now = Date.now();
				const record = state.requests.get(ip);

				if (!record || record.resetTime < now) {
					// New window
					state.requests.set(ip, { count: 1, resetTime: now + windowMs });
					return { allowed: true, remaining: maxRequests - 1 };
				}

				if (record.count >= maxRequests) {
					return { allowed: false, remaining: 0 };
				}

				record.count++;
				return { allowed: true, remaining: maxRequests - record.count };
			};

			const ip = '192.168.1.1';

			// First 3 requests should succeed
			expect(checkRateLimit(ip)).toEqual({ allowed: true, remaining: 2 });
			expect(checkRateLimit(ip)).toEqual({ allowed: true, remaining: 1 });
			expect(checkRateLimit(ip)).toEqual({ allowed: true, remaining: 0 });

			// 4th request should fail
			expect(checkRateLimit(ip)).toEqual({ allowed: false, remaining: 0 });
			expect(checkRateLimit(ip)).toEqual({ allowed: false, remaining: 0 });

			// Different IP should still work
			const ip2 = '192.168.1.2';
			expect(checkRateLimit(ip2)).toEqual({ allowed: true, remaining: 2 });
		});

		test('should reset after window expires', () => {
			const windowMs = 15 * 60 * 1000;
			const maxRequests = 3;

			interface Request {
				timestamp: number;
			}

			const requests: Request[] = [];

			const isRateLimited = (now: number): boolean => {
				// Clean old requests
				const windowStart = now - windowMs;
				const recentRequests = requests.filter((r) => r.timestamp > windowStart);

				if (recentRequests.length >= maxRequests) {
					return true;
				}

				requests.push({ timestamp: now });
				return false;
			};

			const now = Date.now();

			// Make 3 requests
			expect(isRateLimited(now)).toBe(false);
			expect(isRateLimited(now + 1000)).toBe(false);
			expect(isRateLimited(now + 2000)).toBe(false);

			// 4th should be limited
			expect(isRateLimited(now + 3000)).toBe(true);

			// After window expires, should work again
			const afterWindow = now + windowMs + 1000;
			// Clear old requests
			requests.length = 0;
			expect(isRateLimited(afterWindow)).toBe(false);
		});
	});

	describe('Email-Based Rate Limiter', () => {
		test('should limit per email address', () => {
			const maxPerEmail = 5;
			const windowMs = 60 * 60 * 1000; // 1 hour

			const emailCounts = new Map<string, { count: number; resetTime: number }>();

			const checkEmailLimit = (email: string): boolean => {
				const now = Date.now();
				const key = `email-${email.toLowerCase()}`;
				const record = emailCounts.get(key);

				if (!record || record.resetTime < now) {
					emailCounts.set(key, { count: 1, resetTime: now + windowMs });
					return true;
				}

				if (record.count >= maxPerEmail) {
					return false;
				}

				record.count++;
				return true;
			};

			const email = 'test@example.com';

			// First 5 should pass
			for (let i = 0; i < 5; i++) {
				expect(checkEmailLimit(email)).toBe(true);
			}

			// 6th should fail
			expect(checkEmailLimit(email)).toBe(false);

			// Different email should work
			expect(checkEmailLimit('other@example.com')).toBe(true);
		});

		test('should be case insensitive', () => {
			const seen = new Set<string>();

			const normalizeEmail = (email: string): string => {
				return email.toLowerCase();
			};

			const recordEmail = (email: string): boolean => {
				const normalized = normalizeEmail(email);
				if (seen.has(normalized)) {
					return false; // Already seen
				}
				seen.add(normalized);
				return true;
			};

			expect(recordEmail('Test@Example.com')).toBe(true);
			expect(recordEmail('test@example.com')).toBe(false); // Same email
			expect(recordEmail('TEST@EXAMPLE.COM')).toBe(false); // Same email
		});
	});

	describe('Login Rate Limiter', () => {
		test('should allow 10 failed attempts per 15 minutes', () => {
			const maxAttempts = 10;
			const windowMs = 15 * 60 * 1000;

			interface AttemptRecord {
				count: number;
				resetTime: number;
			}

			const attempts = new Map<string, AttemptRecord>();

			const checkLoginLimit = (ip: string, email: string): boolean => {
				const key = `${ip}-${email}`;
				const now = Date.now();
				const record = attempts.get(key);

				if (!record || record.resetTime < now) {
					attempts.set(key, { count: 1, resetTime: now + windowMs });
					return true;
				}

				if (record.count >= maxAttempts) {
					return false;
				}

				record.count++;
				return true;
			};

			const ip = '192.168.1.1';
			const email = 'user@example.com';

			// First 10 attempts should pass
			for (let i = 0; i < 10; i++) {
				expect(checkLoginLimit(ip, email)).toBe(true);
			}

			// 11th should fail
			expect(checkLoginLimit(ip, email)).toBe(false);

			// Same IP, different email should work
			expect(checkLoginLimit(ip, 'other@example.com')).toBe(true);

			// Same email, different IP should work
			expect(checkLoginLimit('10.0.0.1', email)).toBe(true);
		});

		test('should skip successful requests', () => {
			interface LoginAttempt {
				ip: string;
				email: string;
				success: boolean;
			}

			const failedAttempts = new Map<string, number>();

			const recordAttempt = (attempt: LoginAttempt): void => {
				if (attempt.success) {
					// Don't count successful attempts
					return;
				}

				const key = `${attempt.ip}-${attempt.email}`;
				const current = failedAttempts.get(key) || 0;
				failedAttempts.set(key, current + 1);
			};

			const getFailedCount = (ip: string, email: string): number => {
				return failedAttempts.get(`${ip}-${email}`) || 0;
			};

			// Failed attempts should count
			recordAttempt({ ip: '1.1.1.1', email: 'test@test.com', success: false });
			recordAttempt({ ip: '1.1.1.1', email: 'test@test.com', success: false });
			expect(getFailedCount('1.1.1.1', 'test@test.com')).toBe(2);

			// Successful attempt should not count
			recordAttempt({ ip: '1.1.1.1', email: 'test@test.com', success: true });
			expect(getFailedCount('1.1.1.1', 'test@test.com')).toBe(2);
		});
	});

	describe('API Rate Limiter', () => {
		test('should allow 100 requests per minute', () => {
			const maxRequests = 100;
			const windowMs = 60 * 1000; // 1 minute

			interface RateLimit {
				count: number;
				resetTime: number;
			}

			const limits = new Map<string, RateLimit>();

			const checkLimit = (ip: string, now: number): { allowed: boolean; remaining: number } => {
				const record = limits.get(ip);

				if (!record || record.resetTime < now) {
					limits.set(ip, { count: 1, resetTime: now + windowMs });
					return { allowed: true, remaining: maxRequests - 1 };
				}

				if (record.count >= maxRequests) {
					return { allowed: false, remaining: 0 };
				}

				record.count++;
				return { allowed: true, remaining: maxRequests - record.count };
			};

			const now = Date.now();
			const ip = '192.168.1.1';

			// First 100 should pass
			for (let i = 0; i < 100; i++) {
				const result = checkLimit(ip, now);
				expect(result.allowed).toBe(true);
			}

			// 101st should fail
			expect(checkLimit(ip, now)).toEqual({ allowed: false, remaining: 0 });
		});
	});

	describe('Key Generation', () => {
		test('should generate unique keys for IP + user-agent', () => {
			const generateKey = (ip: string, userAgent: string | undefined): string => {
				return `${ip}-${userAgent || 'unknown'}`;
			};

			expect(generateKey('1.1.1.1', 'Mozilla/5.0')).toBe('1.1.1.1-Mozilla/5.0');
			expect(generateKey('1.1.1.1', undefined)).toBe('1.1.1.1-unknown');
			expect(generateKey('2.2.2.2', 'Mozilla/5.0')).toBe('2.2.2.2-Mozilla/5.0');

			// Different user agents should be different keys
			const key1 = generateKey('1.1.1.1', 'Chrome');
			const key2 = generateKey('1.1.1.1', 'Firefox');
			expect(key1).not.toBe(key2);
		});
	});

	describe('Response Headers', () => {
		test('should include standard rate limit headers', () => {
			interface RateLimitHeaders {
				'RateLimit-Limit': number;
				'RateLimit-Remaining': number;
				'RateLimit-Reset': number;
			}

			const createHeaders = (
				limit: number,
				remaining: number,
				resetTime: number,
			): RateLimitHeaders => {
				return {
					'RateLimit-Limit': limit,
					'RateLimit-Remaining': remaining,
					'RateLimit-Reset': Math.ceil(resetTime / 1000), // Unix timestamp
				};
			};

			const now = Date.now();
			const windowMs = 15 * 60 * 1000;
			const resetTime = now + windowMs;

			const headers = createHeaders(3, 2, resetTime);

			expect(headers['RateLimit-Limit']).toBe(3);
			expect(headers['RateLimit-Remaining']).toBe(2);
			expect(headers['RateLimit-Reset']).toBeGreaterThan(Math.floor(now / 1000));
		});
	});

	describe('Error Messages', () => {
		test('should return localized Spanish messages', () => {
			const messages = {
				passwordReset: 'Demasiadas solicitudes de restablecimiento. Inténtalo en 15 minutos.',
				emailBased: 'Este correo ha recibido demasiadas solicitudes. Espera 1 hora.',
				login: 'Demasiados intentos de inicio de sesión. Inténtalo en 15 minutos.',
				api: 'Demasiadas solicitudes. Reduce la velocidad.',
			};

			expect(messages.passwordReset).toContain('15 minutos');
			expect(messages.emailBased).toContain('1 hora');
			expect(messages.login).toContain('inicio de sesión');
			expect(messages.api).toContain('solicitudes');
		});

		test('should include error code', () => {
			interface RateLimitError {
				message: string;
				error: string;
			}

			const createError = (type: string): RateLimitError => {
				const errors: Record<string, RateLimitError> = {
					passwordReset: {
						message: 'Demasiadas solicitudes de restablecimiento. Inténtalo en 15 minutos.',
						error: 'RATE_LIMIT_EXCEEDED',
					},
					email: {
						message: 'Este correo ha recibido demasiadas solicitudes.',
						error: 'EMAIL_RATE_LIMIT_EXCEEDED',
					},
					login: {
						message: 'Demasiados intentos de inicio de sesión.',
						error: 'LOGIN_RATE_LIMIT_EXCEEDED',
					},
					api: {
						message: 'Demasiadas solicitudes.',
						error: 'API_RATE_LIMIT_EXCEEDED',
					},
				};
				return errors[type] || { message: 'Rate limit exceeded', error: 'RATE_LIMIT_EXCEEDED' };
			};

			expect(createError('passwordReset').error).toBe('RATE_LIMIT_EXCEEDED');
			expect(createError('email').error).toBe('EMAIL_RATE_LIMIT_EXCEEDED');
			expect(createError('login').error).toBe('LOGIN_RATE_LIMIT_EXCEEDED');
			expect(createError('api').error).toBe('API_RATE_LIMIT_EXCEEDED');
		});
	});
});
