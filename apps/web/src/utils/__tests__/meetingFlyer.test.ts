import { describe, it, expect } from 'vitest';
import {
	formatCommunityAddress,
	formatMeetingDateOnly,
	formatMeetingTimeOnly,
} from '@/utils/meetingFlyer';

describe('meetingFlyer — formatCommunityAddress', () => {
	const base = {
		address1: 'Calle Tlacoquemecatl 218',
		address2: null,
		city: 'Ciudad de México',
		state: 'Ciudad de México',
		zipCode: '03100',
		country: 'Mexico',
	};

	it('drops the state when it repeats the city', () => {
		expect(formatCommunityAddress(base)).toBe(
			'Calle Tlacoquemecatl 218, Ciudad de México, 03100',
		);
	});

	it('keeps the state when it differs from the city', () => {
		expect(
			formatCommunityAddress({ ...base, city: 'Toluca', state: 'Estado de México' }),
		).toBe('Calle Tlacoquemecatl 218, Toluca, Estado de México, 03100');
	});

	it('drops the country for the home market (Mexico/México, any casing)', () => {
		// Same output regardless of how the home country is spelled — the address
		// must not end with the country ("Ciudad de México" is the city, not it).
		const withoutCountry = 'Calle Tlacoquemecatl 218, Ciudad de México, 03100';
		expect(formatCommunityAddress({ ...base, country: 'México' })).toBe(withoutCountry);
		expect(formatCommunityAddress({ ...base, country: 'MEXICO' })).toBe(withoutCountry);
	});

	it('keeps foreign countries', () => {
		expect(formatCommunityAddress({ ...base, country: 'España' })).toContain('España');
	});

	it('skips empty parts and keeps address2 when present', () => {
		expect(
			formatCommunityAddress({
				...base,
				address2: 'Colonia del Valle Sur',
				zipCode: '',
			}),
		).toBe('Calle Tlacoquemecatl 218, Colonia del Valle Sur, Ciudad de México');
	});
});

describe('meetingFlyer — flyer date/time lines', () => {
	// 2026-09-24T01:45:00Z = 2026-09-23 19:45 in America/Mexico_City (UTC-6).
	const isoDate = '2026-09-24T01:45:00.000Z';
	const community = { timezone: 'America/Mexico_City' };

	it('formatMeetingDateOnly renders weekday+date without year or time', () => {
		expect(formatMeetingDateOnly(isoDate, community)).toBe('miércoles, 23 de septiembre');
	});

	it('formatMeetingDateOnly falls back to the default community TZ', () => {
		expect(formatMeetingDateOnly(isoDate, null)).toBe('miércoles, 23 de septiembre');
	});

	it('formatMeetingTimeOnly renders 24h hh:mm without unit (caller appends hrs.)', () => {
		expect(formatMeetingTimeOnly(isoDate, community)).toBe('19:45');
	});
});
