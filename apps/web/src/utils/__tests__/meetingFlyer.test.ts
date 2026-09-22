import { describe, it, expect } from 'vitest';
import {
	formatCommunityAddress,
	formatMeetingDateOnly,
	formatMeetingTimeOnly,
	meetingTitleSizeClass,
	showEmausBrandLine,
	titleCaseForDisplay,
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

	it('title-cases parts typed in a hurry', () => {
		expect(
			formatCommunityAddress({
				...base,
				address1: 'calle tlacoquemecatl 218',
				address2: 'colonia del valle sur',
			}),
		).toBe('Calle Tlacoquemecatl 218, Colonia del Valle Sur, Ciudad de México, 03100');
	});
});

describe('meetingFlyer — titleCaseForDisplay', () => {
	it('capitalizes a hurriedly typed community name', () => {
		expect(titleCaseForDisplay('Buen despacho')).toBe('Buen Despacho');
	});

	it('keeps Spanish connectors lowercase (except when opening)', () => {
		expect(titleCaseForDisplay('parroquia el señor del buen despacho')).toBe(
			'Parroquia el Señor del Buen Despacho',
		);
		expect(titleCaseForDisplay('a la orilla del mar')).toBe('A la Orilla del Mar');
	});

	it('never rewrites words with inner capitals — that casing is intentional', () => {
		expect(titleCaseForDisplay('AV. CDMX 218')).toBe('AV. CDMX 218');
	});

	it('leaves already-correct text unchanged', () => {
		expect(titleCaseForDisplay('Calle Tlacoquemecatl 218')).toBe('Calle Tlacoquemecatl 218');
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

describe('meetingFlyer — showEmausBrandLine', () => {
	it('drops the brand line for names that already carry it (any accent/case)', () => {
		expect(showEmausBrandLine('Emaús del Valle')).toBe(false);
		expect(showEmausBrandLine('EMAUS Guadalajara')).toBe(false);
		expect(showEmausBrandLine('  emaús del valle  ')).toBe(false);
	});

	it('keeps the brand line for every other community', () => {
		expect(showEmausBrandLine('Buen Despacho')).toBe(true);
		expect(showEmausBrandLine('')).toBe(true);
		expect(showEmausBrandLine(null)).toBe(true);
	});
});

describe('meetingFlyer — meetingTitleSizeClass', () => {
	it('steps the size down as the title grows', () => {
		expect(meetingTitleSizeClass('Convivencia')).toBe('text-[64px] print:text-[56px]');
		expect(meetingTitleSizeClass('Convivencia de Adviento')).toBe('text-[44px] print:text-[38px]');
		expect(
			meetingTitleSizeClass('Convivencia de Adviento con la comunidad del Señor del Buen Despacho'),
		).toBe('text-[34px] print:text-[30px]');
	});

	it('measures the trimmed title and survives empty input', () => {
		expect(meetingTitleSizeClass('  ')).toBe('text-[64px] print:text-[56px]');
		expect(meetingTitleSizeClass(null)).toBe('text-[64px] print:text-[56px]');
	});
});
