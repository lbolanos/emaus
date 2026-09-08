// Pure unit of the priest request letter in @repo/utils: no DB, no browser.
// Freezes the letter text, the date arithmetic and the Minute-by-Minute filter
// against the original .docx the coordination team used to fill in by hand.

import {
	addDaysYmdUtc,
	addHoursToTime,
	announcementStartDate,
	buildPriestLetterMarkdown,
	derivePriestLetterMeetings,
	describeMeetingCadenceEs,
	formatLetterDateEs,
	formatRetreatDateRangeEs,
	isPriestLetterTask,
	previousSundayYmd,
	PRIEST_LETTER_PENDING,
	retreatTypeLabelEs,
	selectPriestScheduleItems,
	weekdayOfYmd,
	type PriestLetterPreparationEntry,
	type PriestLetterScheduleSource,
} from '@repo/utils';
import { PRE_RETIRO_EMAUS } from '../../data/preRetreatTaskSeeder';

const PRIEST = 'Sacerdotes';
const SACRAMENTS = 'Charla: Conociendo a Dios a través de los Sacramentos';

const item = (
	partial: Partial<PriestLetterScheduleSource> & { day: number; time: string; name: string },
): PriestLetterScheduleSource => ({
	type: 'misa',
	date: `2026-06-0${partial.day + 4}`,
	responsabilityName: PRIEST,
	location: null,
	...partial,
});

/** The priest-relevant items of the seeded "Emaús — México" set. */
const mexicoAgenda: PriestLetterScheduleSource[] = [
	item({ day: 1, time: '13:00', name: 'Misa de servidores' }),
	item({
		day: 2,
		time: '12:05',
		name: 'Charla: Amando a Dios a través de los Sacramentos',
		type: 'charla',
		responsabilityName: SACRAMENTS,
	}),
	item({ day: 2, time: '19:50', name: 'Recepción de sacerdotes (snack y oración)', type: 'logistica' }),
	item({ day: 2, time: '21:00', name: 'Confesiones', type: 'oracion' }),
	item({ day: 2, time: '22:30', name: 'Misa nocturna' }),
	item({ day: 3, time: '17:40', name: 'Misa de Cierre del Retiro' }),
];

/** The priest-relevant items of the seeded "Emaús — Colombia" set. */
const colombiaAgenda: PriestLetterScheduleSource[] = [
	item({ day: 1, time: '18:55', name: 'Bendición de los alimentos', type: 'oracion' }),
	item({ day: 2, time: '13:25', name: 'Testimonio 6 — Los Sacramentos', type: 'testimonio', responsabilityName: SACRAMENTS }),
	item({ day: 2, time: '18:40', name: 'Dinámica Imposición de Ceniza', type: 'dinamica' }),
	item({ day: 2, time: '20:35', name: 'Confesiones', type: 'oracion' }),
	item({ day: 2, time: '22:05', name: 'Celebración Santa Misa' }),
	item({ day: 3, time: '16:30', name: 'Misa de Cierre' }),
];

const session = (date: string, time: string | null = '19:00'): PriestLetterPreparationEntry => ({
	type: 'session',
	date,
	time,
});

describe('priest request letter', () => {
	describe('date-only arithmetic', () => {
		it('adds and subtracts calendar days without shifting the day', () => {
			expect(addDaysYmdUtc('2026-06-05', -35)).toBe('2026-05-01');
			expect(addDaysYmdUtc('2026-01-01', -1)).toBe('2025-12-31');
			expect(addDaysYmdUtc('2024-02-28', 1)).toBe('2024-02-29');
		});

		it('rejects anything that is not a plain YYYY-MM-DD', () => {
			expect(addDaysYmdUtc('2026-06-05T10:00:00Z', 1)).toBeNull();
			expect(weekdayOfYmd('')).toBeNull();
		});

		it('reads the weekday in UTC', () => {
			expect(weekdayOfYmd('2026-06-05')).toBe(5); // Friday
			expect(weekdayOfYmd('2026-04-26')).toBe(0); // Sunday
		});

		it('previousSundayYmd returns the same date when it already is a Sunday', () => {
			expect(previousSundayYmd('2026-04-26')).toBe('2026-04-26');
			expect(previousSundayYmd('2026-05-01')).toBe('2026-04-26');
		});

		it('announcementStartDate matches the original letter (5 al 7 de junio -> domingo 26 de abril)', () => {
			expect(announcementStartDate('2026-06-05')).toBe('2026-04-26');
		});

		it('addHoursToTime wraps around midnight', () => {
			expect(addHoursToTime('19:00', 2)).toBe('21:00');
			expect(addHoursToTime('23:30', 2)).toBe('01:30');
			expect(addHoursToTime('no', 2)).toBeNull();
		});
	});

	describe('Spanish prose', () => {
		it('formats a letter date with its weekday', () => {
			expect(formatLetterDateEs('2026-06-05')).toBe('viernes 5 de junio');
			expect(formatLetterDateEs('2026-04-26')).toBe('domingo 26 de abril');
		});

		it('collapses the date range when the month is shared', () => {
			expect(formatRetreatDateRangeEs('2026-06-05', '2026-06-07')).toBe('del 5 al 7 de junio');
		});

		it('spells both months when the retreat crosses a month', () => {
			expect(formatRetreatDateRangeEs('2026-05-31', '2026-06-02')).toBe(
				'del 31 de mayo al 2 de junio',
			);
		});

		it('spells both years when the retreat crosses a year', () => {
			expect(formatRetreatDateRangeEs('2026-12-30', '2027-01-01')).toBe(
				'del 30 de diciembre de 2026 al 1 de enero de 2027',
			);
		});

		it('maps the retreat type, defaulting to Hombres', () => {
			expect(retreatTypeLabelEs('men')).toBe('Hombres');
			expect(retreatTypeLabelEs('women')).toBe('Mujeres');
			expect(retreatTypeLabelEs('couples')).toBe('Matrimonios');
			expect(retreatTypeLabelEs('effeta')).toBe('Effetá');
			expect(retreatTypeLabelEs(null)).toBe('Hombres');
		});
	});

	describe('derivePriestLetterMeetings', () => {
		it('takes the weekday of the first session and the first time available', () => {
			const cadence = derivePriestLetterMeetings([
				session('2026-04-07'),
				session('2026-04-14'),
				session('2026-04-21'),
			]);
			expect(cadence).toMatchObject({ weekday: 2, time: '19:00', intervalDays: 7, sessionCount: 3 });
		});

		it('detects a fortnightly cadence', () => {
			const cadence = derivePriestLetterMeetings([
				session('2026-04-07'),
				session('2026-04-21'),
				session('2026-05-05'),
			]);
			expect(cadence?.intervalDays).toBe(14);
		});

		it('uses the mode of the gaps, so one moved date does not change the cadence', () => {
			const cadence = derivePriestLetterMeetings([
				session('2026-04-07'),
				session('2026-04-14'),
				session('2026-04-24'), // moved by the coordinator
				session('2026-05-01'),
				session('2026-05-08'),
			]);
			expect(cadence?.intervalDays).toBe(7);
		});

		it('ignores breaks when measuring the cadence', () => {
			const cadence = derivePriestLetterMeetings([
				session('2026-04-07'),
				{ type: 'break', date: '2026-04-14', time: null },
				session('2026-04-21'),
				session('2026-04-28'),
			]);
			expect(cadence?.sessionCount).toBe(3);
		});

		it('returns null with no dated sessions, and a null time when none is set', () => {
			expect(derivePriestLetterMeetings([])).toBeNull();
			expect(derivePriestLetterMeetings([{ type: 'break', date: '2026-04-14' }])).toBeNull();
			expect(derivePriestLetterMeetings([session('2026-04-07', null)])?.time).toBeNull();
		});

		it('describes the cadence in Spanish', () => {
			expect(describeMeetingCadenceEs({ weekday: 2, time: '19:00', intervalDays: 14, sessionCount: 6 })).toBe(
				'los martes de cada 15 días',
			);
			expect(describeMeetingCadenceEs({ weekday: 2, time: '19:00', intervalDays: 7, sessionCount: 6 })).toBe(
				'los martes de cada semana',
			);
			expect(describeMeetingCadenceEs(null)).toBe(PRIEST_LETTER_PENDING);
		});
	});

	describe('selectPriestScheduleItems', () => {
		it('resolves the five acts of the México set with their real times', () => {
			const selected = selectPriestScheduleItems(mexicoAgenda);
			expect(selected.map((entry) => [entry.role, entry.time])).toEqual([
				['sendingMass', '13:00'],
				['sacramentsTalk', '12:05'],
				['confessions', '21:00'],
				['nightMass', '22:30'],
				['closingMass', '17:40'],
			]);
		});

		it('drops the blessing of the meals and the ash dynamic', () => {
			const times = selectPriestScheduleItems(colombiaAgenda).map((entry) => entry.time);
			expect(times).not.toContain('18:55'); // Bendición de los alimentos (oracion)
			expect(times).not.toContain('18:40'); // Dinámica Imposición de Ceniza
		});

		it('drops the priests reception, which is logistics', () => {
			const times = selectPriestScheduleItems(mexicoAgenda).map((entry) => entry.time);
			expect(times).not.toContain('19:50');
		});

		it('leaves the sending mass out when the first day has no mass for the priest', () => {
			const selected = selectPriestScheduleItems(colombiaAgenda);
			expect(selected.map((entry) => entry.role)).toEqual([
				'confessions',
				'nightMass',
				'closingMass',
			]);
		});

		it('does not take Testimonio 6 for the sacraments talk despite the shared responsability', () => {
			const selected = selectPriestScheduleItems(colombiaAgenda);
			expect(selected.find((entry) => entry.role === 'sacramentsTalk')).toBeUndefined();
		});

		it('keeps the later mass when the closing day has two', () => {
			const selected = selectPriestScheduleItems([
				...mexicoAgenda,
				item({ day: 3, time: '19:00', name: 'Misa de Cierre (segunda)' }),
			]);
			expect(selected.find((entry) => entry.role === 'closingMass')?.time).toBe('19:00');
		});

		it('ignores items whose responsability is not the priests one', () => {
			expect(
				selectPriestScheduleItems([
					item({ day: 2, time: '12:02', name: 'Campana', type: 'campana', responsabilityName: 'Campanero' }),
				]),
			).toEqual([]);
		});

		it('returns an empty list for an empty agenda', () => {
			expect(selectPriestScheduleItems([])).toEqual([]);
		});
	});

	describe('isPriestLetterTask', () => {
		it('matches the seeded task name, accents and case aside', () => {
			expect(
				isPriestLetterTask({ name: 'Preparar con el párroco qué se necesita de él (calendario)' }),
			).toBe(true);
			expect(isPriestLetterTask({ name: 'PREPARAR CON EL PARROCO EL CALENDARIO' })).toBe(true);
		});

		it('matches a rename that mentions the priest instead', () => {
			expect(isPriestLetterTask({ name: 'Preparar con el sacerdote lo del calendario' })).toBe(true);
		});

		it('falls back to the description when the task was renamed', () => {
			expect(
				isPriestLetterTask({
					name: 'Calendario con la parroquia',
					description: 'Pedirle al párroco la Misa de envío y las confesiones',
				}),
			).toBe(true);
		});

		it('rejects unrelated tasks', () => {
			expect(isPriestLetterTask({ name: 'Comprar snacks' })).toBe(false);
			expect(isPriestLetterTask({ name: 'Presupuesto', description: 'Por equipos' })).toBe(false);
			expect(isPriestLetterTask({})).toBe(false);
		});

		it('rejects the other seeded tasks that merely name a priest', () => {
			// Naming a priest is not enough, or the letter would show up in half
			// the checklist. These are real tasks of the canonical template.
			expect(isPriestLetterTask({ name: 'Tener Parroquia / apoyo del Párroco' })).toBe(false);
			expect(isPriestLetterTask({ name: 'Invitar sacerdotes a confesar' })).toBe(false);
			expect(
				isPriestLetterTask({ name: 'Organizar cómo llegan los sacerdotes: taxi, chofer, su coche, etc.' }),
			).toBe(false);
			expect(
				isPriestLetterTask({ name: 'Pedir snack para sábado en la noche y cena de sacerdotes' }),
			).toBe(false);
			expect(
				isPriestLetterTask({
					name: 'Hablar con el párroco haciendo una presentación formal del retiro',
				}),
			).toBe(false);
		});

		it('rejects tasks that name the action without a priest', () => {
			expect(isPriestLetterTask({ name: 'Mandar cartas de Jesús' })).toBe(false);
			expect(
				isPriestLetterTask({
					name: 'Definir día y hora para las reuniones — hacer un calendario / Misa de Salida',
				}),
			).toBe(false);
		});

		it('casa con EXACTAMENTE una tarea del checklist canónico', () => {
			// Recorre el seeder real, así que añadir una tarea que mencione al
			// párroco y a un calendario rompe este test en vez de duplicar el
			// botón en la UI en silencio.
			const matches: string[] = [];
			for (const task of PRE_RETIRO_EMAUS) {
				if (isPriestLetterTask(task)) matches.push(task.name);
				for (const child of task.children ?? []) {
					if (isPriestLetterTask(child)) matches.push(child.name);
				}
			}
			expect(matches).toEqual(['Preparar con el párroco qué se necesita de él (calendario)']);
		});
	});

	describe('buildPriestLetterMarkdown', () => {
		const data = {
			retreatName: 'Emaús Hombres Polanco',
			startDate: '2026-06-05',
			endDate: '2026-06-07',
			retreatType: 'men',
			parishChurchName: 'Parroquia de San Agustín',
			houseName: 'Casa de Retiro',
			meetings: { weekday: 2, time: '19:00', intervalDays: 14, sessionCount: 6 },
			scheduleItems: selectPriestScheduleItems(mexicoAgenda),
		};

		it('reproduces the wording of the original letter', () => {
			const md = buildPriestLetterMarkdown(data);
			expect(md).toContain('con fechas del 5 al 7 de junio');
			expect(md).toContain('los martes de cada 15 días');
			expect(md).toContain('después de la Santa Misa de las 19:00 horas');
			expect(md).toContain('La reunión terminaría a las 21:00 horas');
			expect(md).toContain('Los avisos arrancarían el domingo 26 de abril');
			expect(md).toContain('(5 semanas antes del retiro)');
			expect(md).toContain('(Entre 3 y 4 Sacerdotes)');
			expect(md).toContain('las primeras 3 bancas de cada lado');
			expect(md).toContain('Gracias por su apoyo, este retiro no sería posible sin usted…');
			expect(md).toContain('**EMAÚS Hombres.**');
		});

		it('places each act with its own date and time', () => {
			const md = buildPriestLetterMarkdown(data);
			expect(md).toContain('envío de los servidores, viernes 5 de junio');
			expect(md).toContain('Santa Misa de las 13:00 en Parroquia de San Agustín');
			expect(md).toContain('Charla de los Sacramentos sábado 6 de junio, a las 12:05 hrs. Casa de Retiro');
			expect(md).toContain('Confesiones, sábado 6 de junio, a las 21:00 hrs. Casa de Retiro');
			expect(md).toContain('Misa al terminar las confesiones (a las 22:30 hrs.)');
			expect(md).toContain('Misa de Salida domingo 7 de junio');
			expect(md).toContain('Parroquia de San Agustín a las 17:40 horas');
		});

		it('keeps every point when there is no data, marking the gaps', () => {
			const md = buildPriestLetterMarkdown({
				retreatName: 'Emaús Hombres',
				startDate: '2026-06-05',
				endDate: '2026-06-07',
				scheduleItems: [],
				meetings: null,
			});
			expect(md).toContain(PRIEST_LETTER_PENDING);
			// The letter must go on asking for all four acts and both requests.
			expect(md).toContain('## Peticiones previas al retiro');
			expect(md).toContain('## Peticiones durante el retiro');
			for (const prefix of ['1.- Salón', '2.- Dar los avisos']) {
				expect(md).toContain(prefix);
			}
			for (const prefix of ['1.- Misa de Arranque', '2.- Charla de los Sacramentos', '3.- Confesiones', '4.- Misa de Salida']) {
				expect(md).toContain(prefix);
			}
			// The announcements Sunday is arithmetic, so it survives an empty agenda.
			expect(md).toContain('domingo 26 de abril');
		});

		it('never puts the logo in the body: the A4 sheet paints it in the header', () => {
			// Emitirlo aquí lo duplicaba en el impreso (uno acotado en el encabezado
			// y otro a 105mm en el cuerpo) y dejaba borrarlo al editar el texto.
			const md = buildPriestLetterMarkdown(data);
			expect(md).not.toContain('![');
			expect(md).not.toContain('.png');
			expect(md.startsWith('Por medio de este escrito')).toBe(true);
		});

		it('appends the retreat number to the name when there is one', () => {
			expect(buildPriestLetterMarkdown({ ...data, retreatNumber: 'XVI' })).toContain(
				'**Emaús Hombres Polanco XVI**',
			);
		});

		it('does not double the full stop when a place name already ends in one', () => {
			// Los nombres de casa del MaM vienen con punto ("San José Del Carmen.").
			const md = buildPriestLetterMarkdown({
				...data,
				houseName: 'San José Del Carmen.',
				scheduleItems: [
					{ role: 'sacramentsTalk', date: '2026-06-06', time: '11:55', location: null },
				],
			});
			expect(md).toContain('a las 11:55 hrs. San José Del Carmen. Esta charla');
			expect(md).not.toContain('Carmen.. Esta');
		});

		it('drops the article when the church name is not a "Parroquia …"', () => {
			const withParish = buildPriestLetterMarkdown(data);
			expect(withParish).toContain('por ellos a la Parroquia de San Agustín');

			const bareName = buildPriestLetterMarkdown({ ...data, parishChurchName: 'San Agustín' });
			expect(bareName).toContain('por ellos a San Agustín');
			expect(bareName).not.toContain('a la San Agustín');
		});

		it('separates the points with blank lines so markdown keeps them apart', () => {
			const md = buildPriestLetterMarkdown(data);
			expect(md).toContain('\n\n1.- Salón');
			expect(md).toContain('\n\n2.- Dar los avisos');
		});
	});
});
