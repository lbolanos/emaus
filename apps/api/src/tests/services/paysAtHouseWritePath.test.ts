import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { updateParticipant } from '@/services/participantService';
import { Participant } from '@/entities/participant.entity';

/**
 * Camino de escritura de la marca "paga en la casa de retiro"
 * (specs/pays-at-house). El toggle viaja por PUT /participants/:id como
 * `paysAtHouse` + `contextRetreatId`, y aterriza en la fila de
 * retreat_participants del retiro de contexto — mismo camino que la beca.
 */
describe('pays-at-house: camino de escritura', () => {
	let retreatId: string;
	let participantId: string;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		// Cobro > 0 para que la marca derive a pays_at_house (saldo pendiente).
		const retreat = await TestDataFactory.createTestRetreat({ cost: '1500' } as any);
		retreatId = retreat.id;
		const p = await TestDataFactory.createTestParticipant(retreatId, { type: 'walker' } as any);
		participantId = p.id;
	});

	const readRow = (rId: string = retreatId) =>
		AppDataSource.getRepository(RetreatParticipant).findOne({
			where: { participantId, retreatId: rId },
		});

	/** Ficha tal como la hidrata el listado (campos per-retiro aplanados). */
	const fromList = async () => {
		const p = await AppDataSource.getRepository(Participant).findOne({
			where: { id: participantId },
		});
		const rp = await readRow();
		return { ...p, paysAtHouse: rp?.paysAtHouse ?? false, isScholarship: rp?.isScholarship ?? false } as any;
	};

	it('paysAtHouse=true escribe la fila del retiro de contexto y el retorno lo refleja', async () => {
		const updated = await updateParticipant(participantId, {
			...(await fromList()),
			paysAtHouse: true,
			contextRetreatId: retreatId,
		} as any);

		const row = await readRow();
		expect(row?.paysAtHouse).toBe(true);
		// El virtual del retorno ya lleva el valor nuevo (lo que la UI muestra
		// tras guardar, sin re-fetch).
		expect((updated as any)?.paysAtHouse).toBe(true);
	});

	it('paysAtHouse=false persiste el desmarcado', async () => {
		await AppDataSource.getRepository(RetreatParticipant).update(
			{ participantId, retreatId },
			{ paysAtHouse: true },
		);

		await updateParticipant(participantId, {
			...(await fromList()),
			paysAtHouse: false,
			contextRetreatId: retreatId,
		} as any);

		const row = await readRow();
		expect(row?.paysAtHouse).toBe(false);
	});

	it('un guardado que no incluye el campo NO borra la marca (payload legacy)', async () => {
		await AppDataSource.getRepository(RetreatParticipant).update(
			{ participantId, retreatId },
			{ paysAtHouse: true },
		);
		const ficha = await fromList();
		delete ficha.paysAtHouse;

		await updateParticipant(participantId, { ...ficha, cellPhone: '5551112233' } as any);

		const row = await readRow();
		expect(row?.paysAtHouse).toBe(true);
	});

	it('marcar la beca limpia la marca (D4: higiene espejo de scholarshipAmount)', async () => {
		await AppDataSource.getRepository(RetreatParticipant).update(
			{ participantId, retreatId },
			{ paysAtHouse: true },
		);

		await updateParticipant(participantId, {
			...(await fromList()),
			isScholarship: true,
			contextRetreatId: retreatId,
		} as any);

		const row = await readRow();
		expect(row?.isScholarship).toBe(true);
		// El becado queda exento de todo: el compromiso de pagar en la casa
		// carece de sentido y se limpia en el mismo guardado.
		expect(row?.paysAtHouse).toBe(false);
	});

	it('con contextRetreatId de OTRO retiro, escribe esa fila y no la del primario', async () => {
		const retreatB = await TestDataFactory.createTestRetreat({ cost: '999' } as any);
		await AppDataSource.getRepository(RetreatParticipant).save(
			AppDataSource.getRepository(RetreatParticipant).create({
				participantId,
				retreatId: retreatB.id,
				roleInRetreat: 'walker',
				type: 'walker',
				isCancelled: false,
				isPrimaryRetreat: false,
			}),
		);

		await updateParticipant(participantId, {
			...(await fromList()),
			paysAtHouse: true,
			contextRetreatId: retreatB.id,
		} as any);

		expect((await readRow(retreatB.id))?.paysAtHouse).toBe(true);
		// La fila del retiro primario queda intacta.
		expect((await readRow())?.paysAtHouse).toBe(false);
	});
});
