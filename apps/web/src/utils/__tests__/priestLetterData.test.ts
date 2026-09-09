// The timezone half of the priest letter. The prose lives in @repo/utils and is
// covered by apps/api/src/tests/services/priestLetter.simple.test.ts; what is
// at stake here is that a letter printed from another country still states the
// retreat's own wall-clock times.

import { describe, expect, it } from 'vitest';
import type { RetreatPreparationDTO, RetreatScheduleItemDTO } from '@/services/api';
import {
	buildPriestLetterData,
	cleanChurchName,
	resolveRetreatTimezone,
	retreatLetterLogoUrl,
	toPriestLetterSource,
	zonedWallClock,
} from '@/utils/priestLetterData';

const MX = 'America/Mexico_City';

const scheduleItem = (
	partial: Partial<RetreatScheduleItemDTO> & { startTime: string },
): RetreatScheduleItemDTO =>
	({
		id: partial.id ?? 'item-1',
		retreatId: 'retreat-1',
		name: partial.name ?? 'Misa de servidores',
		type: partial.type ?? 'misa',
		day: partial.day ?? 1,
		endTime: partial.endTime ?? partial.startTime,
		durationMinutes: 40,
		orderInDay: 10,
		status: 'pending',
		blocksSantisimoAttendance: false,
		...partial,
	}) as RetreatScheduleItemDTO;

const prep = (date: string, time: string | null = '19:00'): RetreatPreparationDTO =>
	({
		id: `prep-${date}`,
		retreatId: 'retreat-1',
		type: 'session',
		title: 'Preparación',
		date,
		time,
		sortOrder: 0,
		createdAt: '',
		updatedAt: '',
	}) as RetreatPreparationDTO;

describe('priestLetterData', () => {
	describe('zonedWallClock', () => {
		it('renders the instant in the given zone, not in the process one', () => {
			// 19:00 UTC is 13:00 in Mexico City (UTC-6).
			expect(zonedWallClock('2026-06-05T19:00:00.000Z', MX)).toEqual({
				date: '2026-06-05',
				time: '13:00',
			});
		});

		it('gives 00:00 and never 24:00 at midnight', () => {
			// 06:00 UTC is midnight in Mexico City.
			expect(zonedWallClock('2026-06-06T06:00:00.000Z', MX)).toEqual({
				date: '2026-06-06',
				time: '00:00',
			});
		});

		it('uses the calendar day of the zone, not of UTC', () => {
			// 03:00 UTC on the 8th is still 21:00 on the 7th in Mexico City.
			expect(zonedWallClock('2026-06-08T03:00:00.000Z', MX)).toEqual({
				date: '2026-06-07',
				time: '21:00',
			});
		});

		it('changes the time when the zone changes, same instant', () => {
			const instant = '2026-06-05T19:00:00.000Z';
			expect(zonedWallClock(instant, MX)?.time).toBe('13:00');
			expect(zonedWallClock(instant, 'Europe/Madrid')?.time).toBe('21:00');
			expect(zonedWallClock(instant, 'America/Bogota')?.time).toBe('14:00');
		});

		it('no revienta con una zona que Intl no reconoce', () => {
			// `retreat.timezone` es texto libre: un valor mal escrito lanzaba
			// RangeError y tumbaba el diálogo entero.
			expect(() => zonedWallClock('2026-06-05T19:00:00.000Z', 'Marte/Olympus')).not.toThrow();
			// Cae a CDMX, que es el default del retiro.
			expect(zonedWallClock('2026-06-05T19:00:00.000Z', 'Marte/Olympus')).toEqual({
				date: '2026-06-05',
				time: '13:00',
			});
		});

		it('returns null for an unparseable instant', () => {
			expect(zonedWallClock('not-a-date', MX)).toBeNull();
		});
	});

	describe('resolveRetreatTimezone', () => {
		it('prefers the retreat over its house, and falls back to CDMX', () => {
			expect(
				resolveRetreatTimezone({ timezone: 'America/Bogota', house: { timezone: MX } }),
			).toBe('America/Bogota');
			expect(resolveRetreatTimezone({ house: { timezone: 'America/Bogota' } })).toBe(
				'America/Bogota',
			);
			expect(resolveRetreatTimezone({})).toBe(MX);
			expect(resolveRetreatTimezone(null)).toBe(MX);
		});
	});

	describe('toPriestLetterSource', () => {
		it('flattens the responsability name that the list endpoint already loads', () => {
			const source = toPriestLetterSource(
				[
					scheduleItem({
						startTime: '2026-06-05T19:00:00.000Z',
						responsability: { id: 'r1', name: 'Sacerdotes' },
					}),
				],
				MX,
			);
			expect(source[0]).toMatchObject({
				responsabilityName: 'Sacerdotes',
				date: '2026-06-05',
				time: '13:00',
			});
		});

		it('survives an item with no responsability', () => {
			const source = toPriestLetterSource(
				[scheduleItem({ startTime: '2026-06-05T19:00:00.000Z', responsability: null })],
				MX,
			);
			expect(source[0].responsabilityName).toBeNull();
		});

		it('drops items whose instant cannot be read instead of throwing', () => {
			expect(toPriestLetterSource([scheduleItem({ startTime: 'nope' })], MX)).toEqual([]);
		});
	});

	describe('cleanChurchName', () => {
		it('recorta la ciudad que pega el autocompletado de Google Places', () => {
			// El nombre real de Buen Despacho llega así, y sale tres veces en la
			// carta: la línea extra decide si cabe en una hoja.
			expect(cleanChurchName('Parroquia del Señor del Buen Despacho | Mexico City')).toBe(
				'Parroquia del Señor del Buen Despacho',
			);
		});

		it('deja intacto un nombre ya limpio', () => {
			expect(cleanChurchName('Parroquia de San Agustín')).toBe('Parroquia de San Agustín');
		});

		it('devuelve null cuando no queda nombre', () => {
			expect(cleanChurchName(null)).toBeNull();
			expect(cleanChurchName('  ')).toBeNull();
			expect(cleanChurchName('| solo la ciudad')).toBeNull();
		});
	});

	describe('retreatLetterLogoUrl', () => {
		it('mirrors the flyer mapping', () => {
			expect(retreatLetterLogoUrl('men')).toBe('/oficial_mejorado.png');
			expect(retreatLetterLogoUrl('women')).toBe('/woman_logo.png');
			expect(retreatLetterLogoUrl('couples')).toBe('/crossRoseButtT.png');
			expect(retreatLetterLogoUrl(null)).toBe('/crossRoseButtT.png');
		});
	});

	describe('buildPriestLetterData', () => {
		const retreat = {
			parish: 'Emaús Hombres Polanco',
			startDate: '2026-06-05',
			endDate: '2026-06-07',
			retreat_type: 'men',
			closingChurchName: 'Parroquia de San Agustín',
			timezone: MX,
			house: { name: 'Casa de Retiro', timezone: MX },
		};

		it('assembles the letter input from the raw payloads', () => {
			const data = buildPriestLetterData({
				retreat,
				preparations: [prep('2026-04-07'), prep('2026-04-21'), prep('2026-05-05')],
				scheduleItems: [
					scheduleItem({
						startTime: '2026-06-05T19:00:00.000Z',
						day: 1,
						name: 'Misa de servidores',
						responsability: { id: 'r1', name: 'Sacerdotes' },
					}),
					scheduleItem({
						id: 'item-2',
						startTime: '2026-06-08T00:40:00.000Z',
						day: 3,
						name: 'Misa de Cierre del Retiro',
						responsability: { id: 'r1', name: 'Sacerdotes' },
					}),
				],
			});

			expect(data).toMatchObject({
				retreatName: 'Emaús Hombres Polanco',
				startDate: '2026-06-05',
				endDate: '2026-06-07',
				parishChurchName: 'Parroquia de San Agustín',
			});
			// El logo no viaja en los datos de la carta: lo resuelve el diálogo.
			expect(data).not.toHaveProperty('logoUrl');
			// Fortnightly meetings on a Tuesday.
			expect(data?.meetings).toMatchObject({ weekday: 2, time: '19:00', intervalDays: 14 });
			expect(data?.scheduleItems.map((entry) => [entry.role, entry.time])).toEqual([
				['sendingMass', '13:00'],
				['closingMass', '18:40'],
			]);
		});

		it('accepts Date objects from the date columns without shifting a day', () => {
			const data = buildPriestLetterData({
				retreat: { ...retreat, startDate: new Date('2026-06-05T00:00:00.000Z') },
				preparations: [],
				scheduleItems: [],
			});
			expect(data?.startDate).toBe('2026-06-05');
		});

		it('trims an ISO datetime down to the calendar date', () => {
			const data = buildPriestLetterData({
				retreat: { ...retreat, startDate: '2026-06-05T00:00:00.000Z' },
				preparations: [],
				scheduleItems: [],
			});
			expect(data?.startDate).toBe('2026-06-05');
		});

		it('returns null without the retreat dates: every request hangs off them', () => {
			expect(
				buildPriestLetterData({ retreat: { ...retreat, startDate: null }, preparations: [], scheduleItems: [] }),
			).toBeNull();
			expect(buildPriestLetterData({ retreat: null, preparations: [], scheduleItems: [] })).toBeNull();
		});

		it('yields no meetings and no acts when the retreat has neither', () => {
			const data = buildPriestLetterData({ retreat, preparations: [], scheduleItems: [] });
			expect(data?.meetings).toBeNull();
			expect(data?.scheduleItems).toEqual([]);
		});
	});
});
