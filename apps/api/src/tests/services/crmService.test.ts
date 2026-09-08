import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { CrmService } from '@/services/crmService';
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';
import { User } from '@/entities/user.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { ParticipantNote } from '@/entities/participantNote.entity';
import { AppDataSource } from '@/data-source';

describe('CrmService', () => {
	let svc: CrmService;
	let retreat: Retreat;
	let participant: Participant;
	let author: User;
	let other: User;

	beforeAll(async () => {
		await setupTestDatabase();
		svc = new CrmService();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		retreat = await TestDataFactory.createTestRetreat();
		participant = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' } as any);
		author = await TestDataFactory.createTestUser({ email: 'autor@test.com' } as any);
		other = await TestDataFactory.createTestUser({ email: 'otro@test.com' } as any);
	});

	const attendanceOf = async () =>
		(
			await AppDataSource.getRepository(RetreatParticipant).findOne({
				where: { participantId: participant.id, retreatId: retreat.id },
			})
		)?.attendanceConfirmation;

	const threadOf = async () =>
		AppDataSource.getRepository(ParticipantNote).find({
			where: { participantId: participant.id, retreatId: retreat.id },
			order: { createdAt: 'ASC' },
		});

	describe('follow-up (pipeline)', () => {
		it('upsert crea y luego actualiza el estado (un solo registro por participante)', async () => {
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'contacted',
				note: 'Le escribí por WhatsApp',
			});
			let list = await svc.listFollowUps(retreat.id);
			expect(list).toHaveLength(1);
			expect(list[0].status).toBe('contacted');

			// Upsert de nuevo → actualiza, no duplica.
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'confirmed',
			});
			list = await svc.listFollowUps(retreat.id);
			expect(list).toHaveLength(1);
			expect(list[0].status).toBe('confirmed');
		});
	});

	describe('cambio de etapa: registro en el hilo', () => {
		it('registra el cambio con from/to, y no ensucia el hilo al reguardar lo mismo', async () => {
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'contacted',
				updatedBy: author.id,
			});
			let thread = await threadOf();
			expect(thread).toHaveLength(1);
			expect(thread[0].kind).toBe('stage_change');
			// Primer cambio: no había etapa previa.
			expect(thread[0].metadata?.from).toBeUndefined();
			expect(thread[0].metadata?.to).toBe('contacted');
			expect(thread[0].createdBy).toBe(author.id);

			// Guardar el MISMO estado no debe agregar otra entrada.
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'contacted',
				note: 'sólo cambié la nota',
				updatedBy: author.id,
			});
			expect(await threadOf()).toHaveLength(1);

			// Un cambio real sí.
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'no_answer',
				updatedBy: author.id,
			});
			thread = await threadOf();
			expect(thread).toHaveLength(2);
			expect(thread[1].metadata?.from).toBe('contacted');
			expect(thread[1].metadata?.to).toBe('no_answer');
		});
	});

	describe('sincronización de la confirmación de asistencia', () => {
		it('confirmed escribe la asistencia y lo deja anotado en el hilo', async () => {
			expect(await attendanceOf()).toBe('pending');

			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'confirmed',
				updatedBy: author.id,
			});

			expect(await attendanceOf()).toBe('confirmed');
			const thread = await threadOf();
			expect(thread[0].metadata?.attendanceSynced).toBe(true);
		});

		it('declined marca que no asiste', async () => {
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'declined',
				updatedBy: author.id,
			});
			expect(await attendanceOf()).toBe('declined');
		});

		/**
		 * Mover la tarjeta hacia atrás NO revierte la asistencia: reabrir el
		 * seguimiento de alguien que ya confirmó no significa "ya no viene", y
		 * borrar la confirmación reactivaría recordatorios que ya no aplican.
		 */
		it('volver a una etapa anterior no revierte la asistencia', async () => {
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'confirmed',
				updatedBy: author.id,
			});
			expect(await attendanceOf()).toBe('confirmed');

			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'contacted',
				updatedBy: author.id,
			});

			expect(await attendanceOf()).toBe('confirmed');
			const thread = await threadOf();
			// El paso hacia atrás no escribió asistencia.
			expect(thread[1].metadata?.attendanceSynced).toBe(false);
		});

		it('las etapas intermedias no tocan la asistencia', async () => {
			for (const status of ['pending', 'contacted', 'no_answer'] as const) {
				await svc.upsertFollowUp({
					retreatId: retreat.id,
					participantId: participant.id,
					status,
					updatedBy: author.id,
				});
				expect(await attendanceOf()).toBe('pending');
			}
		});
	});

	describe('hilo de notas', () => {
		it('acumula notas con autor, lo más reciente primero', async () => {
			await svc.createNote({
				participantId: participant.id,
				retreatId: retreat.id,
				body: 'La mamá está enojada, pide hablar con el coordinador',
				createdBy: author.id,
			});
			await svc.createNote({
				participantId: participant.id,
				retreatId: retreat.id,
				body: 'Ya se resolvió, va a venir',
				createdBy: other.id,
			});

			const list = await svc.listNotes(participant.id, retreat.id);
			expect(list).toHaveLength(2);
			// Ambas sobreviven: es lo que la nota única de follow-up no permitía.
			expect(list.map((n) => n.body)).toContain('La mamá está enojada, pide hablar con el coordinador');
			expect(list[0].author?.id).toBe(other.id);
			expect(list[0].kind).toBe('note');
		});

		it('sólo el autor puede editar o borrar su nota', async () => {
			const note = await svc.createNote({
				participantId: participant.id,
				retreatId: retreat.id,
				body: 'original',
				createdBy: author.id,
			});

			expect(await svc.updateNote(note.id, 'ajeno', other.id)).toBeNull();
			expect(await svc.deleteNote(note.id, other.id)).toBe(false);

			const updated = await svc.updateNote(note.id, 'corregida', author.id);
			expect(updated?.body).toBe('corregida');
			expect(await svc.deleteNote(note.id, author.id)).toBe(true);
			expect(await svc.listNotes(participant.id, retreat.id)).toHaveLength(0);
		});

		it('las entradas del sistema son inmutables incluso para quien las provocó', async () => {
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'contacted',
				updatedBy: author.id,
			});
			const [stage] = await threadOf();
			expect(stage.kind).toBe('stage_change');

			expect(await svc.updateNote(stage.id, 'intento de reescribir la historia', author.id)).toBeNull();
			expect(await svc.deleteNote(stage.id, author.id)).toBe(false);
			expect(await threadOf()).toHaveLength(1);
		});
	});

	describe('hito de cartas (palancas)', () => {
		const setCount = async (n: number | null) => {
			const repo = AppDataSource.getRepository(RetreatParticipant);
			const rp = await repo.findOne({
				where: { participantId: participant.id, retreatId: retreat.id },
			});
			rp!.palancasReceivedCount = n;
			await repo.save(rp!);
		};

		const milestones = async () =>
			(await threadOf()).filter((n) => n.metadata?.milestone === 'palancas');

		it('registra el hito al alcanzar el mínimo del retiro', async () => {
			await setCount(3);
			await svc.recordPalancaMilestoneIfCrossed({
				participantId: participant.id,
				retreatId: retreat.id,
				previousCount: 2,
				newCount: 3,
			});

			const found = await milestones();
			expect(found).toHaveLength(1);
			expect(found[0].metadata).toMatchObject({
				milestone: 'palancas',
				count: 3,
				threshold: 3,
			});
			// Es un evento del sistema: sin autor y sin cuerpo.
			expect(found[0].createdBy).toBeNull();
			expect(found[0].body).toBeNull();
		});

		it('no registra nada si aún no llega al mínimo', async () => {
			await svc.recordPalancaMilestoneIfCrossed({
				participantId: participant.id,
				retreatId: retreat.id,
				previousCount: 0,
				newCount: 2,
			});
			expect(await milestones()).toHaveLength(0);
		});

		it('no repite el hito al seguir subiendo el conteo', async () => {
			await svc.recordPalancaMilestoneIfCrossed({
				participantId: participant.id,
				retreatId: retreat.id,
				previousCount: 2,
				newCount: 3,
			});
			// De 3 a 4 no vuelve a cruzar nada.
			await svc.recordPalancaMilestoneIfCrossed({
				participantId: participant.id,
				retreatId: retreat.id,
				previousCount: 3,
				newCount: 4,
			});
			expect(await milestones()).toHaveLength(1);
		});

		it('es idempotente aunque el conteo baje y vuelva a subir', async () => {
			await svc.recordPalancaMilestoneIfCrossed({
				participantId: participant.id,
				retreatId: retreat.id,
				previousCount: 2,
				newCount: 3,
			});
			// Alguien corrige a la baja y luego vuelve a subir: el hito histórico
			// ya está, no debe duplicarse.
			await svc.recordPalancaMilestoneIfCrossed({
				participantId: participant.id,
				retreatId: retreat.id,
				previousCount: 1,
				newCount: 5,
			});
			expect(await milestones()).toHaveLength(1);
		});

		it('un conteo sin capturar (null) no genera hito', async () => {
			await svc.recordPalancaMilestoneIfCrossed({
				participantId: participant.id,
				retreatId: retreat.id,
				previousCount: null,
				newCount: null,
			});
			expect(await milestones()).toHaveLength(0);
		});

		it('respeta el umbral del retiro', async () => {
			await AppDataSource.getRepository(Retreat).update(retreat.id, {
				minPalancasPerWalker: 5,
			} as any);

			// 3 ya no alcanza.
			await svc.recordPalancaMilestoneIfCrossed({
				participantId: participant.id,
				retreatId: retreat.id,
				previousCount: 2,
				newCount: 3,
			});
			expect(await milestones()).toHaveLength(0);

			await svc.recordPalancaMilestoneIfCrossed({
				participantId: participant.id,
				retreatId: retreat.id,
				previousCount: 3,
				newCount: 5,
			});
			const found = await milestones();
			expect(found).toHaveLength(1);
			expect(found[0].metadata?.threshold).toBe(5);
		});

		it('el hito sale en el timeline con su texto', async () => {
			await setCount(3);
			await svc.recordPalancaMilestoneIfCrossed({
				participantId: participant.id,
				retreatId: retreat.id,
				previousCount: 0,
				newCount: 3,
			});
			const timeline = await svc.getParticipantTimeline(participant.id, retreat.id);
			const hito = timeline.find(
				(e) => e.type === 'stage_change' && /cartas/i.test(e.title),
			);
			expect(hito?.title).toContain('3');
		});
	});

	describe('timeline', () => {
		it('junta registro, notas, cambios de etapa y palancas, ordenado', async () => {
			await svc.createNote({
				participantId: participant.id,
				retreatId: retreat.id,
				body: 'Nota de prueba',
				createdBy: author.id,
			});
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'confirmed',
				updatedBy: author.id,
			});

			const rpRepo = AppDataSource.getRepository(RetreatParticipant);
			const rp = await rpRepo.findOne({
				where: { participantId: participant.id, retreatId: retreat.id },
			});
			rp!.palancasReceivedCount = 4;
			await rpRepo.save(rp!);

			const timeline = await svc.getParticipantTimeline(participant.id, retreat.id);
			const types = timeline.map((e) => e.type);

			expect(types).toContain('note');
			expect(types).toContain('stage_change');
			expect(types).toContain('registered');
			expect(types).toContain('attendance');
			expect(types).toContain('palancas');

			// Los eventos con fecha van de más reciente a más antiguo.
			const dated = timeline.filter((e) => e.at).map((e) => new Date(e.at as any).getTime());
			expect([...dated].sort((a, b) => b - a)).toEqual(dated);

			const palancas = timeline.find((e) => e.type === 'palancas');
			expect(palancas?.meta?.milestone).toBe('met');
			expect(palancas?.meta?.threshold).toBe(3);
		});

		it('usa el umbral del retiro cuando lo hay', async () => {
			await AppDataSource.getRepository(Retreat).update(retreat.id, {
				minPalancasPerWalker: 5,
			} as any);
			const rpRepo = AppDataSource.getRepository(RetreatParticipant);
			const rp = await rpRepo.findOne({
				where: { participantId: participant.id, retreatId: retreat.id },
			});
			rp!.palancasReceivedCount = 4;
			await rpRepo.save(rp!);

			const timeline = await svc.getParticipantTimeline(participant.id, retreat.id);
			const palancas = timeline.find((e) => e.type === 'palancas');
			expect(palancas?.meta?.threshold).toBe(5);
			expect(palancas?.meta?.milestone).toBe('below');
		});

		it('la confirmación de asistencia va sin fecha (no tiene columna de fecha)', async () => {
			await svc.upsertFollowUp({
				retreatId: retreat.id,
				participantId: participant.id,
				status: 'confirmed',
				updatedBy: author.id,
			});
			const timeline = await svc.getParticipantTimeline(participant.id, retreat.id);
			const attendance = timeline.find(
				(e) => e.type === 'attendance' && e.meta?.currentState === true,
			);
			expect(attendance).toBeDefined();
			expect(attendance?.at).toBeNull();
		});
	});

	describe('tasks', () => {
		it('crea, lista, completa y elimina tareas', async () => {
			const task = await svc.createTask({
				retreatId: retreat.id,
				participantId: participant.id,
				title: 'Confirmar pago',
				dueDate: '2026-07-01T15:00:00.000Z',
			});
			expect(task.status).toBe('open');

			const open = await svc.listTasks(retreat.id, 'open');
			expect(open).toHaveLength(1);

			const done = await svc.updateTask(task.id, { status: 'done' });
			expect(done?.status).toBe('done');
			expect(done?.completedAt).toBeTruthy();

			expect(await svc.listTasks(retreat.id, 'open')).toHaveLength(0);
			expect(await svc.listTasks(retreat.id, 'done')).toHaveLength(1);

			expect(await svc.deleteTask(task.id)).toBe(true);
			expect(await svc.listTasks(retreat.id)).toHaveLength(0);
		});
	});
});
