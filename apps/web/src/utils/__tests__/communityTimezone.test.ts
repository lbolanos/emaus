import { describe, it, expect } from 'vitest';
import {
	formatDateInCommunityTimezone,
	getCommunityTimezone,
	DEFAULT_TIMEZONE,
} from '@repo/utils';

describe('@repo/utils — community timezone helpers', () => {
	describe('getCommunityTimezone', () => {
		it('returns community.timezone when set', () => {
			expect(getCommunityTimezone({ timezone: 'America/New_York' })).toBe('America/New_York');
		});

		it('falls back to America/Mexico_City when community is null', () => {
			expect(getCommunityTimezone(null)).toBe(DEFAULT_TIMEZONE);
			expect(getCommunityTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
		});

		it('falls back when timezone is empty string or null', () => {
			expect(getCommunityTimezone({ timezone: '' })).toBe(DEFAULT_TIMEZONE);
			expect(getCommunityTimezone({ timezone: null })).toBe(DEFAULT_TIMEZONE);
		});
	});

	describe('formatDateInCommunityTimezone', () => {
		// Fecha conocida: 2026-06-15T19:00:00.000Z = 13:00 CDT (Mexico_City, UTC-6 sin DST)
		// o 14:00 CST = "miércoles, 17 de junio" si la fecha cruza al día sig.
		// Usamos hora media para evitar ambigüedad con DST.
		const isoDate = '2026-06-15T19:00:00.000Z'; // 13:00 en MX (CDT no aplica MX), 15:00 en NY (EDT)

		it('renders in Mexico_City TZ by default when community has no timezone', () => {
			const out = formatDateInCommunityTimezone(isoDate, { timezone: null }, {
				preset: 'datetime-short',
			});
			// MX está en UTC-6 → 19:00 UTC = 13:00 hora local. Locale es-MX usa 12h
			// con "1:00 p.m.".
			expect(out).toMatch(/1:00\s*p\.?\s*m/i);
		});

		it('respects an explicit America/New_York timezone', () => {
			const out = formatDateInCommunityTimezone(
				isoDate,
				{ timezone: 'America/New_York' },
				{ preset: 'datetime-short' },
			);
			// NY en junio está en EDT (UTC-4) → 19:00 UTC = 15:00 hora local = 3:00 p.m.
			expect(out).toMatch(/3:00\s*p\.?\s*m/i);
		});

		it('honors UTC timezone exactly', () => {
			const out = formatDateInCommunityTimezone(
				isoDate,
				{ timezone: 'UTC' },
				{ preset: 'datetime-short' },
			);
			// UTC: 19:00 = 7:00 p.m.
			expect(out).toMatch(/7:00\s*p\.?\s*m/i);
		});

		it('returns empty string for null/undefined date', () => {
			expect(formatDateInCommunityTimezone(null, {})).toBe('');
			expect(formatDateInCommunityTimezone(undefined, {})).toBe('');
			expect(formatDateInCommunityTimezone('', {})).toBe('');
		});

		it('returns empty string for invalid date strings', () => {
			expect(formatDateInCommunityTimezone('not-a-date', {})).toBe('');
		});

		it('accepts Date object directly (not just ISO string)', () => {
			const d = new Date(isoDate);
			const out = formatDateInCommunityTimezone(d, { timezone: 'UTC' }, {
				preset: 'datetime-short',
			});
			expect(out).toMatch(/7:00\s*p\.?\s*m/i);
		});

		it('time preset shows only time portion', () => {
			const out = formatDateInCommunityTimezone(isoDate, { timezone: 'UTC' }, {
				preset: 'time',
			});
			expect(out).toMatch(/7:00\s*p\.?\s*m/i);
			// No debería contener formato de fecha (sin "junio" ni números de día).
			expect(out).not.toMatch(/junio|jun/i);
		});

		it('date-short preset omits time', () => {
			const out = formatDateInCommunityTimezone(
				isoDate,
				{ timezone: 'America/Mexico_City' },
				{ preset: 'date-short', locale: 'es-MX' },
			);
			expect(out).not.toMatch(/:/); // sin "13:00" etc.
		});

		it('explicit dateStyle/timeStyle override the preset', () => {
			const out = formatDateInCommunityTimezone(
				isoDate,
				{ timezone: 'UTC' },
				{ dateStyle: 'full', timeStyle: 'short', locale: 'es-MX' },
			);
			expect(out).toMatch(/7:00\s*p\.?\s*m/i);
			expect(out).toMatch(/junio/i);
		});

		it('locale=es-ES uses 24h format (regression: locale matters for rendering)', () => {
			// Cuando el caller pasa 'es-ES', el formato debería ser 24h "19:00".
			const out = formatDateInCommunityTimezone(
				isoDate,
				{ timezone: 'UTC' },
				{ locale: 'es-ES', preset: 'datetime-short' },
			);
			expect(out).toMatch(/19:00/);
		});

		it('cross-day shift: late UTC hour might wrap to next day in eastern TZ', () => {
			// 23:30 UTC en TZ Tokyo (UTC+9) → 08:30 al día siguiente.
			const lateUtc = '2026-06-15T23:30:00.000Z';
			const out = formatDateInCommunityTimezone(
				lateUtc,
				{ timezone: 'Asia/Tokyo' },
				{ dateStyle: 'short', timeStyle: 'short', locale: 'es-MX' },
			);
			// El día debería ser 16 (no 15).
			expect(out).toMatch(/16\/06/);
		});
	});
});
