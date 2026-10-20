import {
	parseOccurredAt,
	readClientTime,
	InvalidOccurredAtError,
	MAX_FUTURE_MS,
	MAX_PAST_MS,
} from '@/utils/occurredAt';

/** specs/offline-mode D7: the device time of a queued action, within a sane window. */
describe('parseOccurredAt', () => {
	const now = new Date('2026-10-17T15:00:00.000Z');

	test('absent values mean "now" (undefined)', () => {
		expect(parseOccurredAt(undefined, now)).toBeUndefined();
		expect(parseOccurredAt(null, now)).toBeUndefined();
		expect(parseOccurredAt('', now)).toBeUndefined();
	});

	test('accepts an ISO time from earlier in the weekend', () => {
		const friday = '2026-10-16T23:12:00.000Z';
		expect(parseOccurredAt(friday, now)?.toISOString()).toBe(friday);
	});

	test('accepts a device clock a few minutes ahead', () => {
		const ahead = new Date(now.getTime() + MAX_FUTURE_MS - 1000).toISOString();
		expect(parseOccurredAt(ahead, now)?.toISOString()).toBe(ahead);
	});

	test.each([
		['a time beyond the clock tolerance', new Date(now.getTime() + MAX_FUTURE_MS + 1000).toISOString()],
		['a time older than 14 days', new Date(now.getTime() - MAX_PAST_MS - 1000).toISOString()],
		['a non-ISO date', '17/10/2026 10:00'],
		['garbage', 'yesterday'],
		['a number', 1760713200000],
	])('rejects %s', (_label, value) => {
		expect(() => parseOccurredAt(value, now)).toThrow(InvalidOccurredAtError);
	});
});

describe('readClientTime (X-Client-Time header)', () => {
	const now = new Date('2026-10-17T15:00:00.000Z');

	test('valid → normalized ISO', () => {
		// 08:30 in Mexico City (UTC-6) is 14:30 UTC — before `now`, so valid.
		expect(readClientTime('2026-10-17T08:30:00-06:00', now)).toBe('2026-10-17T14:30:00.000Z');
	});

	test('invalid or out of range → null, never an error', () => {
		expect(readClientTime('nope', now)).toBeNull();
		expect(readClientTime('2020-01-01T00:00:00Z', now)).toBeNull();
		expect(readClientTime(undefined, now)).toBeNull();
	});
});
