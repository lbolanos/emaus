/**
 * Tests of the bridge's time window (specs/whatsapp-inbox D5).
 *
 * All the logic is pure over civil dates 'YYYY-MM-DD': the test pins "today"
 * explicitly and covers the CDMX vs UTC night edge through
 * civilTodayInTimezone against a fixed clock time (Date mock).
 */
import {
	acceptedJidDigitVariants,
	computeLinkWindow,
	civilTodayInTimezone,
	isLinkPurgeDue,
	shiftCivilDate,
} from '@/services/waBridge/waBridgeService';

describe('shiftCivilDate', () => {
	it('adds and subtracts days across a month boundary', () => {
		expect(shiftCivilDate('2026-11-01', -1)).toBe('2026-10-31');
		expect(shiftCivilDate('2026-10-31', 1)).toBe('2026-11-01');
		expect(shiftCivilDate('2026-02-28', 1)).toBe('2026-03-01'); // no bisiesto
		expect(shiftCivilDate('2028-02-28', 1)).toBe('2028-02-29'); // bisiesto
	});
});

describe('computeLinkWindow', () => {
	const retreat = { startDate: '2026-11-20', endDate: '2026-11-22', timezone: 'America/Mexico_City' };

	it('outside the window: more than 7 days before the start', () => {
		const w = computeLinkWindow(retreat, '2026-11-12');
		expect(w.canLink).toBe(false);
		expect(w.linkOpenOn).toBe('2026-11-13');
	});

	it('inside the window: from startDate − 7 to endDate', () => {
		expect(computeLinkWindow(retreat, '2026-11-13').canLink).toBe(true);
		expect(computeLinkWindow(retreat, '2026-11-20').canLink).toBe(true);
		expect(computeLinkWindow(retreat, '2026-11-22').canLink).toBe(true);
	});

	it('outside the window: after endDate', () => {
		expect(computeLinkWindow(retreat, '2026-11-23').canLink).toBe(false);
	});

	it('sync stays allowed in the post-retreat grace, up to endDate + retention', () => {
		const w = computeLinkWindow(retreat, '2026-11-30');
		expect(w.canLink).toBe(false);
		expect(w.syncAllowed).toBe(true);
		expect(w.syncCloseOn).toBe('2026-12-07');
		expect(computeLinkWindow(retreat, '2026-12-08').syncAllowed).toBe(false);
	});
});

describe('isLinkPurgeDue', () => {
	it('purges strictly AFTER endDate + retention', () => {
		expect(isLinkPurgeDue('2026-11-22', '2026-12-07')).toBe(false); // exactly the limit
		expect(isLinkPurgeDue('2026-11-22', '2026-12-08')).toBe(true);
	});
});

describe('acceptedJidDigitVariants', () => {
	it('MX: with and without the extra 1 (521 mobile / 52 landline)', () => {
		expect(acceptedJidDigitVariants('5512345678', 'MX')).toEqual([
			'525512345678',
			'5215512345678',
		]);
	});

	it('US: calling code + national only (no extra 1)', () => {
		expect(acceptedJidDigitVariants('5551234567', 'US')).toEqual(['15551234567']);
	});

	it('unknown country: the bare national number only', () => {
		expect(acceptedJidDigitVariants('5512345678', 'ZZ')).toEqual(['5512345678']);
	});
});

describe('civilTodayInTimezone', () => {
	afterEach(() => {
		jest.useRealTimers();
	});

	it('CDMX vs UTC: the CDMX night is "tomorrow" in UTC — the civil date rules', () => {
		// 2026-11-20 01:30 CDMX == 2026-11-20 07:30 UTC (same civil day)…
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-11-20T07:30:00Z'));
		expect(civilTodayInTimezone('America/Mexico_City')).toBe('2026-11-20');
		expect(civilTodayInTimezone('Etc/UTC')).toBe('2026-11-20');

		// …but 2026-11-20 23:30 CDMX == 2026-11-21 05:30 UTC: a different day.
		jest.setSystemTime(new Date('2026-11-21T05:30:00Z'));
		expect(civilTodayInTimezone('America/Mexico_City')).toBe('2026-11-20');
		expect(civilTodayInTimezone('Etc/UTC')).toBe('2026-11-21');
	});

	it('invalid timezone: the service resolves it with resolveSafeTimeZone before calling', () => {
		// civilTodayInTimezone does not validate; the contract is to receive an
		// already-safe tz (resolveSafeTimeZone). Documented here to keep track.
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2026-11-20T12:00:00Z'));
		expect(civilTodayInTimezone('Europe/Madrid')).toBe('2026-11-20');
	});
});
