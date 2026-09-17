import { parseRetentionDaysEnv } from '../config';

describe('parseRetentionDaysEnv', () => {
	it('returns the fallback for empty/undefined values', () => {
		expect(parseRetentionDaysEnv(undefined, 90)).toBe(90);
		expect(parseRetentionDaysEnv('', 90)).toBe(90);
		expect(parseRetentionDaysEnv('   ', 90)).toBe(90);
	});

	it('treats a bare number as days (legacy format)', () => {
		expect(parseRetentionDaysEnv('90', 90)).toBe(90);
		expect(parseRetentionDaysEnv('30', 90)).toBe(30);
	});

	it('parses winston-style suffixes to days', () => {
		// '1y' used to parseInt as 1 DAY — 89 less than the NDJSON retention.
		expect(parseRetentionDaysEnv('1y', 90)).toBe(365);
		expect(parseRetentionDaysEnv('90d', 90)).toBe(90);
		expect(parseRetentionDaysEnv('2w', 90)).toBe(14);
		expect(parseRetentionDaysEnv('3M', 90)).toBe(90);
		// Uppercase day/week/year variants are NOT months (only 'M' is).
		expect(parseRetentionDaysEnv('5D', 90)).toBe(5);
		expect(parseRetentionDaysEnv('2W', 90)).toBe(14);
		expect(parseRetentionDaysEnv('2Y', 90)).toBe(730);
	});

	it('falls back on values it cannot make safe', () => {
		// 'm' is minutes in winston — meaningless as a DB retention; a zero or
		// non-numeric retention must never degrade the purge window silently.
		expect(parseRetentionDaysEnv('30m', 90)).toBe(90);
		expect(parseRetentionDaysEnv('0d', 90)).toBe(90);
		expect(parseRetentionDaysEnv('abc', 90)).toBe(90);
		expect(parseRetentionDaysEnv('-5d', 90)).toBe(90);
	});
});
