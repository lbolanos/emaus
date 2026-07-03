import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { RetreatPreRetreatTaskDTO } from '@/services/api';

const mockApi = {
	preRetreatTaskApi: {
		list: vi.fn(),
		create: vi.fn(),
		update: vi.fn(),
		setStatus: vi.fn(),
		remove: vi.fn(),
		materialize: vi.fn(),
		addMissing: vi.fn(),
	},
	preRetreatTaskTemplateApi: {
		list: vi.fn(),
		listSets: vi.fn(),
	},
};
vi.mock('@/services/api', () => mockApi);

const task = (over: Partial<RetreatPreRetreatTaskDTO>): RetreatPreRetreatTaskDTO => ({
	id: 'id',
	retreatId: 'retreat-1',
	name: 'Tarea',
	status: 'pending',
	sortOrder: 0,
	children: [],
	progress: { done: 0, total: 0 },
	...over,
});

describe('computeTaskCounts (helper puro)', () => {
	it('cuenta done/overdue/soon/unassigned excluyendo N/A', async () => {
		const { computeTaskCounts } = await import('../preRetreatTaskStore');
		const today = '2026-07-02';
		const counts = computeTaskCounts(
			[
				task({ id: 'a', status: 'done', dueDate: '2020-01-01' }),
				task({ id: 'b', status: 'pending', dueDate: '2020-01-01' }), // vencida + sin asignar
				task({
					id: 'c',
					status: 'pending',
					dueDate: '2026-07-05', // próxima (≤7 días)
					responsibleParticipantId: 'srv-1',
				}),
				task({ id: 'd', status: 'not_applicable', dueDate: '2020-01-01' }), // excluida
				task({
					id: 'e',
					status: 'pending',
					children: [task({ id: 'e1', status: 'pending', dueDate: '2020-01-01' })],
				}),
			],
			today,
		);
		// total: a,b,c,e,e1 = 5 (d excluida)
		expect(counts.total).toBe(5);
		expect(counts.done).toBe(1);
		expect(counts.overdue).toBe(2); // b, e1
		expect(counts.soon).toBe(1); // c
		expect(counts.unassigned).toBe(3); // b, e, e1 (c tiene responsable; a está done)
	});
});

describe('tasksToCsv (helper puro)', () => {
	it('genera encabezados y una fila por tarea/sub-tarea, escapando comas', async () => {
		const { tasksToCsv } = await import('../preRetreatTaskStore');
		const csv = tasksToCsv([
			task({
				id: 'p',
				name: 'Snacks',
				dueOffsetDays: 14,
				dueDate: '2026-08-14',
				status: 'in_progress',
				responsibleText: 'Fernando',
				children: [
					task({
						id: 'c1',
						name: 'Comprar, snacks',
						status: 'done',
						responsible: { id: 'x', firstName: 'Ana', lastName: 'López', nickname: null },
					}),
				],
			}),
		]);
		const lines = csv.split('\r\n');
		expect(lines[0]).toBe(
			'Tarea,Sub-tarea,Tiempo antes,Fecha límite,Estado,Responsable,Notas,Apoyado con',
		);
		expect(lines[1]).toContain('Snacks');
		expect(lines[1]).toContain('2 semanas');
		expect(lines[1]).toContain('En curso');
		expect(lines[1]).toContain('Fernando');
		// La sub-tarea hereda su etiqueta y escapa la coma del nombre
		expect(lines[2]).toContain('"Comprar, snacks"');
		expect(lines[2]).toContain('Ana López');
		expect(lines[2]).toContain('Listo');
	});
});

describe('preRetreatTaskStore', () => {
	let store: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		setActivePinia(createPinia());
		const { usePreRetreatTaskStore } = await import('../preRetreatTaskStore');
		store = usePreRetreatTaskStore();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('buckets', () => {
		it('agrupa por offset descendente, luego "Otras fechas" y "Sin fecha" al final', () => {
			store.tasks = [
				task({ id: 'a', name: 'Flores', dueOffsetDays: 2, dueDate: '2026-09-16' }),
				task({ id: 'b', name: 'Buscar parroquia', dueOffsetDays: 120, dueDate: '2026-05-21' }),
				task({ id: 'c', name: 'Sin nada' }),
				task({ id: 'd', name: 'Fecha manual', dueDate: '2026-08-01' }),
				task({ id: 'e', name: 'Snacks', dueOffsetDays: 14, dueDate: '2026-09-04' }),
			];
			const labels = store.buckets.map((b: any) => b.label);
			expect(labels).toEqual(['4 meses antes', '2 semanas antes', '2 días antes', 'Otras fechas', 'Sin fecha']);
		});

		it('junta en el mismo bucket tareas con el mismo offset', () => {
			store.tasks = [
				task({ id: 'a', dueOffsetDays: 14, dueDate: '2026-09-04' }),
				task({ id: 'b', dueOffsetDays: 14, dueDate: '2026-09-04' }),
			];
			expect(store.buckets).toHaveLength(1);
			expect(store.buckets[0].tasks).toHaveLength(2);
		});
	});

	describe('totalProgress', () => {
		it('cuenta raíces e hijos y excluye not_applicable', () => {
			store.tasks = [
				task({
					id: 'a',
					status: 'done',
					children: [
						task({ id: 'a1', parentId: 'a', status: 'done' }),
						task({ id: 'a2', parentId: 'a', status: 'pending' }),
						task({ id: 'a3', parentId: 'a', status: 'not_applicable' }),
					],
				}),
				task({ id: 'b', status: 'not_applicable' }),
			];
			expect(store.totalProgress).toEqual({ done: 2, total: 3 });
		});
	});

	describe('semaphoreFor', () => {
		it('vencida → overdue; done → done; sin fecha → none', () => {
			expect(store.semaphoreFor(task({ dueDate: '2000-01-01' }))).toBe('overdue');
			expect(store.semaphoreFor(task({ dueDate: '2000-01-01', status: 'done' }))).toBe('done');
			expect(store.semaphoreFor(task({ dueDate: '2999-01-01' }))).toBe('ok');
			expect(store.semaphoreFor(task({}))).toBe('none');
		});
	});

	describe('setStatus (optimista con rollback)', () => {
		it('aplica el estado de inmediato y actualiza el progreso del padre', async () => {
			mockApi.preRetreatTaskApi.setStatus.mockResolvedValue({});
			const child = task({ id: 'c1', parentId: 'p', status: 'pending' });
			store.tasks = [task({ id: 'p', children: [child], progress: { done: 0, total: 1 } })];

			await store.setStatus('c1', 'done');

			expect(store.findTask('c1')?.status).toBe('done');
			expect(store.findTask('p')?.progress).toEqual({ done: 1, total: 1 });
			expect(mockApi.preRetreatTaskApi.setStatus).toHaveBeenCalledWith('c1', 'done');
		});

		it('revierte estado y progreso si el server falla', async () => {
			mockApi.preRetreatTaskApi.setStatus.mockRejectedValue(new Error('500'));
			const child = task({ id: 'c1', parentId: 'p', status: 'pending' });
			store.tasks = [task({ id: 'p', children: [child], progress: { done: 0, total: 1 } })];

			await expect(store.setStatus('c1', 'done')).rejects.toThrow('500');

			expect(store.findTask('c1')?.status).toBe('pending');
			expect(store.findTask('p')?.progress).toEqual({ done: 0, total: 1 });
		});
	});

	describe('toggleDone (cascada padre↔hijos, ignora no aplica)', () => {
		it('marcar el padre marca todos los hijos activos (no los N/A)', async () => {
			mockApi.preRetreatTaskApi.setStatus.mockResolvedValue({});
			store.tasks = [
				task({
					id: 'p',
					status: 'pending',
					children: [
						task({ id: 'c1', parentId: 'p', status: 'pending' }),
						task({ id: 'c2', parentId: 'p', status: 'done' }),
						task({ id: 'c3', parentId: 'p', status: 'not_applicable' }),
					],
					progress: { done: 1, total: 2 },
				}),
			];

			await store.toggleDone('p');

			expect(store.findTask('p')?.status).toBe('done');
			expect(store.findTask('c1')?.status).toBe('done');
			expect(store.findTask('c2')?.status).toBe('done'); // ya estaba, sin cambio
			expect(store.findTask('c3')?.status).toBe('not_applicable'); // N/A intacto
			expect(store.findTask('p')?.progress).toEqual({ done: 2, total: 2 });
			// Persistió el padre + el hijo pendiente (c2 no cambió, c3 N/A ignorado)
			const calls = mockApi.preRetreatTaskApi.setStatus.mock.calls.map((c: any[]) => c[0]);
			expect(calls.sort()).toEqual(['c1', 'p']);
		});

		it('desmarcar el padre desmarca los hijos activos', async () => {
			mockApi.preRetreatTaskApi.setStatus.mockResolvedValue({});
			store.tasks = [
				task({
					id: 'p',
					status: 'done',
					children: [
						task({ id: 'c1', parentId: 'p', status: 'done' }),
						task({ id: 'c2', parentId: 'p', status: 'not_applicable' }),
					],
					progress: { done: 1, total: 1 },
				}),
			];

			await store.toggleDone('p');

			expect(store.findTask('p')?.status).toBe('pending');
			expect(store.findTask('c1')?.status).toBe('pending');
			expect(store.findTask('c2')?.status).toBe('not_applicable');
		});

		it('al marcar el último hijo activo, el padre se marca solo', async () => {
			mockApi.preRetreatTaskApi.setStatus.mockResolvedValue({});
			store.tasks = [
				task({
					id: 'p',
					status: 'pending',
					children: [
						task({ id: 'c1', parentId: 'p', status: 'done' }),
						task({ id: 'c2', parentId: 'p', status: 'pending' }),
						task({ id: 'c3', parentId: 'p', status: 'not_applicable' }),
					],
					progress: { done: 1, total: 2 },
				}),
			];

			await store.toggleDone('c2'); // el último activo pendiente

			expect(store.findTask('c2')?.status).toBe('done');
			expect(store.findTask('p')?.status).toBe('done'); // se marcó solo
			expect(store.findTask('p')?.progress).toEqual({ done: 2, total: 2 });
		});

		it('al desmarcar un hijo, el padre vuelve a pendiente', async () => {
			mockApi.preRetreatTaskApi.setStatus.mockResolvedValue({});
			store.tasks = [
				task({
					id: 'p',
					status: 'done',
					children: [
						task({ id: 'c1', parentId: 'p', status: 'done' }),
						task({ id: 'c2', parentId: 'p', status: 'done' }),
					],
					progress: { done: 2, total: 2 },
				}),
			];

			await store.toggleDone('c1');

			expect(store.findTask('c1')?.status).toBe('pending');
			expect(store.findTask('p')?.status).toBe('pending');
		});

		it('no toca una tarea N/A', async () => {
			store.tasks = [task({ id: 'x', status: 'not_applicable' })];
			await store.toggleDone('x');
			expect(store.findTask('x')?.status).toBe('not_applicable');
			expect(mockApi.preRetreatTaskApi.setStatus).not.toHaveBeenCalled();
		});
	});

	describe('fetch / materialize', () => {
		it('fetchForRetreat llena tasks', async () => {
			mockApi.preRetreatTaskApi.list.mockResolvedValue([task({ id: 'x' })]);
			await store.fetchForRetreat('retreat-1');
			expect(store.tasks).toHaveLength(1);
			expect(mockApi.preRetreatTaskApi.list).toHaveBeenCalledWith('retreat-1');
		});

		it('materialize reemplaza tasks con la respuesta', async () => {
			mockApi.preRetreatTaskApi.materialize.mockResolvedValue([task({ id: 'm1' }), task({ id: 'm2' })]);
			await store.materialize('retreat-1', { clearExisting: true });
			expect(store.tasks).toHaveLength(2);
		});

		it('addMissing devuelve el resumen y recarga', async () => {
			mockApi.preRetreatTaskApi.addMissing.mockResolvedValue({ added: 3, skipped: 2, total: 5 });
			mockApi.preRetreatTaskApi.list.mockResolvedValue([]);
			const r = await store.addMissing('retreat-1');
			expect(r.added).toBe(3);
			expect(mockApi.preRetreatTaskApi.list).toHaveBeenCalled();
		});
	});
});
