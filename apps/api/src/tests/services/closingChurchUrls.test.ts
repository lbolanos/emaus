/**
 * Direct tests for the closing-mass URL helpers exported from `@repo/utils`.
 *
 * These helpers are also exercised end-to-end through `replaceAllVariables`
 * in `messageVariables.test.ts`, but we want to lock the wire format
 * separately because:
 *   - QR codes embed these strings verbatim — a regression in the URL
 *     shape silently breaks scans.
 *   - Both helpers must return an empty string (not `undefined`, not
 *     `'null'`) when coordinates are missing, so plantillas don't render
 *     "Cómo llegar: undefined".
 */
import {
	buildClosingChurchMapsUrl,
	buildClosingChurchWazeUrl,
} from '@repo/utils';

describe('buildClosingChurchMapsUrl', () => {
	it('produces the official Google Maps universal search URL from lat/lng', () => {
		expect(buildClosingChurchMapsUrl(19.3776, -99.1726)).toBe(
			'https://www.google.com/maps/search/?api=1&query=19.3776,-99.1726',
		);
	});

	it('preserves negative coordinates without dropping signs', () => {
		expect(buildClosingChurchMapsUrl(-33.4489, -70.6693)).toBe(
			'https://www.google.com/maps/search/?api=1&query=-33.4489,-70.6693',
		);
	});

	it('accepts coordinates at the equator / prime meridian', () => {
		expect(buildClosingChurchMapsUrl(0, 0)).toBe(
			'https://www.google.com/maps/search/?api=1&query=0,0',
		);
	});

	it('returns empty string when latitude is missing', () => {
		expect(buildClosingChurchMapsUrl(undefined, -99.1726)).toBe('');
		expect(buildClosingChurchMapsUrl(null, -99.1726)).toBe('');
	});

	it('returns empty string when longitude is missing', () => {
		expect(buildClosingChurchMapsUrl(19.3776, undefined)).toBe('');
		expect(buildClosingChurchMapsUrl(19.3776, null)).toBe('');
	});

	it('returns empty string when both coordinates are missing', () => {
		expect(buildClosingChurchMapsUrl(null, null)).toBe('');
		expect(buildClosingChurchMapsUrl(undefined, undefined)).toBe('');
	});
});

describe('buildClosingChurchWazeUrl', () => {
	it('produces the Waze universal navigation URL from lat/lng', () => {
		expect(buildClosingChurchWazeUrl(19.3776, -99.1726)).toBe(
			'https://waze.com/ul?ll=19.3776,-99.1726&navigate=yes',
		);
	});

	it('preserves negative coordinates without dropping signs', () => {
		expect(buildClosingChurchWazeUrl(-33.4489, -70.6693)).toBe(
			'https://waze.com/ul?ll=-33.4489,-70.6693&navigate=yes',
		);
	});

	it('returns empty string when latitude is missing', () => {
		expect(buildClosingChurchWazeUrl(null, -99.1726)).toBe('');
	});

	it('returns empty string when longitude is missing', () => {
		expect(buildClosingChurchWazeUrl(19.3776, undefined)).toBe('');
	});

	it('returns empty string when both coordinates are missing', () => {
		expect(buildClosingChurchWazeUrl(undefined, undefined)).toBe('');
		expect(buildClosingChurchWazeUrl(null, null)).toBe('');
	});
});
