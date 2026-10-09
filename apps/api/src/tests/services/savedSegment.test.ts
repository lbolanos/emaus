import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { SavedSegmentService } from '@/services/savedSegmentService';
import { Retreat } from '@/entities/retreat.entity';
import { AppDataSource } from '@/data-source';
import { Payment } from '@/entities/payment.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { Participant } from '@/entities/participant.entity';

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

	/**
	 * Regresión #32 (incidente Buen Despacho 2026-10): `paymentStatus` calculado
	 * con dos criterios contradictorios. El motor de secuencias evalúa la
	 * condición del paso con evaluateFilters, que cargaba `participant.payments`
	 * SIN scope de retiro: un repetidor que pagó su retiro anterior aparecía
	 * partial/overpaid para el motor y "Sin pagar" en la lista
	 * (findAllParticipants scopea en el JOIN) → el paso saltaba con
	 * "no cumple la condición del paso". El dinero ahora se scopea al retiro,
	 * mismo criterio que la lista y que hydrateParticipantRetreatContext.
	 */
	describe('paymentStatus scopea el dinero al retiro evaluado (#32)', () => {
		// Retiro A (el evaluado): cobro caminante $3100, servidor $2400.
		// Retiro B: un retiro ANTERIOR del mismo participante, cobro $2100.
		let retreatA: Retreat;
		let retreatB: Retreat;
		let treasurerId: string;

		beforeEach(async () => {
			retreatA = await TestDataFactory.createTestRetreat({ cost: '3100', serverFeeAmount: 2400 });
			retreatB = await TestDataFactory.createTestRetreat({ cost: '2100' });
			treasurerId = (await TestDataFactory.createTestUser()).id;
		});

		/** Pago directo (la factory no tiene helper de payments). */
		async function addPayment(participantId: string, retreatId: string, amount: number) {
			const repo = AppDataSource.getRepository(Payment);
			await repo.save(
				repo.create({
					participantId,
					retreatId,
					amount,
					paymentDate: new Date(),
					paymentMethod: 'cash',
					recordedBy: treasurerId,
				}),
			);
		}

		/** Inscribe al mismo participante en su segundo retiro (rp manual). */
		async function enrollIn(participantId: string, retreatId: string, type: 'walker' | 'server') {
			const repo = AppDataSource.getRepository(RetreatParticipant);
			await repo.save(
				repo.create({
					participantId,
					retreatId,
					roleInRetreat: type === 'server' ? 'server' : 'walker',
					type,
					isCancelled: false,
					isPrimaryRetreat: false,
				}),
			);
		}

		it('un pago de OTRO retiro no saca al participante del filtro unpaid', async () => {
			// Pablo: servidor en A sin pagos; pagó $2100 su retiro anterior (B).
			const pablo = (await TestDataFactory.createTestParticipant(retreatA.id, {
				type: 'server',
				firstName: 'Pablo',
				email: 'pablo@example.com',
			} as any)) as Participant;
			await enrollIn(pablo.id, retreatB.id, 'walker');
			await addPayment(pablo.id, retreatB.id, 2100);

			// Sin el scope, el motor sumaba los $2100 de B → 'partial' (2100 < 2400)
			// y el recordatorio de pago lo saltaba con "no cumple la condición".
			const unpaid = await service.evaluateFilters(retreatA.id, { paymentStatus: 'unpaid' });
			expect(unpaid.map((p) => p.email)).toContain('pablo@example.com');
		});

		it('un sobrepago de otro retiro tampoco disfraza el estado', async () => {
			const maria = (await TestDataFactory.createTestParticipant(retreatA.id, {
				type: 'server',
				firstName: 'María',
				email: 'maria@example.com',
			} as any)) as Participant;
			await enrollIn(maria.id, retreatB.id, 'walker');
			await addPayment(maria.id, retreatB.id, 5000); // overpaid en B, $0 en A

			const unpaid = await service.evaluateFilters(retreatA.id, { paymentStatus: 'unpaid' });
			expect(unpaid.map((p) => p.email)).toContain('maria@example.com');
		});

		it('quien pagó ESTE retiro sigue fuera del filtro unpaid', async () => {
			const ana = (await TestDataFactory.createTestParticipant(retreatA.id, {
				type: 'server',
				firstName: 'Ana',
				email: 'ana-pagada@example.com',
			} as any)) as Participant;
			await addPayment(ana.id, retreatA.id, 2400); // exacto al serverFee → paid

			const unpaid = await service.evaluateFilters(retreatA.id, { paymentStatus: 'unpaid' });
			expect(unpaid.map((p) => p.email)).not.toContain('ana-pagada@example.com');
		});

		it('becado del retiro (overlay rp.isScholarship) evalúa scholarship, no unpaid', async () => {
			const luis = (await TestDataFactory.createTestParticipant(retreatA.id, {
				type: 'server',
				firstName: 'Luis',
				email: 'luis@example.com',
			} as any)) as Participant;
			await AppDataSource.getRepository(RetreatParticipant).update(
				{ participantId: luis.id, retreatId: retreatA.id },
				{ isScholarship: true },
			);

			const unpaid = await service.evaluateFilters(retreatA.id, { paymentStatus: 'unpaid' });
			expect(unpaid.map((p) => p.email)).not.toContain('luis@example.com');
		});

		/**
		 * 'owing' = saldo pendiente > 0 (unpaid + partial), para condiciones de
		 * recordatorio de pago: una condición 'unpaid' se salta a quien abonó
		 * parcial (incidente Buen Despacho: Jaime Abel $2000 y Nicolás $1000
		 * no recibían el recordatorio). No es un estado del getter.
		 */
		describe('owing: todos los que deban', () => {
			it('incluye al unpaid total y al que abonó parcial de ESTE retiro', async () => {
				// Unpaid total: servidor $0 contra serverFee 2400.
				const cero = (await TestDataFactory.createTestParticipant(retreatA.id, {
					type: 'server',
					firstName: 'Cero',
					email: 'cero@example.com',
				} as any)) as Participant;
				// Parcial: abonó 2000 de 2400 → debe 400.
				const parcial = (await TestDataFactory.createTestParticipant(retreatA.id, {
					type: 'server',
					firstName: 'Parcial',
					email: 'parcial@example.com',
				} as any)) as Participant;
				await addPayment(parcial.id, retreatA.id, 2000);

				const owing = await service.evaluateFilters(retreatA.id, { paymentStatus: 'owing' });
				const emails = owing.map((p) => p.email);
				expect(emails).toContain('cero@example.com');
				expect(emails).toContain('parcial@example.com');
			});

			it('excluye a paid, overpaid, becado y a quien solo pagó OTRO retiro', async () => {
				const pagado = (await TestDataFactory.createTestParticipant(retreatA.id, {
					type: 'server',
					firstName: 'Pagado',
					email: 'pagado@example.com',
				} as any)) as Participant;
				await addPayment(pagado.id, retreatA.id, 2400);

				const sobrepagado = (await TestDataFactory.createTestParticipant(retreatA.id, {
					type: 'server',
					firstName: 'Sobra',
					email: 'sobra@example.com',
				} as any)) as Participant;
				await addPayment(sobrepagado.id, retreatA.id, 3000);

				const becado = (await TestDataFactory.createTestParticipant(retreatA.id, {
					type: 'server',
					firstName: 'Becado',
					email: 'becado@example.com',
				} as any)) as Participant;
				await AppDataSource.getRepository(RetreatParticipant).update(
					{ participantId: becado.id, retreatId: retreatA.id },
					{ isScholarship: true },
				);

				const foraneo = (await TestDataFactory.createTestParticipant(retreatA.id, {
					type: 'server',
					firstName: 'Foraneo',
					email: 'foraneo@example.com',
				} as any)) as Participant;
				await enrollIn(foraneo.id, retreatB.id, 'walker');
				await addPayment(foraneo.id, retreatB.id, 2100); // pago completo, pero de B

				const owing = await service.evaluateFilters(retreatA.id, { paymentStatus: 'owing' });
				const emails = owing.map((p) => p.email);
				expect(emails).not.toContain('pagado@example.com');
				expect(emails).not.toContain('sobra@example.com');
				expect(emails).not.toContain('becado@example.com');
				// Sin el scope por retiro, el pago de B taparía su deuda de A.
				expect(emails).toContain('foraneo@example.com');
			});
		});
	});
});
