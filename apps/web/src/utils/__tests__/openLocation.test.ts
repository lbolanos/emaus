/**
 * Tests for openLocation.ts — platform-aware geo deeplink dispatcher.
 *
 * The helper picks the right scheme based on `navigator.userAgent`:
 *   - iOS    → `maps://?q=lat,lng`              (opens Apple Maps)
 *   - Android → `geo:lat,lng?q=lat,lng`         (invokes native chooser)
 *   - Other  → opens https://www.google.com/maps/search/?api=1&query=...
 *              in a new tab (fallback for desktop / unknown UAs).
 *
 * The QR / message-template path uses the universal HTTPS URL directly
 * via `buildClosingChurchMapsUrl` and is covered by messageVariables tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { openLocation } from '../openLocation';

const IOS_UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IPAD_UA =
	'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
	'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME_UA =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('openLocation', () => {
	let originalUA: string;
	let originalLocationHref: string;
	let openSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		originalUA = navigator.userAgent;
		originalLocationHref = window.location.href;
		// `window.location` is read-only in jsdom; redefine `href` so the helper
		// can write to it without throwing. We capture each write below.
		Object.defineProperty(window, 'location', {
			writable: true,
			value: { href: originalLocationHref },
		});
		openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
	});

	afterEach(() => {
		Object.defineProperty(navigator, 'userAgent', {
			value: originalUA,
			configurable: true,
		});
		openSpy.mockRestore();
	});

	function stubUserAgent(ua: string) {
		Object.defineProperty(navigator, 'userAgent', {
			value: ua,
			configurable: true,
		});
	}

	it('navigates to maps:// scheme on iPhone', () => {
		stubUserAgent(IOS_UA);
		openLocation(19.4326, -99.1332);
		expect(window.location.href).toBe('maps://?q=19.4326,-99.1332');
		expect(openSpy).not.toHaveBeenCalled();
	});

	it('navigates to maps:// scheme on iPad', () => {
		stubUserAgent(IPAD_UA);
		openLocation(40.7128, -74.006);
		expect(window.location.href).toBe('maps://?q=40.7128,-74.006');
	});

	it('navigates to geo: scheme on Android (invokes native chooser)', () => {
		stubUserAgent(ANDROID_UA);
		openLocation(-33.4489, -70.6693);
		expect(window.location.href).toBe('geo:-33.4489,-70.6693?q=-33.4489,-70.6693');
		expect(openSpy).not.toHaveBeenCalled();
	});

	it('opens the universal HTTPS URL in a new tab on desktop', () => {
		stubUserAgent(DESKTOP_CHROME_UA);
		openLocation(48.8566, 2.3522);
		expect(openSpy).toHaveBeenCalledWith(
			'https://www.google.com/maps/search/?api=1&query=48.8566,2.3522',
			'_blank',
			'noopener,noreferrer',
		);
		// Desktop must NOT navigate the page away (would lose the dashboard).
		expect(window.location.href).toBe(originalLocationHref);
	});

	it('handles negative coordinates correctly', () => {
		stubUserAgent(DESKTOP_CHROME_UA);
		openLocation(-19.3776, -99.1726);
		expect(openSpy).toHaveBeenCalledWith(
			'https://www.google.com/maps/search/?api=1&query=-19.3776,-99.1726',
			'_blank',
			'noopener,noreferrer',
		);
	});

	it('treats an empty userAgent as desktop (fallback)', () => {
		stubUserAgent('');
		openLocation(0, 0);
		expect(openSpy).toHaveBeenCalled();
	});
});
