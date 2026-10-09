import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { createMockResponse } from '../test-utils/authTestUtils';
import { CommunityController } from '@/controllers/communityController';
import { AppDataSource } from '@/data-source';
import { Community } from '@/entities/community.entity';
import { CommunityAuditLog } from '@/entities/communityAuditLog.entity';
import { CommunityAttendance } from '@/entities/communityAttendance.entity';
import { CommunityMember } from '@/entities/communityMember.entity';
import { Participant } from '@/entities/participant.entity';
import { Retreat } from '@/entities/retreat.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import {
	ParticipantMergeError,
	countDuplicateCandidatesForCommunity,
	dismissDuplicatePair,
	findDuplicateCandidatesForCommunity,
	listDuplicateDismissals,
	mergeParticipants,
	previewMerge,
	undoDuplicateDismissal,
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

	// El badge del botón "Duplicados" sale de un endpoint propio que no paga el
	// enriquecimiento por ficha. El contrato que importa es el ACUERDO: contar y
	// listar recorren el mismo loadDuplicateGroups, así que el número del badge
	// siempre significa exactamente lo que el botón abre. Los valores absolutos
	// fijan que el acuerdo no sea trivial (ambos en 0 todo el tiempo también
	// estarían de acuerdo).
	describe('countDuplicateCandidatesForCommunity (acuerdo badge ↔ listado)', () => {
		const both = async () =>
			Promise.all([
				countDuplicateCandidatesForCommunity(community.id),
				findDuplicateCandidatesForCommunity(community.id),
			]);

		it('0 y listado vacío sin duplicados', async () => {
			await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Única',
				lastName: 'Persona',
			} as never);

			const [count, list] = await both();

			expect(count).toBe(0);
			expect(list).toHaveLength(0);
		});

		it('1 con un par: el badge dice lo que el botón abre', async () => {
			await duplicatePair();

			const [count, list] = await both();

			expect(count).toBe(1);
			expect(list).toHaveLength(1);
		});

		it('2 con dos pares independientes', async () => {
			await duplicatePair();
			// Segundo par a mano: duplicatePair recicla teléfonos y prefijos de
			// correo, y dos llamadas en el mismo milisegundo harían colisionar
			// los emails — los cuatro agrupados como uno solo.
			const other = await TestDataFactory.createTestRetreat();
			const a = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Rosa',
				lastName: 'Del Valle',
				email: `p2a-${Date.now()}@test.local`,
				cellPhone: '5544440004',
			} as never);
			const b = await TestDataFactory.createTestParticipant(other.id, {
				firstName: 'Rosa',
				lastName: 'Del Valle',
				email: `p2b-${Date.now()}@test.local`,
				cellPhone: '+52 55 4444 0004',
			} as never);
			await TestDataFactory.createTestCommunityMember(community.id, b.id);

			const [count, list] = await both();

			expect(count).toBe(2);
			expect(list).toHaveLength(2);
		});

		it('el controlador responde 200 con ese número', async () => {
			await duplicatePair();
			const res = createMockResponse();

			await CommunityController.getDuplicateCount(
				{ params: { id: community.id } } as any,
				res,
			);

			expect(res.status).not.toHaveBeenCalled();
			const payload = (res.json as jest.Mock).mock.calls[0][0];
			expect(payload).toEqual({ count: 1 });
		});
	});

	// El falso positivo (los hermanos Garay en los datos reales) sale para siempre
	// si no hay manera de decirle al sistema "no son la misma persona". El descarte
	// vive en su propia tabla, aplica dentro de loadDuplicateGroups —así lista,
	// badge y hint se enteran de una sola vez— y tiene undo explícito: sin él, un
	// misclick escondería un duplicado real para siempre.
	describe('dismissDuplicatePair (falsos positivos)', () => {
		const both = async () =>
			Promise.all([
				countDuplicateCandidatesForCommunity(community.id),
				findDuplicateCandidatesForCommunity(community.id),
			]);

		it('saca el par de la lista Y del count', async () => {
			const { server, member } = await duplicatePair();
			const [countBefore] = await both();
			expect(countBefore).toBe(1);

			await dismissDuplicatePair(community.id, server.id, member.id);

			const [count, list] = await both();
			expect(count).toBe(0);
			expect(list).toHaveLength(0);
		});

		it('canonicaliza el orden: A,B y B,A son la misma fila', async () => {
			const { server, member } = await duplicatePair();

			const first = await dismissDuplicatePair(community.id, server.id, member.id);
			const reversed = await dismissDuplicatePair(community.id, member.id, server.id);

			expect(reversed.id).toBe(first.id);
			const rows = await AppDataSource.query(
				`SELECT COUNT(*) AS c FROM community_duplicate_dismissal`,
			);
			expect(Number(rows[0].c)).toBe(1);
		});

		it('es idempotente: repetir el dismiss devuelve la fila existente', async () => {
			const { server, member } = await duplicatePair();

			const first = await dismissDuplicatePair(community.id, server.id, member.id);
			await expect(
				dismissDuplicatePair(community.id, server.id, member.id),
			).resolves.toMatchObject({ id: first.id });
		});

		it('NO filtra grupos de 3+: descartar en bloque escondería pares verdaderos', async () => {
			// Tres fichas con el mismo nombre (la factory les da el mismo teléfono a
			// todas, así que coinciden por las dos huellas — mismo grupo de 3).
			const a = await TestDataFactory.createTestParticipant(retreat.id, {
				firstName: 'Trillizo',
				lastName: 'García',
			} as never);
			const other1 = await TestDataFactory.createTestRetreat();
			const b = await TestDataFactory.createTestParticipant(other1.id, {
				firstName: 'Trillizo',
				lastName: 'Garcia',
			} as never);
			await TestDataFactory.createTestCommunityMember(community.id, b.id);
			const other2 = await TestDataFactory.createTestRetreat();
			const c = await TestDataFactory.createTestParticipant(other2.id, {
				firstName: 'Trillizo',
				lastName: 'García',
			} as never);
			await TestDataFactory.createTestCommunityMember(community.id, c.id);

			await dismissDuplicatePair(community.id, a.id, b.id);

			const [count, list] = await both();
			expect(count).toBe(1);
			expect(list).toHaveLength(1);
			expect(list[0].participants).toHaveLength(3);
		});

		it('la lista trae nombres y el undo revive el par', async () => {
			const { server, member } = await duplicatePair();
			const dismissal = await dismissDuplicatePair(
				community.id,
				server.id,
				member.id,
				user.id,
			);

			const dismissals = await listDuplicateDismissals(community.id);
			expect(dismissals).toHaveLength(1);
			expect(dismissals[0].id).toBe(dismissal.id);
			const names = [
				dismissals[0].participantA.firstName,
				dismissals[0].participantB.firstName,
			].sort();
			expect(names).toEqual(['Nicolas', 'Nicolás']);

			await undoDuplicateDismissal(community.id, dismissal.id);

			const [count] = await both();
			expect(count).toBe(1);
		});

		it('el undo no puede tocar un descarte de otra comunidad', async () => {
			const { server, member } = await duplicatePair();
			const dismissal = await dismissDuplicatePair(community.id, server.id, member.id);
			const otherCommunity = await TestDataFactory.createTestCommunity(user.id);

			await expect(
				undoDuplicateDismissal(otherCommunity.id, dismissal.id),
			).rejects.toThrow(ParticipantMergeError);
		});

		it('rechaza descartar una ficha consigo misma o con una que no existe', async () => {
			const { server } = await duplicatePair();

			await expect(
				dismissDuplicatePair(community.id, server.id, server.id),
			).rejects.toThrow(ParticipantMergeError);
			await expect(
				dismissDuplicatePair(
					community.id,
					server.id,
					'00000000-0000-4000-8000-000000000000',
				),
			).rejects.toThrow(ParticipantMergeError);
		});

		it('ids ausentes dan error de validación, no el engañoso "consigo misma"', async () => {
			// Con ambos ids undefined, `a === b` evalúa true y el guard viejo
			// reportaba self-comparison. Hoy zod lo bloquea en la ruta, pero el
			// service es exportado y su contrato no debe mentir.
			await expect(
				dismissDuplicatePair(community.id, undefined as any, undefined as any),
			).rejects.toThrow('Faltan las fichas del par a descartar');
			await expect(
				dismissDuplicatePair(community.id, '' as any, '' as any),
			).rejects.toThrow('Faltan las fichas del par a descartar');
		});
	});

	// Controladores de descarte, mismo criterio de embed que getDuplicateCount
	// (M2): la suite de servicio ya levanta la base; no hace falta un harness HTTP
	// aparte para el 200/400. El gate de ruta (owner-only + validación) tiene su
	// propio test de wiring en tests/routes.
	describe('descartes (controlador)', () => {
		it('400 al descartar una ficha consigo misma', async () => {
			const { server } = await duplicatePair();
			const res = createMockResponse();

			await CommunityController.dismissDuplicatePair(
				{
					params: { id: community.id },
					body: { participantAId: server.id, participantBId: server.id },
					user: { id: user.id },
				} as any,
				res,
			);

			expect(res.status).toHaveBeenCalledWith(400);
		});

		it('200 al descartar, lista con el par y 204 al deshacer', async () => {
			const { server, member } = await duplicatePair();
			const res = createMockResponse();

			await CommunityController.dismissDuplicatePair(
				{
					params: { id: community.id },
					body: { participantAId: server.id, participantBId: member.id },
					user: { id: user.id },
				} as any,
				res,
			);

			expect(res.status).not.toHaveBeenCalled();
			const dismissal = (res.json as jest.Mock).mock.calls[0][0];
			expect(dismissal.participantA.id).toBeDefined();
			expect(dismissal.participantB.id).toBeDefined();

			const resList = createMockResponse();
			await CommunityController.listDuplicateDismissals(
				{ params: { id: community.id } } as any,
				resList,
			);
			const list = (resList.json as jest.Mock).mock.calls[0][0];
			expect(list).toHaveLength(1);

			const resUndo = { ...createMockResponse(), end: jest.fn().mockReturnThis() };
			await CommunityController.undoDuplicateDismissal(
				{ params: { id: community.id, dismissalId: dismissal.id } } as any,
				resUndo,
			);
			expect(resUndo.status).toHaveBeenCalledWith(204);
			expect(resUndo.end).toHaveBeenCalled();
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

		it('ids ausentes dan error de validación, no el engañoso "consigo misma"', async () => {
			await expect(previewMerge(undefined as any, undefined as any)).rejects.toThrow(
				'Faltan las fichas a fusionar',
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

	// El merge es cirugía de identidad global; hasta M4 no dejaba rastro en el
	// audit log. El log va DESPUÉS de resolver y fuera de la transacción: un
	// audit caído no puede tirar atrás una fusión ya hecha.
	describe('mergeParticipantDuplicates (controlador) — audit', () => {
		const mergeReq = (body: any) =>
			({
				params: { id: community.id },
				body,
				user: { id: user.id },
				ip: '127.0.0.1',
				get: () => 'Jest/1.0',
			}) as any;

		it('deja fila de audit tras un 200, con matchedBy y los contadores', async () => {
			const { server, member } = await duplicatePair();
			const res = createMockResponse();

			await CommunityController.mergeParticipantDuplicates(
				mergeReq({ keepId: server.id, mergeId: member.id, matchedBy: 'name' }),
				res,
			);
			expect(res.status).not.toHaveBeenCalled();
			// Fire-and-forget: darle tiempo a aterrizar antes de leer la tabla.
			await new Promise((r) => setTimeout(r, 100));

			const repo = AppDataSource.getRepository(CommunityAuditLog);
			const rows = await repo.find({
				where: { communityId: community.id, action: 'community.participant.merge' },
			});
			expect(rows).toHaveLength(1);
			expect(rows[0].actorUserId).toBe(user.id);
			expect(rows[0].resourceId).toBe(server.id);
			const metadata = JSON.parse(rows[0].metadata as string);
			expect(metadata).toMatchObject({
				keepId: server.id,
				mergeId: member.id,
				matchedBy: 'name',
			});
			expect(typeof metadata.totalRowsMoved).toBe('number');
			expect(typeof metadata.attendanceMoved).toBe('number');
			expect(typeof metadata.attendanceMerged).toBe('number');
		});

		it('responde 200 aunque el audit caiga: la fusión ya está hecha', async () => {
			const { server, member } = await duplicatePair();
			const auditRepo = AppDataSource.getRepository(CommunityAuditLog);
			const save = jest
				.spyOn(auditRepo, 'save')
				.mockRejectedValue(new Error('audit down'));
			const res = createMockResponse();

			try {
				await CommunityController.mergeParticipantDuplicates(
					mergeReq({ keepId: server.id, mergeId: member.id }),
					res,
				);
				await new Promise((r) => setTimeout(r, 50));
			} finally {
				save.mockRestore();
			}

			expect(res.status).not.toHaveBeenCalled();
			const payload = (res.json as jest.Mock).mock.calls[0][0];
			expect(payload).toMatchObject({ merged: true, keepId: server.id });
		});
	});
});
