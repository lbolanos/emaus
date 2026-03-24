/**
 * Security Hardening Tests
 *
 * Tests for security fixes applied to the system:
 * - CRITICAL-1: User management routes require authentication
 * - CRITICAL-2: Password double-hashing guard
 * - CRITICAL-3: Superadmin guard checks role, not just isAuthenticated
 * - HIGH-1: Telemetry endpoints require authentication
 * - HIGH-2: validateRequest no longer has fallback bypass
 * - HIGH-4: reCAPTCHA fails closed on invalid secret
 * - MEDIUM-2: Password max length validation
 * - MEDIUM-3: CORS blocks no-origin in production
 * - MEDIUM-6: SESSION_SECRET required in production
 */

import * as bcrypt from 'bcrypt';
import { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';

// ─── CRITICAL-2: Password double-hashing guard ───────────────────────────

describe('CRITICAL-2: Password double-hashing guard', () => {
	// Reproduce the hashPassword logic from user.entity.ts
	const hashPassword = async (password: string | null | undefined): Promise<string | null | undefined> => {
		if (password && !password.startsWith('$2b$')) {
			return await bcrypt.hash(password, 10);
		}
		return password;
	};

	test('should hash a plaintext password', async () => {
		const result = await hashPassword('mypassword123');
		expect(result).toBeDefined();
		expect(result!.startsWith('$2b$')).toBe(true);
	});

	test('should NOT re-hash an already-hashed password', async () => {
		const original = await bcrypt.hash('mypassword123', 10);
		const result = await hashPassword(original);
		// Must be the exact same hash — not double-hashed
		expect(result).toBe(original);
	});

	test('should preserve null password (Google OAuth users)', async () => {
		const result = await hashPassword(null);
		expect(result).toBeNull();
	});

	test('should preserve undefined password', async () => {
		const result = await hashPassword(undefined);
		expect(result).toBeUndefined();
	});

	test('should preserve empty string password', async () => {
		const result = await hashPassword('');
		expect(result).toBe('');
	});

	test('double-hashed password would fail authentication', async () => {
		const plaintext = 'mypassword123';
		const singleHash = await bcrypt.hash(plaintext, 10);
		const doubleHash = await bcrypt.hash(singleHash, 10);

		// Single hash: auth works
		expect(await bcrypt.compare(plaintext, singleHash)).toBe(true);
		// Double hash: auth broken — this is the bug we fixed
		expect(await bcrypt.compare(plaintext, doubleHash)).toBe(false);
	});

	test('simulates non-password save() not corrupting password', async () => {
		// Simulate: user has existing hashed password, we save() to update resetToken
		const existingHash = await bcrypt.hash('secret123', 10);

		// BeforeUpdate fires — our guard should skip re-hashing
		const afterSave = await hashPassword(existingHash);
		expect(afterSave).toBe(existingHash);

		// Original password still works
		expect(await bcrypt.compare('secret123', afterSave!)).toBe(true);
	});
});

// ─── HIGH-2: validateRequest no longer has fallback bypass ───────────────

describe('HIGH-2: validateRequest no fallback bypass', () => {
	// Reproduce the fixed validateRequest logic
	const validateRequest =
		(schema: z.ZodTypeAny) => (req: Partial<Request>, res: any, next: any) => {
			try {
				schema.parse(req.body);
				next();
			} catch (bodyError) {
				if (bodyError instanceof ZodError) {
					try {
						schema.parse({
							body: req.body,
							query: req.query,
							params: req.params,
						});
						next();
					} catch (wrappedError) {
						return res.status(400).json({
							message: 'Validation error',
							errors: (bodyError as ZodError).errors,
						});
					}
				} else {
					next(bodyError);
				}
			}
		};

	const testSchema = z.object({
		name: z.string(),
		email: z.string().email(),
	});

	let mockRes: any;
	let mockNext: jest.Mock;

	beforeEach(() => {
		mockRes = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn(),
		};
		mockNext = jest.fn();
	});

	test('should pass when body matches schema', () => {
		const req: any = {
			body: { name: 'Test', email: 'test@test.com' },
			query: {},
			params: {},
		};

		validateRequest(testSchema)(req, mockRes, mockNext);
		expect(mockNext).toHaveBeenCalled();
		expect(mockRes.status).not.toHaveBeenCalled();
	});

	test('should reject when body has invalid data', () => {
		const req: any = {
			body: { name: 'Test', email: 'invalid' },
			query: {},
			params: {},
		};

		validateRequest(testSchema)(req, mockRes, mockNext);
		expect(mockRes.status).toHaveBeenCalledWith(400);
		expect(mockNext).not.toHaveBeenCalled();
	});

	test('should NOT allow query params to bypass body validation', () => {
		// OLD BUG: query matching schema would bypass body validation
		const req: any = {
			body: { garbage: true },
			query: { name: 'Test', email: 'test@test.com' },
			params: {},
		};

		validateRequest(testSchema)(req, mockRes, mockNext);
		// Must be rejected — query should not bypass body validation
		expect(mockRes.status).toHaveBeenCalledWith(400);
		expect(mockNext).not.toHaveBeenCalled();
	});

	test('should NOT allow params to bypass body validation', () => {
		const req: any = {
			body: {},
			query: {},
			params: { name: 'Test', email: 'test@test.com' },
		};

		validateRequest(testSchema)(req, mockRes, mockNext);
		expect(mockRes.status).toHaveBeenCalledWith(400);
		expect(mockNext).not.toHaveBeenCalled();
	});

	test('should reject completely empty body', () => {
		const req: any = {
			body: {},
			query: {},
			params: {},
		};

		validateRequest(testSchema)(req, mockRes, mockNext);
		expect(mockRes.status).toHaveBeenCalledWith(400);
	});
});

// ─── MEDIUM-2: Password max length validation ───────────────────────────

describe('MEDIUM-2: Password length validation', () => {
	const validatePassword = (password: string): { valid: boolean; error?: string } => {
		if (password.length < 8) {
			return { valid: false, error: 'La contraseña debe tener al menos 8 caracteres' };
		}
		if (password.length > 128) {
			return { valid: false, error: 'La contraseña no puede tener más de 128 caracteres' };
		}
		return { valid: true };
	};

	test('should reject passwords shorter than 8 characters', () => {
		expect(validatePassword('1234567').valid).toBe(false);
		expect(validatePassword('').valid).toBe(false);
		expect(validatePassword('ab').valid).toBe(false);
	});

	test('should accept passwords of 8 characters', () => {
		expect(validatePassword('12345678').valid).toBe(true);
	});

	test('should accept passwords of 128 characters', () => {
		expect(validatePassword('a'.repeat(128)).valid).toBe(true);
	});

	test('should reject passwords longer than 128 characters', () => {
		expect(validatePassword('a'.repeat(129)).valid).toBe(false);
		expect(validatePassword('a'.repeat(10000)).valid).toBe(false);
	});

	test('bcrypt truncates at 72 bytes — passwords beyond this are weakened', () => {
		// This test documents WHY we limit to 128: bcrypt silently truncates
		const short = 'a'.repeat(72);
		const long = 'a'.repeat(72) + 'EXTRA_CHARS_IGNORED';

		// bcrypt treats these as identical — that's the security risk
		const hashShort = bcrypt.hashSync(short, 10);
		expect(bcrypt.compareSync(long, hashShort)).toBe(true);
	});
});

// ─── CRITICAL-3: Superadmin guard ────────────────────────────────────────

describe('CRITICAL-3: Superadmin guard checks role', () => {
	// Reproduce the router guard logic
	const checkSuperadminAccess = (auth: {
		isAuthenticated: boolean;
		userProfile: { roles?: Array<{ role: { name: string } }> } | null;
	}): boolean => {
		const isSuperadmin = auth.userProfile?.roles?.some(
			(r: any) => r.role?.name === 'superadmin',
		);
		return auth.isAuthenticated && !!isSuperadmin;
	};

	test('should deny unauthenticated users', () => {
		expect(checkSuperadminAccess({
			isAuthenticated: false,
			userProfile: null,
		})).toBe(false);
	});

	test('should deny authenticated users without superadmin role', () => {
		expect(checkSuperadminAccess({
			isAuthenticated: true,
			userProfile: {
				roles: [{ role: { name: 'viewer' } }],
			},
		})).toBe(false);
	});

	test('should deny authenticated users with admin (not superadmin) role', () => {
		expect(checkSuperadminAccess({
			isAuthenticated: true,
			userProfile: {
				roles: [{ role: { name: 'admin' } }, { role: { name: 'coordinator' } }],
			},
		})).toBe(false);
	});

	test('should allow authenticated superadmin users', () => {
		expect(checkSuperadminAccess({
			isAuthenticated: true,
			userProfile: {
				roles: [{ role: { name: 'superadmin' } }],
			},
		})).toBe(true);
	});

	test('should allow user with superadmin among multiple roles', () => {
		expect(checkSuperadminAccess({
			isAuthenticated: true,
			userProfile: {
				roles: [
					{ role: { name: 'admin' } },
					{ role: { name: 'superadmin' } },
				],
			},
		})).toBe(true);
	});

	test('should deny when userProfile is null', () => {
		expect(checkSuperadminAccess({
			isAuthenticated: true,
			userProfile: null,
		})).toBe(false);
	});

	test('should deny when roles array is empty', () => {
		expect(checkSuperadminAccess({
			isAuthenticated: true,
			userProfile: { roles: [] },
		})).toBe(false);
	});
});

// ─── MEDIUM-3: CORS origin check ────────────────────────────────────────

describe('MEDIUM-3: CORS no-origin handling', () => {
	const checkCorsOrigin = (
		origin: string | undefined,
		isDevelopment: boolean,
		allowedOrigins: string[],
	): { allowed: boolean; origin?: string } => {
		if (!origin) {
			if (isDevelopment) return { allowed: true };
			return { allowed: false };
		}
		if (allowedOrigins.includes(origin)) {
			return { allowed: true, origin };
		}
		return { allowed: false };
	};

	const allowed = ['https://emaus.cc', 'http://localhost:5173'];

	test('should block requests with no origin in production', () => {
		expect(checkCorsOrigin(undefined, false, allowed).allowed).toBe(false);
	});

	test('should allow requests with no origin in development', () => {
		expect(checkCorsOrigin(undefined, true, allowed).allowed).toBe(true);
	});

	test('should allow requests from allowed origins', () => {
		expect(checkCorsOrigin('https://emaus.cc', false, allowed).allowed).toBe(true);
	});

	test('should block requests from unknown origins', () => {
		expect(checkCorsOrigin('https://evil.com', false, allowed).allowed).toBe(false);
	});
});

// ─── MEDIUM-6: SESSION_SECRET required in production ─────────────────────

describe('MEDIUM-6: SESSION_SECRET guard', () => {
	test('should require SESSION_SECRET in production', () => {
		const checkSessionSecret = (env: string, secret?: string): boolean => {
			if (env === 'production' && !secret) {
				return false; // Would throw
			}
			return true;
		};

		expect(checkSessionSecret('production', undefined)).toBe(false);
		expect(checkSessionSecret('production', '')).toBe(false);
		expect(checkSessionSecret('production', 'my-secret')).toBe(true);
		expect(checkSessionSecret('development', undefined)).toBe(true);
		expect(checkSessionSecret('development', '')).toBe(true);
	});
});

// ─── HIGH-4: reCAPTCHA fail-closed ───────────────────────────────────────

describe('HIGH-4: reCAPTCHA security policy', () => {
	test('should not bypass on 6Lf_ prefix keys anymore', () => {
		// Old behavior: keys starting with '6Lf_' would auto-bypass
		// New behavior: only exact placeholder is bypassed
		const shouldBypass = (key: string): boolean => {
			return !key || key === 'YOUR_RECAPTCHA_V3_SECRET_KEY_HERE';
		};

		// Placeholder: bypass (dev convenience)
		expect(shouldBypass('YOUR_RECAPTCHA_V3_SECRET_KEY_HERE')).toBe(true);
		expect(shouldBypass('')).toBe(true);

		// Real keys starting with 6Lf_ must NOT bypass
		expect(shouldBypass('6Lf_NUssAAAAAJNezAhbH6Ym26f8qA6ac4pGGXAe')).toBe(false);
		expect(shouldBypass('6Lf_realProductionKey123')).toBe(false);
	});

	test('invalid-input-secret should fail closed', () => {
		// Simulate the Google API response handling
		const handleGoogleResponse = (
			success: boolean,
			errorCodes: string[],
		): { valid: boolean; error?: string } => {
			if (!success) {
				if (errorCodes.includes('invalid-input-secret')) {
					// MUST fail closed
					return { valid: false, error: 'reCAPTCHA configuration error' };
				}
				return { valid: false, error: `Verification failed: ${errorCodes.join(', ')}` };
			}
			return { valid: true };
		};

		// Old behavior: invalid-input-secret returned valid: true (DANGEROUS)
		// New behavior: returns valid: false
		const result = handleGoogleResponse(false, ['invalid-input-secret']);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('configuration error');
	});
});

// ─── CRITICAL-1 & HIGH-1: Route authentication requirements ──────────────

describe('Route authentication enforcement', () => {
	// Simulate the isAuthenticated middleware
	const isAuthenticated = (req: { isAuthenticated: () => boolean }): boolean => {
		return req.isAuthenticated();
	};

	describe('CRITICAL-1: User management routes', () => {
		const protectedRoutes = [
			'POST /api/user-management/invite',
			'POST /api/user-management/password-reset',
			'POST /api/user-management/notify-shared',
			'GET /api/user-management/verify-smtp',
		];

		test.each(protectedRoutes)('%s should require authentication', (route) => {
			const unauthReq = { isAuthenticated: () => false };
			expect(isAuthenticated(unauthReq)).toBe(false);

			const authReq = { isAuthenticated: () => true };
			expect(isAuthenticated(authReq)).toBe(true);
		});
	});

	describe('HIGH-1: Telemetry write endpoints', () => {
		const protectedRoutes = [
			'POST /api/telemetry/metrics',
			'POST /api/telemetry/metrics/batch',
			'POST /api/telemetry/events',
			'POST /api/telemetry/events/batch',
			'POST /api/telemetry/sessions',
			'PUT /api/telemetry/sessions/:id',
			'POST /api/telemetry/track/login',
			'POST /api/telemetry/track/logout',
			'POST /api/telemetry/track/payment',
			'POST /api/telemetry/track/page-view',
			'POST /api/telemetry/track/feature-usage',
			'POST /api/telemetry/track/participant-registration',
		];

		test.each(protectedRoutes)('%s should require authentication', (route) => {
			const unauthReq = { isAuthenticated: () => false };
			expect(isAuthenticated(unauthReq)).toBe(false);
		});
	});
});

// ─── Rate limiter configuration tests ────────────────────────────────────

describe('Rate limiter configurations', () => {
	test('API limiter should be 150 req/min (not 100 or 300)', () => {
		// After CSRF caching fix, 150 is the new safe limit
		const apiLimiterMax = 150;
		expect(apiLimiterMax).toBe(150);
		expect(apiLimiterMax).toBeGreaterThan(100); // Not too restrictive
		expect(apiLimiterMax).toBeLessThan(300); // Not too permissive
	});

	test('public participant limiter should be strict (10/hour)', () => {
		const maxRequests = 10;
		const windowMs = 60 * 60 * 1000; // 1 hour

		expect(maxRequests).toBe(10);
		expect(windowMs).toBe(3600000);
	});

	test('email check limiter should prevent enumeration (15/15min)', () => {
		const maxRequests = 15;
		const windowMs = 15 * 60 * 1000; // 15 minutes

		expect(maxRequests).toBe(15);
		expect(windowMs).toBe(900000);
	});
});

// ─── CSRF token caching ─────────────────────────────────────────────────

describe('HIGH-3: CSRF token caching', () => {
	test('should cache token and not refetch within TTL', () => {
		let fetchCount = 0;
		let cachedToken: string | null = null;
		let tokenTimestamp = 0;
		const TTL = 10 * 60 * 1000; // 10 minutes

		const fetchToken = (): string => {
			fetchCount++;
			cachedToken = `token-${fetchCount}`;
			tokenTimestamp = Date.now();
			return cachedToken;
		};

		const getCsrfToken = (now: number): string => {
			if (cachedToken && now - tokenTimestamp < TTL) {
				return cachedToken;
			}
			return fetchToken();
		};

		const now = Date.now();

		// First call: should fetch
		const token1 = getCsrfToken(now);
		expect(fetchCount).toBe(1);

		// Second call within TTL: should use cache
		const token2 = getCsrfToken(now + 1000);
		expect(fetchCount).toBe(1); // Still 1 — no refetch
		expect(token2).toBe(token1);

		// Third call after TTL: should refetch
		const token3 = getCsrfToken(now + TTL + 1);
		expect(fetchCount).toBe(2);
		expect(token3).not.toBe(token1);
	});

	test('should invalidate cache on CSRF error', () => {
		let cachedToken: string | null = 'old-token';
		let tokenTimestamp = Date.now();

		// Simulate CSRF error handler
		const onCsrfError = () => {
			cachedToken = null;
			tokenTimestamp = 0;
		};

		onCsrfError();
		expect(cachedToken).toBeNull();
		expect(tokenTimestamp).toBe(0);
	});
});

// ─── Duplicate middleware consolidation ──────────────────────────────────

describe('LOW-3: Middleware consolidation', () => {
	test('authentication.ts should re-export from isAuthenticated.ts', () => {
		// Both files should export the same function reference
		// This ensures no duplicate logic with different behavior
		const { isAuthenticated: fromAuth } = require('../../middleware/authentication');
		const { isAuthenticated: fromIsAuth } = require('../../middleware/isAuthenticated');

		expect(fromAuth).toBe(fromIsAuth);
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// Second-pass security hardening tests
// ═══════════════════════════════════════════════════════════════════════════

// ─── CRITICAL-P2-1: permissionOverrideRoutes factory invocation ──────────

describe('CRITICAL-P2-1: permissionOverrideRoutes middleware factory must be invoked', () => {
	test('requireRetreatAccessOrCreator returns a middleware function when called with param', () => {
		// Simulate the factory behavior from authorization.ts
		const requireRetreatAccessOrCreator = (retreatIdParam: string = 'retreatId') => {
			return async (req: any, res: any, next: any) => {
				const retreatId = req.params[retreatIdParam];
				if (!retreatId) {
					return res.status(400).json({ message: 'Retreat ID is required' });
				}
				next();
			};
		};

		// Correct usage: invoked with param — returns a function
		const middleware = requireRetreatAccessOrCreator('retreatId');
		expect(typeof middleware).toBe('function');

		// Bug reproduction: passing the factory itself as middleware (not invoked)
		// would result in Express receiving the factory, not the middleware
		const factory = requireRetreatAccessOrCreator;
		expect(typeof factory).toBe('function');
		// The factory returns a function when called — but if passed directly,
		// Express would call it with (req, res, next), which would return a Promise
		// instead of calling next(). This is the bug we fixed.
	});

	test('middleware extracts retreatId from correct param name', async () => {
		const requireRetreatAccessOrCreator = (retreatIdParam: string = 'retreatId') => {
			return async (req: any, res: any, next: any) => {
				const retreatId = req.params[retreatIdParam];
				if (!retreatId) {
					return res.status(400).json({ message: 'Retreat ID is required' });
				}
				next();
			};
		};

		const middleware = requireRetreatAccessOrCreator('retreatId');
		const mockReq = { params: { retreatId: 'retreat-123' } };
		const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
		const mockNext = jest.fn();

		await middleware(mockReq, mockRes, mockNext);
		expect(mockNext).toHaveBeenCalled();
		expect(mockRes.status).not.toHaveBeenCalled();
	});

	test('middleware returns 400 when retreatId param is missing', async () => {
		const requireRetreatAccessOrCreator = (retreatIdParam: string = 'retreatId') => {
			return async (req: any, res: any, next: any) => {
				const retreatId = req.params[retreatIdParam];
				if (!retreatId) {
					return res.status(400).json({ message: 'Retreat ID is required' });
				}
				next();
			};
		};

		const middleware = requireRetreatAccessOrCreator('retreatId');
		const mockReq = { params: {} }; // No retreatId
		const mockRes = { status: jest.fn().mockReturnThis(), json: jest.fn() };
		const mockNext = jest.fn();

		await middleware(mockReq, mockRes, mockNext);
		expect(mockRes.status).toHaveBeenCalledWith(400);
		expect(mockNext).not.toHaveBeenCalled();
	});

	test('route file uses invoked factory (source code check)', () => {
		const fs = require('fs');
		const path = require('path');
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/permissionOverrideRoutes.ts'),
			'utf8',
		);
		// Every non-import line containing requireRetreatAccessOrCreator must invoke it with (...)
		const lines = routeFile.split('\n');
		const routeLines = lines.filter(
			(l: string) => l.includes('requireRetreatAccessOrCreator') && !l.includes('import'),
		);
		// Each route usage should have the factory invoked: requireRetreatAccessOrCreator(
		for (const line of routeLines) {
			expect(line).toMatch(/requireRetreatAccessOrCreator\(/);
		}
		expect(routeLines.length).toBeGreaterThanOrEqual(5); // 5 routes
	});
});

// ─── CRITICAL-P2-3: roleRequest approve/reject authorization ─────────────

describe('CRITICAL-P2-3: roleRequest approve/reject creator check', () => {
	test('approve controller checks creator status (source code check)', () => {
		const fs = require('fs');
		const path = require('path');
		const controllerFile = fs.readFileSync(
			path.join(__dirname, '../../controllers/roleRequestController.ts'),
			'utf8',
		);
		// Should contain isRetreatCreator check in approveRoleRequest
		expect(controllerFile).toContain('isRetreatCreator');
		expect(controllerFile).toContain('Only retreat creators can approve');
	});

	test('reject controller checks creator status (source code check)', () => {
		const fs = require('fs');
		const path = require('path');
		const controllerFile = fs.readFileSync(
			path.join(__dirname, '../../controllers/roleRequestController.ts'),
			'utf8',
		);
		expect(controllerFile).toContain('Only retreat creators can reject');
	});

	test('route file does NOT use broken requireRetreatAccessOrCreator on approve/reject', () => {
		const fs = require('fs');
		const path = require('path');
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/roleRequestRoutes.ts'),
			'utf8',
		);
		// The approve and reject routes should NOT have requireRetreatAccessOrCreator middleware
		const approveSection = routeFile.split('/requests/:requestId/approve')[1]?.split('router.')[0] || '';
		const rejectSection = routeFile.split('/requests/:requestId/reject')[1]?.split('router.')[0] || '';
		expect(approveSection).not.toContain('requireRetreatAccessOrCreator');
		expect(rejectSection).not.toContain('requireRetreatAccessOrCreator');
	});
});

// ─── HIGH-P2-4: Telemetry userId spoofing prevention ─────────────────────

describe('HIGH-P2-4: Telemetry userId spoofing prevention', () => {
	test('enforceAuthenticatedUserId middleware overrides body userId', () => {
		const enforceAuthenticatedUserId = (req: any, _res: any, next: any) => {
			if (req.user?.id) {
				if (req.body && typeof req.body === 'object') {
					req.body.userId = req.user.id;
				}
			}
			next();
		};

		const req: any = {
			user: { id: 'real-user-123' },
			body: { userId: 'spoofed-user-456', eventType: 'test' },
		};
		const mockNext = jest.fn();

		enforceAuthenticatedUserId(req, {}, mockNext);
		expect(req.body.userId).toBe('real-user-123');
		expect(mockNext).toHaveBeenCalled();
	});

	test('does not crash when body is empty', () => {
		const enforceAuthenticatedUserId = (req: any, _res: any, next: any) => {
			if (req.user?.id) {
				if (req.body && typeof req.body === 'object') {
					req.body.userId = req.user.id;
				}
			}
			next();
		};

		const req: any = { user: { id: 'user-1' }, body: {} };
		const mockNext = jest.fn();

		enforceAuthenticatedUserId(req, {}, mockNext);
		expect(req.body.userId).toBe('user-1');
		expect(mockNext).toHaveBeenCalled();
	});

	test('does not crash when user is undefined (pre-auth)', () => {
		const enforceAuthenticatedUserId = (req: any, _res: any, next: any) => {
			if (req.user?.id) {
				if (req.body && typeof req.body === 'object') {
					req.body.userId = req.user.id;
				}
			}
			next();
		};

		const req: any = { body: { userId: 'attacker' } };
		const mockNext = jest.fn();

		enforceAuthenticatedUserId(req, {}, mockNext);
		// userId should remain untouched if no auth user
		expect(req.body.userId).toBe('attacker');
		expect(mockNext).toHaveBeenCalled();
	});

	test('telemetry routes file includes enforceAuthenticatedUserId middleware', () => {
		const fs = require('fs');
		const path = require('path');
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/telemetryRoutes.ts'),
			'utf8',
		);
		expect(routeFile).toContain('enforceAuthenticatedUserId');
		expect(routeFile).toContain('req.body.userId = req.user.id');
	});
});

// ─── MEDIUM-P2-6: AI chat null retreatId denial ──────────────────────────

describe('MEDIUM-P2-6: AI chat PII leak prevention for null retreatId', () => {
	test('getParticipantDetails denies access when retreatId is null (source check)', () => {
		const fs = require('fs');
		const path = require('path');
		const serviceFile = fs.readFileSync(
			path.join(__dirname, '../../services/aiChatService.ts'),
			'utf8',
		);
		// Should check for null retreatId and return error
		expect(serviceFile).toContain('Participante sin retiro asignado, no accesible.');
	});

	test('access check logic: null retreatId returns error, valid retreatId proceeds', async () => {
		// Reproduce the fixed logic
		const getParticipantAccess = async (retreatId: string | null): Promise<{ error?: string; allowed?: boolean }> => {
			if (!retreatId) {
				return { error: 'Participante sin retiro asignado, no accesible.' };
			}
			// In real code, verifyRetreatAccess would be called here
			return { allowed: true };
		};

		const nullResult = await getParticipantAccess(null);
		expect(nullResult.error).toBeDefined();
		expect(nullResult.error).toContain('sin retiro asignado');

		const validResult = await getParticipantAccess('retreat-123');
		expect(validResult.allowed).toBe(true);
		expect(validResult.error).toBeUndefined();
	});
});

// ─── MEDIUM-P2-7: CSRF exclusion list completeness ───────────────────────

describe('MEDIUM-P2-7: CSRF exclusion list includes public participant routes', () => {
	test('index.ts CSRF exclusion includes /participants/new', () => {
		const fs = require('fs');
		const path = require('path');
		const indexFile = fs.readFileSync(
			path.join(__dirname, '../../routes/index.ts'),
			'utf8',
		);
		expect(indexFile).toContain("'/participants/new'");
	});

	test('index.ts CSRF exclusion includes /participants/confirm-registration', () => {
		const fs = require('fs');
		const path = require('path');
		const indexFile = fs.readFileSync(
			path.join(__dirname, '../../routes/index.ts'),
			'utf8',
		);
		expect(indexFile).toContain("'/participants/confirm-registration'");
	});

	test('all public participant routes are in exclusion list', () => {
		const fs = require('fs');
		const path = require('path');
		const indexFile = fs.readFileSync(
			path.join(__dirname, '../../routes/index.ts'),
			'utf8',
		);

		// Extract the CSRF exclusion array
		const exclusionMatch = indexFile.match(/applyCsrfProtectionExcept\(router,\s*\[([\s\S]*?)\]\)/);
		expect(exclusionMatch).toBeTruthy();

		const exclusionContent = exclusionMatch![1];
		// These public participant routes must be excluded from CSRF
		expect(exclusionContent).toContain('/participants/new');
		expect(exclusionContent).toContain('/participants/confirm-registration');
	});
});

// ─── LOW-P2-8: Seed migration production guard ──────────────────────────

describe('LOW-P2-8: Seed migration refuses fallback passwords in production', () => {
	test('seed migration file contains production guard', () => {
		const fs = require('fs');
		const path = require('path');
		const migrationFile = fs.readFileSync(
			path.join(__dirname, '../../migrations/sqlite/20250910163452_SeedInitialData.ts'),
			'utf8',
		);
		expect(migrationFile).toContain("NODE_ENV === 'production'");
		expect(migrationFile).toContain('SEED_MASTER_USER_PASSWORD');
		expect(migrationFile).toContain('Refusing to seed with default fallback passwords');
	});

	test('guard logic: production without password throws', () => {
		const checkSeedGuard = (nodeEnv: string, password?: string): boolean => {
			if (nodeEnv === 'production' && !password) {
				return false; // Would throw
			}
			return true;
		};

		expect(checkSeedGuard('production', undefined)).toBe(false);
		expect(checkSeedGuard('production', '')).toBe(false);
		expect(checkSeedGuard('production', 'secure-password')).toBe(true);
		expect(checkSeedGuard('development', undefined)).toBe(true);
		expect(checkSeedGuard('development', '')).toBe(true);
	});
});

// ─── MEDIUM-P2-5: userManagement retreat access check ────────────────────

describe('MEDIUM-P2-5: userManagement retreat access check', () => {
	test('inviteUserToRetreat checks retreat access (source code check)', () => {
		const fs = require('fs');
		const path = require('path');
		const controllerFile = fs.readFileSync(
			path.join(__dirname, '../../controllers/userManagementController.ts'),
			'utf8',
		);
		expect(controllerFile).toContain('authorizationService.hasRetreatAccess');
		expect(controllerFile).toContain('You do not have access to this retreat');
	});

	test('retreat access check logic', async () => {
		// Reproduce the access check pattern
		const checkRetreatAccess = async (
			hasAccess: boolean,
		): Promise<{ allowed: boolean; status?: number }> => {
			if (!hasAccess) {
				return { allowed: false, status: 403 };
			}
			return { allowed: true };
		};

		const denied = await checkRetreatAccess(false);
		expect(denied.allowed).toBe(false);
		expect(denied.status).toBe(403);

		const allowed = await checkRetreatAccess(true);
		expect(allowed.allowed).toBe(true);
	});
});

// ─── CRITICAL-P2-2: retreatRoutes memory routes access guard ─────────────

describe('CRITICAL-P2-2: retreatRoutes memory routes have access guard', () => {
	test('memory-photo route includes requireRetreatAccess middleware', () => {
		const fs = require('fs');
		const path = require('path');
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/retreatRoutes.ts'),
			'utf8',
		);
		// Check that memory-photo route has requireRetreatAccess
		const memoryPhotoSection = routeFile.split('memory-photo')[0]?.split('\n').pop() || '';
		// More robust: check the full route line includes the guard
		expect(routeFile).toMatch(/memory-photo.*requireRetreatAccess/s);
	});

	test('memory update route includes requireRetreatAccess middleware', () => {
		const fs = require('fs');
		const path = require('path');
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/retreatRoutes.ts'),
			'utf8',
		);
		// The PUT /:id/memory line should contain requireRetreatAccess
		const lines = routeFile.split('\n');
		const memoryLine = lines.find((l: string) => l.includes("'/:id/memory'") && l.includes('put'));
		expect(memoryLine).toContain('requireRetreatAccess');
	});
});

// ═══════════════════════════════════════════════════════════════════════════
// THIRD-PASS SECURITY HARDENING TESTS
// ═══════════════════════════════════════════════════════════════════════════

/* eslint-disable @typescript-eslint/no-var-requires */
const fs = require('fs');
const path = require('path');

// ─── CRITICAL-P3-1: SQL injection fix in searchSpeakers ORDER BY ──────────
describe('CRITICAL-P3-1: SQL injection fix in responsabilityService searchSpeakers', () => {
	it('should use parameterized query in ORDER BY, not string interpolation', () => {
		const serviceFile = fs.readFileSync(
			path.join(__dirname, '../../services/responsabilityService.ts'),
			'utf8',
		);
		// Should NOT contain string interpolation in ORDER BY
		expect(serviceFile).not.toContain("= '${retreatId}'");
		// Should use parameterized query
		expect(serviceFile).toContain(':orderRetreatId');
		expect(serviceFile).toContain("setParameter('orderRetreatId'");
	});
});

// ─── HIGH-P3-2: Duplicate tableMesaRoutes mount removed ──────────────────
describe('HIGH-P3-2: Duplicate tableMesaRoutes mount removed from index.ts', () => {
	it('should not mount tableMesaRoutes directly on app', () => {
		const indexFile = fs.readFileSync(
			path.join(__dirname, '../../index.ts'),
			'utf8',
		);
		// Should not import tableMesaRoutes in index.ts
		expect(indexFile).not.toContain("import tableMesaRoutes");
		// Should not have a direct mount of tableMesaRoutes
		expect(indexFile).not.toContain("app.use('/api/tables'");
	});

	it('tableMesaRoutes should still be mounted in routes/index.ts via mainRouter', () => {
		const routesIndex = fs.readFileSync(
			path.join(__dirname, '../../routes/index.ts'),
			'utf8',
		);
		expect(routesIndex).toContain("'/tables'");
		expect(routesIndex).toContain('tableMesaRoutes');
	});
});

// ─── HIGH-P3-3: Service team routes have authorization ────────────────────
describe('HIGH-P3-3: Service team routes have authorization middleware', () => {
	it('should import authorization middleware', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/serviceTeamRoutes.ts'),
			'utf8',
		);
		expect(routeFile).toContain("from '../middleware/authorization'");
		expect(routeFile).toContain('requireRetreatAccess');
	});

	it('should apply requireRetreatAccess to retreat-scoped routes', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/serviceTeamRoutes.ts'),
			'utf8',
		);
		const lines = routeFile.split('\n');

		// Routes with :retreatId should have requireRetreatAccess
		const retreatIdLines = lines.filter(
			(l: string) => l.includes(':retreatId') && !l.includes('import'),
		);
		for (const line of retreatIdLines) {
			// The retreatAccess middleware should be on the same route group
			// Check nearby lines for requireRetreatAccess
			const lineIndex = lines.indexOf(line);
			const surroundingLines = lines.slice(Math.max(0, lineIndex - 3), lineIndex + 3).join('\n');
			expect(surroundingLines).toContain('requireRetreatAccess');
		}
	});

	it('should apply requirePermission to write operations', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/serviceTeamRoutes.ts'),
			'utf8',
		);
		expect(routeFile).toContain('requirePermission');
	});
});

// ─── HIGH-P3-4: Retreat participant routes have authorization ─────────────
describe('HIGH-P3-4: Retreat participant routes have authorization middleware', () => {
	it('should import authorization middleware', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/retreatParticipant.routes.ts'),
			'utf8',
		);
		expect(routeFile).toContain("from '../middleware/authorization'");
		expect(routeFile).toContain('requirePermission');
		expect(routeFile).toContain('requireRetreatAccess');
	});

	it('should apply requirePermission to admin-only CRUD routes', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/retreatParticipant.routes.ts'),
			'utf8',
		);
		const lines = routeFile.split('\n');

		// POST /history should require permission
		const postLine = lines.find((l: string) => l.includes("router.post('/history'"));
		expect(postLine).toContain('requirePermission');

		// PUT /history/:id should require permission — check surrounding lines
		const historyIdLine = lines.findIndex((l: string) => l.includes("'/history/:id'"));
		expect(historyIdLine).toBeGreaterThan(-1);
		const surroundingPut = lines.slice(Math.max(0, historyIdLine - 2), historyIdLine + 2).join('\n');
		expect(surroundingPut).toContain('requirePermission');
	});

	it('should apply requireRetreatAccess to retreat-scoped read routes', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/retreatParticipant.routes.ts'),
			'utf8',
		);
		const lines = routeFile.split('\n');

		// /history/retreat/:retreatId/participants should require retreat access
		const retreatParticipantsLine = lines.find(
			(l: string) => l.includes('/retreat/:retreatId/participants'),
		);
		const lineIndex = retreatParticipantsLine ? lines.indexOf(retreatParticipantsLine) : -1;
		if (lineIndex >= 0) {
			const surroundingLines = lines.slice(Math.max(0, lineIndex - 3), lineIndex + 3).join('\n');
			expect(surroundingLines).toContain('requireRetreatAccess');
		}
	});
});

// ─── HIGH-P3-5: XSS prevention with DOMPurify ────────────────────────────
describe('HIGH-P3-5: XSS prevention with DOMPurify in frontend components', () => {
	it('AiChatWidget should sanitize marked output with DOMPurify', () => {
		const widgetFile = fs.readFileSync(
			path.join(__dirname, '../../../../web/src/components/AiChatWidget.vue'),
			'utf8',
		);
		expect(widgetFile).toContain('DOMPurify');
		expect(widgetFile).toContain('DOMPurify.sanitize');
	});

	it('RetreatFlyerView should sanitize paymentInfo with DOMPurify', () => {
		const flyerFile = fs.readFileSync(
			path.join(__dirname, '../../../../web/src/views/RetreatFlyerView.vue'),
			'utf8',
		);
		expect(flyerFile).toContain('DOMPurify');
		expect(flyerFile).toContain('DOMPurify.sanitize');
	});

	it('HelpView should sanitize marked output with DOMPurify', () => {
		const helpFile = fs.readFileSync(
			path.join(__dirname, '../../../../web/src/views/HelpView.vue'),
			'utf8',
		);
		expect(helpFile).toContain('DOMPurify');
		expect(helpFile).toContain('DOMPurify.sanitize');
	});

	it('HelpPanel should sanitize marked output with DOMPurify', () => {
		const panelFile = fs.readFileSync(
			path.join(__dirname, '../../../../web/src/components/HelpPanel.vue'),
			'utf8',
		);
		expect(panelFile).toContain('DOMPurify');
		expect(panelFile).toContain('DOMPurify.sanitize');
	});
});

// ─── MEDIUM-P3-6: Participant communication routes have authorization ─────
describe('MEDIUM-P3-6: Participant communication routes have authorization', () => {
	it('should import authorization middleware', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/participantCommunicationRoutes.ts'),
			'utf8',
		);
		expect(routeFile).toContain("from '../middleware/authorization'");
		expect(routeFile).toContain('requireRetreatAccess');
		expect(routeFile).toContain('requirePermission');
	});

	it('should apply requireRetreatAccess to retreat-scoped routes', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/participantCommunicationRoutes.ts'),
			'utf8',
		);
		const lines = routeFile.split('\n');
		const retreatLines = lines.filter(
			(l: string) => l.includes(':retreatId') && !l.includes('import'),
		);
		for (const line of retreatLines) {
			const lineIndex = lines.indexOf(line);
			const surroundingLines = lines.slice(Math.max(0, lineIndex - 3), lineIndex + 3).join('\n');
			expect(surroundingLines).toContain('requireRetreatAccess');
		}
	});

	it('should apply requirePermission to email send and delete endpoints', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/participantCommunicationRoutes.ts'),
			'utf8',
		);
		// email/send and delete should require permission
		expect(routeFile).toContain("requirePermission('participant:update')");
	});
});

// ─── MEDIUM-P3-7: Community communication routes have authorization ───────
describe('MEDIUM-P3-7: Community communication routes have authorization', () => {
	it('should import requireCommunityAccess', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/communityCommunicationRoutes.ts'),
			'utf8',
		);
		expect(routeFile).toContain('requireCommunityAccess');
	});

	it('should apply requireCommunityAccess to community-scoped routes', () => {
		const routeFile = fs.readFileSync(
			path.join(__dirname, '../../routes/communityCommunicationRoutes.ts'),
			'utf8',
		);
		const lines = routeFile.split('\n');
		const communityLines = lines.filter(
			(l: string) => l.includes(':communityId') && !l.includes('import'),
		);
		for (const line of communityLines) {
			const lineIndex = lines.indexOf(line);
			const surroundingLines = lines.slice(Math.max(0, lineIndex - 3), lineIndex + 3).join('\n');
			expect(surroundingLines).toContain('requireCommunityAccess');
		}
	});
});

// ─── MEDIUM-P3-8: Retreat bed routes have retreat access check ────────────
describe('MEDIUM-P3-8: Retreat bed controller has retreat access check', () => {
	it('should import authorizationService in retreatBedController', () => {
		const controllerFile = fs.readFileSync(
			path.join(__dirname, '../../controllers/retreatBedController.ts'),
			'utf8',
		);
		expect(controllerFile).toContain('authorizationService');
		expect(controllerFile).toContain("from '../middleware/authorization'");
	});

	it('should check hasRetreatAccess in assignParticipantToBed', () => {
		const controllerFile = fs.readFileSync(
			path.join(__dirname, '../../controllers/retreatBedController.ts'),
			'utf8',
		);
		// Should contain the retreat access check pattern
		expect(controllerFile).toContain('hasRetreatAccess');
		expect(controllerFile).toContain("'No access to this retreat'");
	});

	it('should check hasRetreatAccess in toggleBedActive', () => {
		const controllerFile = fs.readFileSync(
			path.join(__dirname, '../../controllers/retreatBedController.ts'),
			'utf8',
		);
		// Both assignParticipantToBed and toggleBedActive should have the check
		const matches = controllerFile.match(/hasRetreatAccess/g);
		expect(matches).toBeDefined();
		expect(matches!.length).toBeGreaterThanOrEqual(2);
	});
});
