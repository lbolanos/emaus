/**
 * Test de la hidratación de {participant.letterMailbox} (specs/letters-email):
 * hydrateParticipantRetreatContext expone la dirección completa del buzón solo
 * cuando hay código generado Y el buzón está habilitado; sin fila (o con buzón
 * apagado) queda null, para que el placeholder no prometa un correo que rebota.
 *
 * TypeORM real vía testDataSource (el patrón de letterMailboxService.simple).
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { hydrateParticipantRetreatContext } from '@/services/participantRetreatHydration';

const getDS = () => (TestDataFactory as any)['testDataSource'];

describe('hydrateParticipantRetreatContext — letterMailbox', () => {
	let retreat: any;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		retreat = await TestDataFactory.createTestRetreat();
	});

	const makeCase = async (opts: { mailboxCode?: string | null; mailboxEnabled?: boolean }) => {
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
		} as any);
		const rpRepo = getDS().getRepository(RetreatParticipant);
		const rp = await rpRepo.findOne({ where: { participantId: participant.id } });
		await rpRepo.update(rp!.id, {
			mailboxCode: opts.mailboxCode ?? null,
			mailboxEnabled: opts.mailboxEnabled ?? false,
		});
		return participant;
	};

	it('con código y habilitado → dirección completa carta.{CODE}@dominio', async () => {
		const participant = await makeCase({ mailboxCode: 'AB23CD45', mailboxEnabled: true });
		await hydrateParticipantRetreatContext(participant, retreat.id);
		expect(participant.letterMailbox).toBe('carta.AB23CD45@emaus.cc');
	});

	it('con código pero DESHABILITADO → null (el email rebotaría)', async () => {
		const participant = await makeCase({ mailboxCode: 'AB23CD45', mailboxEnabled: false });
		await hydrateParticipantRetreatContext(participant, retreat.id);
		expect(participant.letterMailbox).toBeNull();
	});

	it('sin código (buzones sin activar) → null', async () => {
		const participant = await makeCase({});
		await hydrateParticipantRetreatContext(participant, retreat.id);
		expect(participant.letterMailbox).toBeNull();
	});

	it('participante sin fila en el retiro consultado → null (no filtra de otro retiro)', async () => {
		const participant = await makeCase({ mailboxCode: 'AB23CD45', mailboxEnabled: true });
		await hydrateParticipantRetreatContext(participant, 'otro-retiro-id');
		expect(participant.letterMailbox).toBeNull();
	});
});
