import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { CrmController } from '@/controllers/crmController';
import { crmService } from '@/services/crmService';
import { authorizationService } from '@/middleware/authorization';

function mockRes() {
	const res: any = { statusCode: 200, body: undefined };
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body: any) => {
		res.body = body;
		return res;
	};
	return res;
}

/**
 * Autorización de los endpoints del hilo de notas, a nivel de controlador.
 *
 * Cubre dos cosas distintas que se confunden fácil:
 *  1. **Acceso al retiro** — quien no lo tiene no lee ni escribe nada.
 *  2. **Autoría** — quien SÍ tiene acceso al retiro sigue sin poder editar la
 *     nota de otra persona, ni tocar una entrada del sistema.
 *
 * Y el guard anti-IDOR: el `retreatId` va gated por la ruta, pero el
 * `participantId` llega aparte, así que hay que verificar que pertenezca a ese
 * retiro o un coordinador leería el hilo de participantes ajenos.
 */
describe('CrmController — hilo de notas: autorización', () => {
	const controller = new CrmController();
	// La DB de test SÍ enforcea FKs: `createdBy` apunta a `users`, así que los
	// autores tienen que ser filas reales, no ids inventados.
	let AUTHOR: string;
	let PEER: string;
	let OUTSIDER: string;

	let retreatId: string;
	let participantId: string;
	let otherRetreatId: string;
	let otherParticipantId: string;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.restoreAllMocks();

		AUTHOR = (await TestDataFactory.createTestUser({ email: 'autor@test.com' } as any)).id;
		PEER = (await TestDataFactory.createTestUser({ email: 'peer@test.com' } as any)).id;
		OUTSIDER = (await TestDataFactory.createTestUser({ email: 'fuera@test.com' } as any)).id;

		const retreat = await TestDataFactory.createTestRetreat();
		retreatId = retreat.id;
		const participant = await TestDataFactory.createTestParticipant(retreatId, {
			type: 'walker',
		} as any);
		participantId = participant.id;

		const other = await TestDataFactory.createTestRetreat();
		otherRetreatId = other.id;
		const otherParticipant = await TestDataFactory.createTestParticipant(otherRetreatId, {
			type: 'walker',
		} as any);
		otherParticipantId = otherParticipant.id;

		// AUTHOR y PEER tienen acceso al retiro; OUTSIDER no.
		jest
			.spyOn(authorizationService, 'hasRetreatAccess')
			.mockImplementation(async (userId: string) => userId !== OUTSIDER);
	});

	const req = (userId: string, extra: any = {}) =>
		({ user: { id: userId }, params: {}, body: {}, ...extra }) as any;

	async function seedNote(userId?: string) {
		return crmService.createNote({
			participantId,
			retreatId,
			body: 'La mamá pide que le llamemos por la tarde',
			createdBy: userId ?? AUTHOR,
		});
	}

	describe('acceso al retiro', () => {
		it('sin acceso al retiro no se puede crear una nota', async () => {
			const res = mockRes();
			await controller.createNote(
				req(OUTSIDER, { body: { retreatId, participantId, body: 'intruso' } }),
				res,
			);
			expect(res.statusCode).toBe(403);
			expect(await crmService.listNotes(participantId, retreatId)).toHaveLength(0);
		});

		it('sin acceso al retiro no se puede editar ni borrar', async () => {
			const note = await seedNote();

			const resEdit = mockRes();
			await controller.updateNote(
				req(OUTSIDER, { params: { id: note.id }, body: { body: 'cambiado' } }),
				resEdit,
			);
			expect(resEdit.statusCode).toBe(403);

			const resDel = mockRes();
			await controller.deleteNote(req(OUTSIDER, { params: { id: note.id } }), resDel);
			expect(resDel.statusCode).toBe(403);

			// La nota sigue intacta.
			const [vigente] = await crmService.listNotes(participantId, retreatId);
			expect(vigente.body).toBe('La mamá pide que le llamemos por la tarde');
		});
	});

	describe('autoría', () => {
		it('un compañero con acceso al retiro NO puede editar la nota de otro', async () => {
			const note = await seedNote(AUTHOR);
			const res = mockRes();
			await controller.updateNote(
				req(PEER, { params: { id: note.id }, body: { body: 'me la apropio' } }),
				res,
			);
			expect(res.statusCode).toBe(403);
			const [vigente] = await crmService.listNotes(participantId, retreatId);
			expect(vigente.body).toBe('La mamá pide que le llamemos por la tarde');
		});

		it('un compañero con acceso al retiro NO puede borrar la nota de otro', async () => {
			const note = await seedNote(AUTHOR);
			const res = mockRes();
			await controller.deleteNote(req(PEER, { params: { id: note.id } }), res);
			expect(res.statusCode).toBe(403);
			expect(await crmService.listNotes(participantId, retreatId)).toHaveLength(1);
		});

		it('el autor sí puede editar y borrar la suya', async () => {
			const note = await seedNote(AUTHOR);

			const resEdit = mockRes();
			await controller.updateNote(
				req(AUTHOR, { params: { id: note.id }, body: { body: 'corregida' } }),
				resEdit,
			);
			expect(resEdit.statusCode).toBe(200);
			expect(resEdit.body.body).toBe('corregida');

			const resDel = mockRes();
			await controller.deleteNote(req(AUTHOR, { params: { id: note.id } }), resDel);
			expect(resDel.statusCode).toBe(200);
			expect(await crmService.listNotes(participantId, retreatId)).toHaveLength(0);
		});

		it('las entradas del sistema no se pueden editar ni borrar', async () => {
			await crmService.upsertFollowUp({
				retreatId,
				participantId,
				status: 'contacted',
				updatedBy: AUTHOR,
			});
			const [stage] = await crmService.listNotes(participantId, retreatId);
			expect(stage.kind).toBe('stage_change');

			const resEdit = mockRes();
			await controller.updateNote(
				req(AUTHOR, { params: { id: stage.id }, body: { body: 'reescribir la historia' } }),
				resEdit,
			);
			expect(resEdit.statusCode).toBe(403);

			const resDel = mockRes();
			await controller.deleteNote(req(AUTHOR, { params: { id: stage.id } }), resDel);
			expect(resDel.statusCode).toBe(403);
			expect(await crmService.listNotes(participantId, retreatId)).toHaveLength(1);
		});
	});

	describe('IDOR cross-retiro', () => {
		it('no se puede crear una nota sobre un participante de otro retiro', async () => {
			const res = mockRes();
			await controller.createNote(
				req(AUTHOR, {
					body: { retreatId, participantId: otherParticipantId, body: 'ajeno' },
				}),
				res,
			);
			expect(res.statusCode).toBe(404);
		});

		it('no se puede listar el hilo de un participante de otro retiro', async () => {
			const res = mockRes();
			await controller.listNotes(
				req(AUTHOR, { params: { retreatId, participantId: otherParticipantId } }),
				res,
			);
			expect(res.statusCode).toBe(404);
		});

		it('no se puede leer el timeline de un participante de otro retiro', async () => {
			const res = mockRes();
			await controller.getTimeline(
				req(AUTHOR, { params: { retreatId, participantId: otherParticipantId } }),
				res,
			);
			expect(res.statusCode).toBe(404);
		});
	});

	describe('validación', () => {
		it('rechaza una nota vacía', async () => {
			const res = mockRes();
			await controller.createNote(
				req(AUTHOR, { body: { retreatId, participantId, body: '   ' } }),
				res,
			);
			expect(res.statusCode).toBe(400);
		});

		it('una nota que no existe da 404, no 403', async () => {
			const res = mockRes();
			await controller.deleteNote(
				req(AUTHOR, { params: { id: '00000000-0000-0000-0000-000000000000' } }),
				res,
			);
			expect(res.statusCode).toBe(404);
		});
	});
});
