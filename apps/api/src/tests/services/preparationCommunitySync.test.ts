import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Community } from '@/entities/community.entity';
import { CommunityMeeting } from '@/entities/communityMeeting.entity';
import { CommunityMember } from '@/entities/communityMember.entity';
import { Retreat } from '@/entities/retreat.entity';
import { RetreatPreparation } from '@/entities/retreatPreparation.entity';
import {
	PreparationSyncError,
	loadPreparationAttendance,
	syncPreparationsToCommunityMeetings,
	syncSinglePreparationToCommunity,
} from '@/services/preparationCommunitySync';

const DAY = 86_400_000;

/**
 * El puente entre el calendario de preparaciones y las reuniones de la comunidad.
 *
 * Lo que hay que fijar: que sea idempotente, que ADOPTE las reuniones que el
 * coordinador ya venía creando a mano en vez de duplicar la serie (con su
 * asistencia colgando de las viejas), y que no reescriba nada existente.
 */
describe('preparationCommunitySync', () => {
	const now = new Date('2026-09-07T12:00:00.000Z');
	let user: Awaited<ReturnType<typeof TestDataFactory.createTestUser>>;
	let community: Community;
	let retreat: Retreat;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		user = await TestDataFactory.createTestUser();
		community = await TestDataFactory.createTestCommunity(user.id);
		await AppDataSource.getRepository(Community).update(community.id, {
			timezone: 'America/Mexico_City',
		});
		retreat = await TestDataFactory.createTestRetreat();
	});

	const link = () =>
		AppDataSource.getRepository(Retreat).update(retreat.id, { communityId: community.id });

	const addSession = async (date: string, weekNumber: number, time = '20:00') =>
		AppDataSource.getRepository(RetreatPreparation).save(
			AppDataSource.getRepository(RetreatPreparation).create({
				retreatId: retreat.id,
				type: 'session',
				weekNumber,
				title: `${weekNumber}ª preparación`,
				date,
				time,
				sortOrder: weekNumber * 10,
			}),
		);

	const addBreak = async (date: string) =>
		AppDataSource.getRepository(RetreatPreparation).save(
			AppDataSource.getRepository(RetreatPreparation).create({
				retreatId: retreat.id,
				type: 'break',
				title: 'Independencia',
				date,
				sortOrder: 999,
			}),
		);

	const meetingsOf = () =>
		AppDataSource.getRepository(CommunityMeeting).find({
			where: { communityId: community.id },
			order: { startDate: 'ASC' },
		});

	it('rechaza un retiro sin comunidad vinculada', async () => {
		await addSession('2026-08-19', 1);
		await expect(syncPreparationsToCommunityMeetings(retreat.id)).rejects.toThrow(
			PreparationSyncError,
		);
	});

	it('crea una reunión de tipo preparation por sesión y salta los descansos', async () => {
		await link();
		await addSession('2026-08-19', 1);
		await addSession('2026-08-26', 2);
		await addBreak('2026-09-16');

		const result = await syncPreparationsToCommunityMeetings(retreat.id);

		expect(result.created).toBe(2);
		expect(result.adopted).toBe(0);
		expect(result.skipped).toBe(1);
		const meetings = await meetingsOf();
		expect(meetings).toHaveLength(2);
		expect(meetings.every((m) => m.meetingType === 'preparation')).toBe(true);
		expect(meetings.every((m) => m.isAnnouncement === false)).toBe(true);
		// El título lleva la etiqueta del retiro para reconocerla en el listado.
		expect(meetings[0].title).toContain('1ª preparación');
	});

	it('es idempotente: volver a correrla no duplica nada', async () => {
		await link();
		await addSession('2026-08-19', 1);
		await addSession('2026-08-26', 2);

		await syncPreparationsToCommunityMeetings(retreat.id);
		const second = await syncPreparationsToCommunityMeetings(retreat.id);

		expect(second.created).toBe(0);
		expect(second.adopted).toBe(0);
		expect(await meetingsOf()).toHaveLength(2);
	});

	it('adopta la reunión que ya existe ese día en vez de duplicar la serie', async () => {
		await link();
		// El coordinador ya venía creando sus reuniones a mano, 15 minutos antes
		// de la hora del calendario y con su propio nombre.
		const existing = await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Preparacion Retiro',
			meetingType: 'preparation',
			// 2026-08-20 01:45Z = 2026-08-19 19:45 en CDMX → mismo día calendario.
			startDate: new Date('2026-08-20T01:45:00.000Z'),
		});
		await addSession('2026-08-19', 1);
		await addSession('2026-08-26', 2);

		const result = await syncPreparationsToCommunityMeetings(retreat.id);

		expect(result.adopted).toBe(1);
		expect(result.created).toBe(1);
		expect(await meetingsOf()).toHaveLength(2);

		// Y no le pisa el nombre ni la hora que el coordinador eligió.
		const kept = await AppDataSource.getRepository(CommunityMeeting).findOne({
			where: { id: existing.id },
		});
		expect(kept!.title).toBe('Preparacion Retiro');
		expect(kept!.startDate.toISOString()).toBe('2026-08-20T01:45:00.000Z');
	});

	it('adopta también las instancias de una serie recurrente', async () => {
		await link();
		// En los datos reales la bandera `isRecurrenceTemplate` está puesta también
		// en las instancias; excluirlas dejaba fuera la serie entera y duplicaba
		// las reuniones que ya tenían asistencia capturada.
		await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Preparacion Retiro',
			meetingType: 'preparation',
			isRecurrenceTemplate: true,
			startDate: new Date('2026-08-20T01:45:00.000Z'),
		});
		await addSession('2026-08-19', 1);

		const result = await syncPreparationsToCommunityMeetings(retreat.id);

		expect(result.adopted).toBe(1);
		expect(result.created).toBe(0);
	});

	it('no adopta una ocurrencia cancelada', async () => {
		await link();
		await TestDataFactory.createTestCommunityMeeting(community.id, {
			meetingType: 'preparation',
			exceptionType: 'cancelled',
			startDate: new Date('2026-08-20T01:45:00.000Z'),
		});
		await addSession('2026-08-19', 1);

		const result = await syncPreparationsToCommunityMeetings(retreat.id);

		expect(result.adopted).toBe(0);
		expect(result.created).toBe(1);
	});

	it('reporta la discrepancia de fecha en vez de mover la reunión', async () => {
		await link();
		const session = await addSession('2026-08-19', 1);
		await syncPreparationsToCommunityMeetings(retreat.id);

		// El coordinador mueve la semana en el calendario.
		await AppDataSource.getRepository(RetreatPreparation).update(session.id, {
			date: '2026-08-20',
		});
		const result = await syncPreparationsToCommunityMeetings(retreat.id);

		expect(result.created).toBe(0);
		expect(result.mismatched).toHaveLength(1);
		expect(result.mismatched[0]).toMatchObject({
			preparationId: session.id,
			calendarDay: '2026-08-20',
			meetingDay: '2026-08-19',
		});
		// La reunión sigue donde estaba: mover una con asistencia capturada la falsea.
		const meetings = await meetingsOf();
		expect(meetings).toHaveLength(1);
	});

	it('recrea la reunión si el vínculo quedó colgado', async () => {
		await link();
		const session = await addSession('2026-08-19', 1);
		await syncPreparationsToCommunityMeetings(retreat.id);
		const [meeting] = await meetingsOf();

		// Se borra la reunión desde el módulo de comunidad: el id queda colgado.
		await AppDataSource.getRepository(CommunityMeeting).delete(meeting.id);
		const result = await syncPreparationsToCommunityMeetings(retreat.id);

		expect(result.created).toBe(1);
		const reloaded = await AppDataSource.getRepository(RetreatPreparation).findOne({
			where: { id: session.id },
		});
		expect(reloaded!.communityMeetingId).not.toBe(meeting.id);
	});

	describe('syncSinglePreparationToCommunity', () => {
		// El botón de la fila: crea la reunión de UNA semana sin tocar las demás.
		it('crea la reunión de esa sesión y deja las otras sin tocar', async () => {
			await link();
			const first = await addSession('2026-08-19', 1);
			await addSession('2026-08-26', 2);

			const result = await syncSinglePreparationToCommunity(first.id);

			expect(result.outcome).toBe('created');
			const meetings = await meetingsOf();
			expect(meetings).toHaveLength(1);
			const reloaded = await AppDataSource.getRepository(RetreatPreparation).find({
				where: { retreatId: retreat.id },
			});
			expect(reloaded.filter((p) => p.communityMeetingId)).toHaveLength(1);
		});

		it('adopta la reunión que ya exista ese día', async () => {
			await link();
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				title: 'Preparacion Retiro',
				meetingType: 'preparation',
				startDate: new Date('2026-08-20T01:45:00.000Z'),
			});
			const session = await addSession('2026-08-19', 1);

			const result = await syncSinglePreparationToCommunity(session.id);

			expect(result.outcome).toBe('adopted');
			expect(await meetingsOf()).toHaveLength(1);
		});

		it('es idempotente: repetir deja la misma reunión', async () => {
			await link();
			const session = await addSession('2026-08-19', 1);
			const first = await syncSinglePreparationToCommunity(session.id);
			const second = await syncSinglePreparationToCommunity(session.id);

			expect(second.meetingId).toBe(first.meetingId);
			expect(second.outcome).toBe('linked');
			expect(await meetingsOf()).toHaveLength(1);
		});

		it('rechaza un descanso: un festivo no es una reunión', async () => {
			await link();
			const holiday = await addBreak('2026-09-16');

			await expect(syncSinglePreparationToCommunity(holiday.id)).rejects.toThrow(
				PreparationSyncError,
			);
		});

		it('rechaza un retiro sin comunidad vinculada', async () => {
			const session = await addSession('2026-08-19', 1);
			await expect(syncSinglePreparationToCommunity(session.id)).rejects.toThrow(
				PreparationSyncError,
			);
		});
	});

	describe('loadPreparationAttendance', () => {
		it('devuelve el mapa vacío cuando nada está sincronizado', async () => {
			await addSession('2026-08-19', 1);
			expect((await loadPreparationAttendance(retreat.id, now)).size).toBe(0);
		});

		it('marca pendiente una reunión futura en vez de darle 0%', async () => {
			await link();
			const session = await addSession('2026-09-30', 5);
			await syncPreparationsToCommunityMeetings(retreat.id);

			const attendance = await loadPreparationAttendance(retreat.id, now);
			const row = attendance.get(session.id);
			expect(row).toBeTruthy();
			expect(row!.pending).toBe(true);
			expect(row!.attended).toBe(0);
		});

		it('cuenta la asistencia de una reunión ya celebrada', async () => {
			await link();
			const session = await addSession('2026-08-19', 1);
			await syncPreparationsToCommunityMeetings(retreat.id);
			const [meeting] = await meetingsOf();

			const present = await TestDataFactory.createTestParticipant(retreat.id);
			const absent = await TestDataFactory.createTestParticipant(retreat.id);
			const m1 = await TestDataFactory.createTestCommunityMember(community.id, present.id);
			const m2 = await TestDataFactory.createTestCommunityMember(community.id, absent.id);
			await AppDataSource.getRepository(CommunityMember).update(
				[m1.id, m2.id],
				{ joinedAt: new Date(now.getTime() - 365 * DAY) },
			);
			await TestDataFactory.createTestCommunityAttendance(meeting.id, m1.id, true);
			await TestDataFactory.createTestCommunityAttendance(meeting.id, m2.id, false);

			const row = (await loadPreparationAttendance(retreat.id, now)).get(session.id);
			expect(row).toMatchObject({ attended: 1, eligible: 2, ratePercent: 50, pending: false });
		});
	});
});
