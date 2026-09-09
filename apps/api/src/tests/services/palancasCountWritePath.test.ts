import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { updateParticipant } from '@/services/participantService';
import { Participant } from '@/entities/participant.entity';

/**
 * Camino de escritura del conteo de cartas.
 *
 * El caso que motiva el archivo: el formulario reenvía el participante COMPLETO,
 * y el listado hidrata `palancasReceivedCount = null` explícito en toda ficha
 * cuyo conteo no se pudo derivar. Si ese `null` se tratara como "poner a null",
 * cualquier guardado ajeno (corregir un teléfono) borraría el texto de palancas
 * — justo lo que el backfill de la migración se cuidó de conservar.
 */
describe('palancas: camino de escritura del conteo', () => {
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
		const retreat = await TestDataFactory.createTestRetreat();
		retreatId = retreat.id;
		const p = await TestDataFactory.createTestParticipant(retreatId, { type: 'walker' } as any);
		participantId = p.id;
	});

	const setRow = async (palancasReceived: string | null, palancasReceivedCount: number | null) =>
		AppDataSource.getRepository(RetreatParticipant).update(
			{ participantId, retreatId },
			{ palancasReceived, palancasReceivedCount },
		);

	const readRow = async () =>
		AppDataSource.getRepository(RetreatParticipant).findOne({
			where: { participantId, retreatId },
		});

	/**
	 * Lo que el formulario tiene en la mano: la ficha con los campos per-retiro
	 * ya hidratados, tal como los deja `findAllParticipants`.
	 *
	 * No se llama al servicio real porque `findAllParticipants` usa
	 * `createQueryBuilder` y revienta bajo ts-jest («Class constructor
	 * Participant cannot be invoked without 'new'») — limitación preexistente del
	 * entorno de test. Lo que importa aquí es la FORMA del payload, y en
	 * particular que `palancasReceivedCount` viaje como `null` EXPLÍCITO: eso es
	 * lo que hace `participantService.ts` al hidratar
	 * (`if (h.palancasReceivedCount !== undefined) p.palancasReceivedCount = ...`,
	 * y una columna NULL sí es `!== undefined`).
	 */
	const fromList = async () => {
		const p = await AppDataSource.getRepository(Participant).findOne({
			where: { id: participantId },
		});
		const rp = await readRow();
		return {
			...p,
			palancasReceived: rp?.palancasReceived ?? null,
			palancasReceivedCount: rp?.palancasReceivedCount ?? null,
		} as any;
	};

	it('un guardado que no toca palancas NO borra el texto en prosa', async () => {
		await setRow('3 cartas de su mamá y su hermana', null);

		const ficha = await fromList();
		// El listado manda el null explícito: eso es lo que dispara el bug.
		expect(ficha.palancasReceivedCount).toBeNull();

		await updateParticipant(participantId, { ...ficha, cellPhone: '5551112233' } as any);

		const row = await readRow();
		expect(row?.palancasReceived).toBe('3 cartas de su mamá y su hermana');
		expect(row?.palancasReceivedCount).toBeNull();
	});

	it('un guardado que no toca palancas conserva un conteo ya capturado', async () => {
		await setRow('4', 4);
		const ficha = await fromList();
		await updateParticipant(participantId, { ...ficha, cellPhone: '5551112233' } as any);

		const row = await readRow();
		expect(row?.palancasReceivedCount).toBe(4);
		expect(row?.palancasReceived).toBe('4');
	});

	it('capturar un número lo guarda y deja el texto en espejo', async () => {
		await setRow('tres de su tía', null);
		const ficha = await fromList();

		await updateParticipant(participantId, { ...ficha, palancasReceivedCount: 3 } as any);

		const row = await readRow();
		expect(row?.palancasReceivedCount).toBe(3);
		// El espejo permite que la columna heredada siga sirviendo a la lista y
		// a las exportaciones.
		expect(row?.palancasReceived).toBe('3');
	});

	it('un cero explícito se guarda: "no ha recibido" es un dato', async () => {
		const ficha = await fromList();
		await updateParticipant(participantId, { ...ficha, palancasReceivedCount: 0 } as any);

		const row = await readRow();
		expect(row?.palancasReceivedCount).toBe(0);
		expect(row?.palancasReceived).toBe('0');
	});

	it('si sólo llega el texto (importación, cliente viejo), se deriva el conteo', async () => {
		const ficha = await fromList();
		delete ficha.palancasReceivedCount;

		await updateParticipant(participantId, { ...ficha, palancasReceived: '5' } as any);

		const row = await readRow();
		expect(row?.palancasReceived).toBe('5');
		expect(row?.palancasReceivedCount).toBe(5);
	});

	it('texto en prosa: se conserva y el conteo queda sin capturar', async () => {
		const ficha = await fromList();
		delete ficha.palancasReceivedCount;

		await updateParticipant(participantId, {
			...ficha,
			palancasReceived: '3 de la mamá',
		} as any);

		const row = await readRow();
		expect(row?.palancasReceived).toBe('3 de la mamá');
		// No se adivina el 3.
		expect(row?.palancasReceivedCount).toBeNull();
	});
});
