import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { SavedSegmentService } from '@/services/savedSegmentService';
import { Retreat } from '@/entities/retreat.entity';

/**
 * Integración del CRUD de segmentos guardados. Valida la entidad SavedSegment
 * (schema sincronizado), el round-trip de `filters` como JSON, y el filtrado
 * por scope retiro.
 */
describe('SavedSegmentService', () => {
	let service: SavedSegmentService;
	let retreat: Retreat;

	beforeAll(async () => {
		await setupTestDatabase();
		service = new SavedSegmentService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		retreat = await TestDataFactory.createTestRetreat();
	});

	it('crea y lista segmentos por retiro (filters round-trip como JSON)', async () => {
		await service.create({
			name: 'Walkers con pago pendiente',
			scope: 'retreat',
			retreatId: retreat.id,
			filters: { participantType: 'walker', paymentStatus: 'unpaid' },
		});

		const list = await service.findByRetreat(retreat.id);
		expect(list).toHaveLength(1);
		expect(list[0].name).toBe('Walkers con pago pendiente');
		expect(list[0].scope).toBe('retreat');
		expect(list[0].filters).toEqual({ participantType: 'walker', paymentStatus: 'unpaid' });
	});

	it('actualiza nombre y filtros', async () => {
		const seg = await service.create({
			name: 'Inicial',
			scope: 'retreat',
			retreatId: retreat.id,
			filters: {},
		});
		const updated = await service.update(seg.id, {
			name: 'Renombrado',
			filters: { tagIds: ['tag-1', 'tag-2'] },
		});
		expect(updated?.name).toBe('Renombrado');
		expect(updated?.filters.tagIds).toEqual(['tag-1', 'tag-2']);
	});

	it('elimina un segmento', async () => {
		const seg = await service.create({
			name: 'Temporal',
			scope: 'retreat',
			retreatId: retreat.id,
			filters: {},
		});
		expect(await service.delete(seg.id)).toBe(true);
		expect(await service.findByRetreat(retreat.id)).toHaveLength(0);
	});

	it('no mezcla segmentos entre retiros', async () => {
		const other = await TestDataFactory.createTestRetreat();
		await service.create({ name: 'A', scope: 'retreat', retreatId: retreat.id, filters: {} });
		await service.create({ name: 'B', scope: 'retreat', retreatId: other.id, filters: {} });

		expect(await service.findByRetreat(retreat.id)).toHaveLength(1);
		expect((await service.findByRetreat(retreat.id))[0].name).toBe('A');
	});

	describe('evaluateFilters (segmento dinámico)', () => {
		beforeEach(async () => {
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				firstName: 'Juan',
				email: 'juan@example.com',
			} as any);
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				firstName: 'Pedro',
				email: 'pedro@example.com',
			} as any);
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'server',
				firstName: 'Ana',
				email: 'ana@example.com',
			} as any);
		});

		it('filtro vacío devuelve todos los participantes activos del retiro', async () => {
			const result = await service.evaluateFilters(retreat.id, {});
			expect(result).toHaveLength(3);
		});

		it('filtra por tipo de participante (audiencia dinámica)', async () => {
			const walkers = await service.evaluateFilters(retreat.id, { participantType: 'walker' });
			expect(walkers).toHaveLength(2);
			const servers = await service.evaluateFilters(retreat.id, { participantType: 'server' });
			expect(servers).toHaveLength(1);
			expect(servers[0].firstName).toBe('Ana');
		});

		it('filtra por búsqueda de nombre', async () => {
			const result = await service.evaluateFilters(retreat.id, { search: 'juan' });
			expect(result).toHaveLength(1);
			expect(result[0].firstName).toBe('Juan');
		});
	});
});
