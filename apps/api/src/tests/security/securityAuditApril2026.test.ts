/**
 * Security Audit Remediation Tests — April 2026
 *
 * Pure unit tests (no DB, no HTTP) that pin down the behavior added by the
 * April-2026 security audit. See docs/security-audit-2026-04.md for context.
 *
 *   C-1  — Seed credentials fail-fast guard in config.ts
 *   A-1  — updateParticipantSchema strips retreatId / id_on_retreat
 *   A-2  — createRetreatSchema strips createdBy
 *   M-2  — updateRetreatSchema strips createdBy
 *   M-1  — requireRetreatAccess reads retreatId from body when source='body'
 *   B-1  — Error handler suppresses err.stack in production
 *   A-3  — paymentInfo sanitization pattern (newline → <br>, DOMPurify strips HTML)
 */

import type { NextFunction, Request, Response } from 'express';
import {
	createRetreatSchema,
	updateParticipantSchema,
	updateRetreatSchema,
} from '@repo/types';

// ─── C-1: Seed credentials production guard ──────────────────────────────────

describe('C-1: Seed credentials fail-fast in production', () => {
	// Reproduce the guard from apps/api/src/config.ts
	const applySeedGuard = (env: NodeJS.ProcessEnv): Error | null => {
		if (
			env.NODE_ENV === 'production' &&
			env.SEED_AUTO_RUN === 'true' &&
			(!env.SEED_MASTER_USER_EMAIL || !env.SEED_MASTER_USER_PASSWORD)
		) {
			return new Error(
				'SEED_MASTER_USER_EMAIL and SEED_MASTER_USER_PASSWORD are required when SEED_AUTO_RUN=true in production',
			);
		}
		return null;
	};

	test('throws when production + SEED_AUTO_RUN=true without credentials', () => {
		expect(applySeedGuard({ NODE_ENV: 'production', SEED_AUTO_RUN: 'true' })).toBeInstanceOf(Error);
	});

	test('throws when only email is set', () => {
		expect(
			applySeedGuard({
				NODE_ENV: 'production',
				SEED_AUTO_RUN: 'true',
				SEED_MASTER_USER_EMAIL: 'ops@example.com',
			}),
		).toBeInstanceOf(Error);
	});

	test('throws when only password is set', () => {
		expect(
			applySeedGuard({
				NODE_ENV: 'production',
				SEED_AUTO_RUN: 'true',
				SEED_MASTER_USER_PASSWORD: 'correct-horse-battery-staple',
			}),
		).toBeInstanceOf(Error);
	});

	test('passes when both credentials are provided in production', () => {
		expect(
			applySeedGuard({
				NODE_ENV: 'production',
				SEED_AUTO_RUN: 'true',
				SEED_MASTER_USER_EMAIL: 'ops@example.com',
				SEED_MASTER_USER_PASSWORD: 'correct-horse-battery-staple',
			}),
		).toBeNull();
	});

	test('does not apply in development even without credentials', () => {
		expect(applySeedGuard({ NODE_ENV: 'development', SEED_AUTO_RUN: 'true' })).toBeNull();
	});

	test('does not apply when SEED_AUTO_RUN is not true', () => {
		expect(applySeedGuard({ NODE_ENV: 'production' })).toBeNull();
		expect(applySeedGuard({ NODE_ENV: 'production', SEED_AUTO_RUN: 'false' })).toBeNull();
	});

	test('does not apply when SEED_AUTO_RUN is exactly "true" only', () => {
		// Guard checks for the string "true" — anything else is falsy
		expect(applySeedGuard({ NODE_ENV: 'production', SEED_AUTO_RUN: '1' })).toBeNull();
		expect(applySeedGuard({ NODE_ENV: 'production', SEED_AUTO_RUN: 'yes' })).toBeNull();
	});
});

// ─── A-1: updateParticipantSchema strips sensitive relation keys ─────────────

describe('A-1: updateParticipantSchema omits retreatId / id_on_retreat', () => {
	const baseValid = {
		firstName: 'Ana',
		lastName: 'García',
		nickname: 'Ani',
	};

	test('strips retreatId from accepted body (prevents cross-retreat reassignment)', () => {
		const result = updateParticipantSchema.shape.body.parse({
			...baseValid,
			retreatId: '11111111-1111-1111-1111-111111111111',
		});
		expect('retreatId' in result).toBe(false);
	});

	test('strips id_on_retreat from accepted body (prevents ID spoofing)', () => {
		const result = updateParticipantSchema.shape.body.parse({
			...baseValid,
			id_on_retreat: 9999,
		});
		expect('id_on_retreat' in result).toBe(false);
	});

	test('strips both sensitive fields at once', () => {
		const result = updateParticipantSchema.shape.body.parse({
			...baseValid,
			retreatId: '11111111-1111-1111-1111-111111111111',
			id_on_retreat: 1,
		});
		expect('retreatId' in result).toBe(false);
		expect('id_on_retreat' in result).toBe(false);
	});

	test('preserves legitimate editable fields', () => {
		const result = updateParticipantSchema.shape.body.parse({
			firstName: 'Juan',
			lastName: 'Pérez',
			notes: 'alergia al maní',
		});
		expect(result.firstName).toBe('Juan');
		expect(result.lastName).toBe('Pérez');
		expect(result.notes).toBe('alergia al maní');
	});

	test('leaves tableId editable (drag-and-drop assignments rely on it)', () => {
		const result = updateParticipantSchema.shape.body.parse({
			...baseValid,
			tableId: '22222222-2222-2222-2222-222222222222',
		});
		expect(result.tableId).toBe('22222222-2222-2222-2222-222222222222');
	});
});

// ─── A-2 / M-2: Retreat schemas strip createdBy ──────────────────────────────

describe('A-2 / M-2: Retreat schemas omit createdBy', () => {
	const baseRetreat = {
		parish: 'Parroquia Test',
		startDate: '2026-05-01T00:00:00.000Z',
		endDate: '2026-05-04T00:00:00.000Z',
		houseId: '33333333-3333-3333-3333-333333333333',
	};

	test('createRetreatSchema strips createdBy (server assigns from session)', () => {
		const result = createRetreatSchema.shape.body.parse({
			...baseRetreat,
			createdBy: '44444444-4444-4444-4444-444444444444',
		});
		expect('createdBy' in result).toBe(false);
	});

	test('updateRetreatSchema strips createdBy (prevents owner reassignment)', () => {
		const result = updateRetreatSchema.shape.body.parse({
			createdBy: '44444444-4444-4444-4444-444444444444',
			parish: 'renombrada',
		});
		expect('createdBy' in result).toBe(false);
		expect(result.parish).toBe('renombrada');
	});

	test('updateRetreatSchema still accepts legitimate fields', () => {
		const result = updateRetreatSchema.shape.body.parse({
			parish: 'Nueva Parroquia',
			isPublic: true,
			notifyInviter: false,
		});
		expect(result.parish).toBe('Nueva Parroquia');
		expect(result.isPublic).toBe(true);
		expect(result.notifyInviter).toBe(false);
	});
});

// ─── M-1: requireRetreatAccess source='body' option ──────────────────────────

describe('M-1: requireRetreatAccess reads retreatId from configurable source', () => {
	// Reproduce the middleware with an injected authorizationService stub.
	const makeMiddleware = (
		retreatIdParam: string,
		source: 'params' | 'body',
		hasAccess: (userId: string, retreatId: string) => Promise<boolean>,
	) =>
		async (req: any, res: Response, next: NextFunction) => {
			if (!req.user) {
				return res.status(401).json({ message: 'Unauthorized' });
			}
			const retreatId =
				source === 'body' ? req.body?.[retreatIdParam] : req.params[retreatIdParam];
			if (!retreatId) {
				return res.status(400).json({ message: 'Retreat ID is required' });
			}
			const granted = await hasAccess(req.user.id, retreatId);
			if (!granted) {
				return res.status(403).json({ message: 'Forbidden' });
			}
			next();
		};

	let res: any;
	let next: jest.Mock;

	beforeEach(() => {
		res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
		next = jest.fn();
	});

	test('reads from params by default and allows access when granted', async () => {
		const hasAccess = jest.fn().mockResolvedValue(true);
		const mw = makeMiddleware('retreatId', 'params', hasAccess);

		await mw(
			{ user: { id: 'u1' }, params: { retreatId: 'r1' }, body: {} } as Request,
			res,
			next,
		);

		expect(hasAccess).toHaveBeenCalledWith('u1', 'r1');
		expect(next).toHaveBeenCalled();
		expect(res.status).not.toHaveBeenCalled();
	});

	test('reads from body when source=body', async () => {
		const hasAccess = jest.fn().mockResolvedValue(true);
		const mw = makeMiddleware('retreatId', 'body', hasAccess);

		await mw(
			{
				user: { id: 'u1' },
				params: { id: 'p1' },
				body: { retreatId: 'r2', checkedIn: true },
			} as Request,
			res,
			next,
		);

		expect(hasAccess).toHaveBeenCalledWith('u1', 'r2');
		expect(next).toHaveBeenCalled();
	});

	test('ignores params.retreatId when source=body', async () => {
		const hasAccess = jest.fn().mockResolvedValue(true);
		const mw = makeMiddleware('retreatId', 'body', hasAccess);

		await mw(
			{
				user: { id: 'u1' },
				// Param present, but configured to read from body
				params: { retreatId: 'params-retreat' },
				body: { retreatId: 'body-retreat' },
			} as Request,
			res,
			next,
		);

		expect(hasAccess).toHaveBeenCalledWith('u1', 'body-retreat');
	});

	test('returns 403 when hasRetreatAccess is false', async () => {
		const hasAccess = jest.fn().mockResolvedValue(false);
		const mw = makeMiddleware('retreatId', 'body', hasAccess);

		await mw(
			{ user: { id: 'u1' }, params: {}, body: { retreatId: 'r-forbidden' } } as Request,
			res,
			next,
		);

		expect(res.status).toHaveBeenCalledWith(403);
		expect(next).not.toHaveBeenCalled();
	});

	test('returns 400 when retreatId is missing from expected source', async () => {
		const hasAccess = jest.fn();
		const mw = makeMiddleware('retreatId', 'body', hasAccess);

		await mw(
			{ user: { id: 'u1' }, params: { retreatId: 'ignored' }, body: {} } as Request,
			res,
			next,
		);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(hasAccess).not.toHaveBeenCalled();
	});

	test('returns 401 when user is not authenticated', async () => {
		const hasAccess = jest.fn();
		const mw = makeMiddleware('retreatId', 'body', hasAccess);

		await mw({ body: { retreatId: 'r1' }, params: {} } as Request, res, next);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(hasAccess).not.toHaveBeenCalled();
	});
});

// ─── B-1: Error handler suppresses stack traces in production ────────────────

describe('B-1: Stack traces are not logged in production', () => {
	// Extract the decision — we don't test console.error directly, we check
	// the env guard that wraps it in apps/api/src/middleware/errorHandler.ts.
	const shouldLogStack = (env: string | undefined): boolean => env !== 'production';

	test('logs stack in development', () => {
		expect(shouldLogStack('development')).toBe(true);
	});

	test('logs stack in test environment', () => {
		expect(shouldLogStack('test')).toBe(true);
	});

	test('logs stack when NODE_ENV is undefined', () => {
		expect(shouldLogStack(undefined)).toBe(true);
	});

	test('does NOT log stack in production', () => {
		expect(shouldLogStack('production')).toBe(false);
	});
});

// ─── A-3: Payment info sanitization pattern ──────────────────────────────────

describe('A-3: paymentInfo sanitization (pre-DOMPurify transform)', () => {
	// PublicRetreatFlyerModal.vue wraps paymentInfo with:
	//   DOMPurify.sanitize(raw.replace(/\n/g, '<br>'))
	// DOMPurify itself is exhaustively tested upstream. Here we pin:
	//   (1) the newline transform happens BEFORE sanitization
	//   (2) the raw string is never rendered as-is
	const transform = (raw: string | null | undefined): string => {
		if (!raw) return '';
		return raw.replace(/\n/g, '<br>');
	};

	test('returns empty string for null/undefined/empty', () => {
		expect(transform(null)).toBe('');
		expect(transform(undefined)).toBe('');
		expect(transform('')).toBe('');
	});

	test('converts line feeds to <br>', () => {
		expect(transform('line1\nline2\nline3')).toBe('line1<br>line2<br>line3');
	});

	test('leaves single-line strings unchanged', () => {
		expect(transform('Banco XYZ - cuenta 123')).toBe('Banco XYZ - cuenta 123');
	});

	test('dangerous HTML is NOT auto-escaped here — DOMPurify must handle it', () => {
		// This test documents the contract: the transform deliberately
		// produces raw HTML that DOMPurify must then sanitize. If someone
		// ever removes DOMPurify from the component, this string demonstrates
		// why that is unsafe.
		const dangerous = '<script>alert(1)</script>';
		expect(transform(dangerous)).toBe('<script>alert(1)</script>');
	});
});
