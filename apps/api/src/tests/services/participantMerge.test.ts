import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { createMockResponse } from '../test-utils/authTestUtils';
import { CommunityController } from '@/controllers/communityController';
import { AppDataSource } from '@/data-source';
import { Community } from '@/entities/community.entity';
import { CommunityAttendance } from '@/entities/communityAttendance.entity';
import { CommunityMember } from '@/entities/communityMember.entity';
import { Participant } from '@/entities/participant.entity';
import { Retreat } from '@/entities/retreat.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import {
	ParticipantMergeError,
	findDuplicateCandidatesForCommunity,
	mergeParticipants,
	previewMerge,
} from '@/services/participantMergeService';

/**
 * Fusión de participantes duplicados.
 *
 * El caso real: la misma persona inscrita en un retiro y dada de alta aparte en
 * el padrón. Lo que hay que fijar es que la fusión mueva TODO, que no invente
 * nada cuando los datos chocan, y que el absorbido quede como lápida en vez de
 * desaparecer.
 */
describe('participantMergeService', () => {
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
		retreat = await TestDataFactory.createTestRetreat();
		await AppDataSource.getRepository(Retreat).update(retreat.id, {
			communityId: community.id,
		});
	});

	/** Ficha del retiro (el "servidor") y ficha del padrón (el "miembro"). */
	const duplicatePair = async (
		firstName = 'Nicolás',
		lastName = 'Méndez Platonoff',
	) => {
		// Teléfonos y correos distintos a propósito: la factory le pone el mismo
		// teléfono a todos, y con eso la pareja coincidiría por teléfono en vez de
		// por nombre, que es lo que aquí interesa probar.
		const server = await TestDataFactory.createTestParticipant(retreat.id, {
			firstName,
			lastName,
			type: 'server',
			email: `srv-${Date.now()}@test.local`,
			cellPhone: '5511110001',
		} as never);
		// El del padrón se crea en OTRO retiro para que no haya solape.
		const otherRetreat = await TestDataFactory.createTestRetreat();
		const member = await TestDataFactory.createTestParticipant(otherRetreat.id, {
			// Con acentos distintos a propósito: la detección tiene que doblarlos.
			firstName: 'Nicolas',
			lastName: 'Mendez Platonoff',
			email: `mem-${Date.now()}@test.local`,
			cellPhone: '5522220002',
		} as never);
		const memberRow = await TestDataFactory.createTestCommunityMember(
			community.id,
			member.id,
		);
		return { server, member, memberRow };
	};

	describe('findDuplicateCandidatesForCommunity', () => {
		it('propone la pareja aunque los acentos no coincidan', async () => {
			const { server, member } = await duplicatePair();

			const candidates = await findDuplicateCandidatesForCommunity(community.id);
			const pair = candidates.find((c) =>
				c.participants.some((p) => p.id === server.id) &&
				c.participants.some((p) => p.id === member.id),
			);

			// "Nicolás Méndez" y "Nicolas Mendez" son la misma persona: si esto falla,
			// la normalización dejó de doblar acentos.
			expect(pair).toBeTruthy();
			expect(pair!.matchedBy).toBe('name');
		});

		it('también propone por teléfono aunque el nombre esté escrito distinto', async () => {
			// "Pepe Marín" y "José Fernando Marín Soto" no coinciden por nombre, pero
			// el teléfono es la misma persona. El teléfono se compara por sus últimos
			// 10 dígitos, así que los prefijos no estorban.
			const a = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Pepe',
				lastName: 'Marín',
				cellPhone: '5533330003',
			} as never);
			const otherRetreat = await TestDataFactory.createTestRetreat();
			const b = await TestDataFactory.createTestParticipant(otherRetreat.id, {
				firstName: 'José Fernando',
				lastName: 'Marín Soto',
				cellPhone: '+52 55 3333 0003',
			} as never);
			await TestDataFactory.createTestCommunityMember(community.id, b.id);

			const candidates = await findDuplicateCandidatesForCommunity(community.id);
			const pair = candidates.find(
				(c) =>
					c.participants.some((p) => p.id === a.id) &&
					c.participants.some((p) => p.id === b.id),
			);

			expect(pair).toBeTruthy();
			expect(pair!.matchedBy).toBe('phone');
		});

		it('no propone a alguien consigo mismo ni a personas distintas', async () => {
			const p = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Única',
				lastName: 'Persona',
			} as never);
			await TestDataFactory.createTestCommunityMember(community.id, p.id);

			const candidates = await findDuplicateCandidatesForCommunity(community.id);

			expect(candidates.every((c) => c.participants.length >= 2)).toBe(true);
			expect(
				candidates.some((c) => c.participants.filter((x) => x.id === p.id).length > 1),
			).toBe(false);
		});

		it('deja fuera a los ya fusionados', async () => {
			const { server, member } = await duplicatePair();
			await mergeParticipants(server.id, member.id);

			const candidates = await findDuplicateCandidatesForCommunity(community.id);

			expect(candidates.flatMap((c) => c.participants.map((p) => p.id))).not.toContain(
				member.id,
			);
		});
	});

	describe('previewMerge', () => {
		it('enumera lo que se movería sin tocar nada', async () => {
			const { server, member } = await duplicatePair();

			const preview = await previewMerge(server.id, member.id);

			expect(preview.blockers).toEqual([]);
			const memberMove = preview.moves.find((m) => m.table === 'community_member');
			expect(memberMove?.rows).toBe(1);
			// Nada se movió: el padrón sigue apuntando al absorbido.
			const still = await AppDataSource.getRepository(CommunityMember).findOne({
				where: { communityId: community.id, participantId: member.id },
			});
			expect(still).not.toBeNull();
		});

		it('bloquea si las dos fichas están en el mismo retiro', async () => {
			// Es el caso real de "Jose Fernando": qué ficha se conserva (tipo, mesa,
			// cama, pagos) es una decisión con pérdida y no le toca al automatismo.
			const a = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Jose',
				lastName: 'Marin',
			} as never);
			const b = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Jose',
				lastName: 'Marin',
			} as never);

			const preview = await previewMerge(a.id, b.id);

			expect(preview.blockers).toHaveLength(1);
			expect(preview.blockers[0].table).toBe('retreat_participants');
			await expect(mergeParticipants(a.id, b.id)).rejects.toThrow(ParticipantMergeError);
		});

		it('reconcilia el solape cuando una inscripción está cancelada', async () => {
			// El caso real de "Marín": las dos fichas están en el mismo retiro, pero
			// la del padrón tiene la inscripción CANCELADA. Una baja de un registro
			// duplicado no es información que valga conservar, así que gana la activa.
			const keep = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Jose',
				lastName: 'Marin',
			} as never);
			const merge = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Jose',
				lastName: 'Marin',
				isCancelled: true,
			} as never);

			const preview = await previewMerge(keep.id, merge.id);
			expect(preview.blockers).toEqual([]);

			await mergeParticipants(keep.id, merge.id);

			// Una sola ficha en el retiro, y la que queda es la activa.
			const rows = await AppDataSource.getRepository(RetreatParticipant).find({
				where: { retreatId: retreat.id, participantId: keep.id },
			});
			expect(rows).toHaveLength(1);
			expect(rows[0].isCancelled).toBe(false);
		});

		it('conserva la inscripción activa aunque esté del lado absorbido', async () => {
			// Al revés: la que sobrevive como identidad tiene la baja, y la absorbida
			// es la que participó de verdad. Se descarta la cancelada, no la real.
			const keep = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Ana',
				lastName: 'Ruiz',
				isCancelled: true,
			} as never);
			const merge = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Ana',
				lastName: 'Ruiz',
			} as never);

			await mergeParticipants(keep.id, merge.id);

			const rows = await AppDataSource.getRepository(RetreatParticipant).find({
				where: { retreatId: retreat.id, participantId: keep.id },
			});
			expect(rows).toHaveLength(1);
			expect(rows[0].isCancelled).toBe(false);
		});

		it('con las dos canceladas resuelve dejando una', async () => {
			const keep = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Luis',
				lastName: 'Baja',
				isCancelled: true,
			} as never);
			const merge = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Luis',
				lastName: 'Baja',
				isCancelled: true,
			} as never);

			const preview = await previewMerge(keep.id, merge.id);
			expect(preview.blockers).toEqual([]);
			await mergeParticipants(keep.id, merge.id);

			const rows = await AppDataSource.getRepository(RetreatParticipant).find({
				where: { retreatId: retreat.id, participantId: keep.id },
			});
			expect(rows).toHaveLength(1);
		});

		it('el bloqueo nombra el retiro para que se pueda ir a resolverlo', async () => {
			const a = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Dos',
				lastName: 'Activas',
			} as never);
			const b = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Dos',
				lastName: 'Activas',
			} as never);

			const preview = await previewMerge(a.id, b.id);

			expect(preview.blockers).toHaveLength(1);
			expect(preview.blockers[0].reason).toContain('ACTIVA');
		});

		it('bloquea si las dos fichas tienen cuenta de usuario', async () => {
			const { server, member } = await duplicatePair();
			const userRepo = AppDataSource.getRepository('users');
			await userRepo.update({ id: user.id }, { participantId: server.id } as never);
			const second = await TestDataFactory.createTestUser();
			await userRepo.update({ id: second.id }, { participantId: member.id } as never);

			const preview = await previewMerge(server.id, member.id);

			expect(preview.blockers.some((b) => b.table === 'users')).toBe(true);
		});

		it('rechaza fusionar una ficha consigo misma', async () => {
			const { server } = await duplicatePair();
			await expect(previewMerge(server.id, server.id)).rejects.toThrow(
				ParticipantMergeError,
			);
		});
	});

	describe('mergeParticipants', () => {
		it('mueve el padrón al superviviente y deja lápida en el absorbido', async () => {
			const { server, member } = await duplicatePair();

			await mergeParticipants(server.id, member.id);

			const rows = await AppDataSource.getRepository(CommunityMember).find({
				where: { communityId: community.id },
			});
			expect(rows.map((r) => r.participantId)).toContain(server.id);
			expect(rows.map((r) => r.participantId)).not.toContain(member.id);

			// El absorbido NO se borra: queda apuntando a quien lo absorbió.
			const absorbed = await AppDataSource.getRepository(Participant).findOne({
				where: { id: member.id },
			});
			expect(absorbed).not.toBeNull();
			expect(absorbed!.mergedIntoParticipantId).toBe(server.id);
			// Y sale de los listados que filtran por el retreatId de la propia tabla.
			expect(absorbed!.retreatId ?? null).toBeNull();
		});

		it('mueve la asistencia cuando los dos ya eran miembros de la comunidad', async () => {
			const { server, member, memberRow } = await duplicatePair();
			// El superviviente también entra al padrón → choca el UNIQUE y hay que
			// fusionar las filas de miembro, no reapuntar.
			const keepMember = await TestDataFactory.createTestCommunityMember(
				community.id,
				server.id,
			);
			const meeting = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(Date.now() - 86_400_000),
			});
			await TestDataFactory.createTestCommunityAttendance(meeting.id, memberRow.id, true);

			await mergeParticipants(server.id, member.id);

			const attendance = await AppDataSource.getRepository(CommunityAttendance).find({
				where: { meetingId: meeting.id },
			});
			expect(attendance).toHaveLength(1);
			expect(attendance[0].memberId).toBe(keepMember.id);
			// Y sólo queda una fila de miembro para la comunidad.
			const members = await AppDataSource.getRepository(CommunityMember).find({
				where: { communityId: community.id },
			});
			expect(members).toHaveLength(1);
		});

		it('no duplica asistencia si los dos ya la tenían en la misma reunión', async () => {
			const { server, member, memberRow } = await duplicatePair();
			const keepMember = await TestDataFactory.createTestCommunityMember(
				community.id,
				server.id,
			);
			const meeting = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(Date.now() - 86_400_000),
			});
			await TestDataFactory.createTestCommunityAttendance(meeting.id, keepMember.id, true);
			await TestDataFactory.createTestCommunityAttendance(meeting.id, memberRow.id, false);

			await mergeParticipants(server.id, member.id);

			// `community_attendance` no tiene UNIQUE en la base: si esto se duplicara,
			// la persona contaría dos veces en el denominador.
			const attendance = await AppDataSource.getRepository(CommunityAttendance).find({
				where: { meetingId: meeting.id },
			});
			expect(attendance).toHaveLength(1);
			expect(attendance[0].memberId).toBe(keepMember.id);
		});

		// La dirección que sí perdía el dato: el registro bueno estaba en la ficha
		// ABSORBIDA. El reapunte se salta las reuniones que el superviviente ya
		// tiene, y al borrar la fila de miembro el CASCADE de
		// `community_attendance.memberId` se llevaba el "sí asistió", dejando en
		// pie el "no asistió". La persona pasaba a contar como ausente de una
		// reunión a la que fue.
		it('el "sí asistió" del absorbido gana sobre el "no asistió" del superviviente', async () => {
			const { server, member, memberRow } = await duplicatePair();
			const keepMember = await TestDataFactory.createTestCommunityMember(
				community.id,
				server.id,
			);
			const meeting = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(Date.now() - 86_400_000),
			});
			await TestDataFactory.createTestCommunityAttendance(meeting.id, keepMember.id, false);
			await TestDataFactory.createTestCommunityAttendance(meeting.id, memberRow.id, true);

			await mergeParticipants(server.id, member.id);

			const attendance = await AppDataSource.getRepository(CommunityAttendance).find({
				where: { meetingId: meeting.id },
			});
			expect(attendance).toHaveLength(1);
			expect(attendance[0].memberId).toBe(keepMember.id);
			expect(attendance[0].attended).toBe(true);
		});

		// El preview contaba como "movidos" también los registros que la ejecución
		// no mueve (los de reuniones que el superviviente ya tiene).
		it('el preview separa los registros que se reapuntan de los que se pliegan', async () => {
			const { server, member, memberRow } = await duplicatePair();
			const keepMember = await TestDataFactory.createTestCommunityMember(
				community.id,
				server.id,
			);
			const shared = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(Date.now() - 86_400_000),
			});
			const onlyAbsorbed = await TestDataFactory.createTestCommunityMeeting(community.id, {
				meetingType: 'preparation',
				startDate: new Date(Date.now() - 172_800_000),
			});
			await TestDataFactory.createTestCommunityAttendance(shared.id, keepMember.id, true);
			await TestDataFactory.createTestCommunityAttendance(shared.id, memberRow.id, true);
			await TestDataFactory.createTestCommunityAttendance(onlyAbsorbed.id, memberRow.id, true);

			const preview = await previewMerge(server.id, member.id);

			expect(preview.attendanceMoved).toBe(1);
			expect(preview.attendanceMerged).toBe(1);
		});

		it('mueve las referencias sin unicidad, como el liderazgo de mesa', async () => {
			const { server, member } = await duplicatePair();
			const [table] = await TestDataFactory.createTestTables(retreat.id, 1);
			await AppDataSource.query(`UPDATE "tables" SET "liderId" = ? WHERE id = ?`, [
				member.id,
				table.id,
			]);

			await mergeParticipants(server.id, member.id);

			const [row] = await AppDataSource.query(`SELECT "liderId" FROM "tables" WHERE id = ?`, [
				table.id,
			]);
			expect(row.liderId).toBe(server.id);
		});

		it('no deja ninguna referencia apuntando al absorbido', async () => {
			const { server, member } = await duplicatePair();
			const { PARTICIPANT_REFERENCES } = await import('@/services/participantMergeService');

			await mergeParticipants(server.id, member.id);

			for (const ref of PARTICIPANT_REFERENCES) {
				const [{ c }] = await AppDataSource.query(
					`SELECT COUNT(*) AS c FROM "${ref.table}" WHERE "${ref.column}" = ?`,
					[member.id],
				);
				expect(Number(c)).toBe(0);
			}
		});

		it('es idempotente en la práctica: no se puede refusionar', async () => {
			const { server, member } = await duplicatePair();
			await mergeParticipants(server.id, member.id);

			await expect(mergeParticipants(server.id, member.id)).rejects.toThrow(
				ParticipantMergeError,
			);
		});
	});

	// El preview viaja por query params. Validarlo con `mergeParticipantsSchema`
	// —que envuelve todo en `{ body, params }`— hacía que el parse fallara SIEMPRE
	// y el endpoint devolviera 400 en todos los casos, incluido el bueno. El lint
	// no lo veía; `tsc` sí.
	describe('previewParticipantMerge (controlador)', () => {
		const reqFor = (query: any) => ({ query, params: { id: community.id } }) as any;

		it('400 con mensaje útil cuando falta o es inválido un id', async () => {
			const res = createMockResponse();
			await CommunityController.previewParticipantMerge(reqFor({ keepId: 'no-es-uuid' }), res);
			expect(res.status).toHaveBeenCalledWith(400);
		});

		it('200 con los dos ids válidos, y el preview trae los dos contadores', async () => {
			const { server, member } = await duplicatePair();
			const res = createMockResponse();
			await CommunityController.previewParticipantMerge(
				reqFor({ keepId: server.id, mergeId: member.id }),
				res,
			);
			expect(res.status).not.toHaveBeenCalledWith(400);
			const payload = (res.json as jest.Mock).mock.calls[0][0];
			expect(payload).toMatchObject({ keepId: server.id, mergeId: member.id });
			expect(typeof payload.attendanceMoved).toBe('number');
			expect(typeof payload.attendanceMerged).toBe('number');
		});
	});
});
