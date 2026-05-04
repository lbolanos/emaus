/**
 * Bug A + Bug G regression: the EditRetreatModal blocked saving when startDate was
 * in the past. Bug A (2026-04-28) relaxed this for LIVE retreats (endDate >= today).
 * Bug G (2026-04-28, found during San Judas E2E sim) showed that the relaxation
 * still wasn't enough — for retreats that already ended, the coordinator
 * couldn't fix slug/notes/etc. either.
 *
 * Final policy (post-Bug G): in EDIT mode, startDate < today is always OK; only
 * ADD mode keeps the strict check. Saving with the original past date is a
 * no-op for date semantics; what matters is letting other fields persist.
 *
 * This test mirrors the validation function with the new logic.
 */
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';

interface ValidateOpts {
	start: string | null;
	end: string | null;
	mode: 'add' | 'edit';
	today: string; // YYYY-MM-DD
}

function validateDates(opts: ValidateOpts): { startDate?: string; endDate?: string } {
	const errors: { startDate?: string; endDate?: string } = {};
	if (!opts.start) return errors;

	const startDateObj = new Date(opts.start);
	const endDateObj = opts.end ? new Date(opts.end) : null;
	const minDateObj = new Date(opts.today);

	if (isNaN(startDateObj.getTime())) {
		errors.startDate = 'Invalid start date';
		return errors;
	}
	if (opts.end && endDateObj && isNaN(endDateObj.getTime())) {
		errors.endDate = 'Invalid end date';
		return errors;
	}
	if (opts.start && opts.end && endDateObj && startDateObj >= endDateObj) {
		errors.endDate = 'End date must be after start date';
	}
	if (startDateObj < minDateObj && opts.mode !== 'edit') {
		errors.startDate = 'Start date cannot be in the past';
	}
	return errors;
}

describe('RetreatModal date validation (Bug A)', () => {
	const today = '2026-04-28';

	describe('add mode — strict (start must not be in the past)', () => {
		it('rejects past start in add mode', () => {
			const e = validateDates({
				start: '2026-04-26',
				end: '2026-04-29',
				mode: 'add',
				today,
			});
			expect(e.startDate).toBe('Start date cannot be in the past');
		});

		it('accepts today as start in add mode', () => {
			const e = validateDates({
				start: today,
				end: '2026-04-30',
				mode: 'add',
				today,
			});
			expect(e.startDate).toBeUndefined();
		});

		it('accepts future start in add mode', () => {
			const e = validateDates({
				start: '2026-05-15',
				end: '2026-05-17',
				mode: 'add',
				today,
			});
			expect(e.startDate).toBeUndefined();
		});
	});

	describe('edit mode — relaxed for live retreats', () => {
		it('allows past start when end is today (last day of retreat)', () => {
			const e = validateDates({
				start: '2026-04-26',
				end: today,
				mode: 'edit',
				today,
			});
			expect(e.startDate).toBeUndefined();
		});

		it('allows past start when end is in the future (mid-retreat)', () => {
			const e = validateDates({
				start: '2026-04-26',
				end: '2026-04-29',
				mode: 'edit',
				today,
			});
			expect(e.startDate).toBeUndefined();
		});

		it('also allows past start when end is also in the past (retreat already ended) — Bug G fix', () => {
			// Allow editing a fully-past retreat — the coordinator may need to
			// fix slug, notes, or close-out details after the fact.
			const e = validateDates({
				start: '2026-04-20',
				end: '2026-04-22',
				mode: 'edit',
				today,
			});
			expect(e.startDate).toBeUndefined();
		});

		it('allows past start when end is missing (incomplete form) — Bug G fix', () => {
			const e = validateDates({
				start: '2026-04-26',
				end: null,
				mode: 'edit',
				today,
			});
			expect(e.startDate).toBeUndefined();
		});

		it('accepts future-only edit (no relaxation needed)', () => {
			const e = validateDates({
				start: '2026-05-15',
				end: '2026-05-17',
				mode: 'edit',
				today,
			});
			expect(e.startDate).toBeUndefined();
		});
	});

	describe('end-after-start always enforced (regardless of mode)', () => {
		it('rejects end before start in add mode', () => {
			const e = validateDates({
				start: '2026-05-20',
				end: '2026-05-15',
				mode: 'add',
				today,
			});
			expect(e.endDate).toBe('End date must be after start date');
		});

		it('rejects end before start in edit mode', () => {
			const e = validateDates({
				start: '2026-04-26',
				end: '2026-04-25',
				mode: 'edit',
				today,
			});
			expect(e.endDate).toBe('End date must be after start date');
		});
	});
});
