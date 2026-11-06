/**
 * Integration test del servicio de buzones de cartas (specs/letters-email T6).
 *
 * Cubre: alfabeto del código, activación idempotente que respeta isCancelled/
 * dataDeletedAt/waiting, resolveMailbox (case-insensitive, dominio y prefijo
 * exactos, disabled vs unknown) y el toggle setMailboxEnabled (genera código
 * si no tiene).
 *
 * TypeORM real vía testDataSource; los servicios usan AppDataSource en tiempo
 * de llamada, así que el swap de test-setup aplica.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { Participant } from '@/entities/participant.entity';
import {
	activateMailboxesForRetreat,
	generateMailboxCode,
	resolveMailbox,
	setMailboxEnabled,
	buildMailboxAddress,
	MAILBOX_ELIGIBLE_TYPES,
} from '@/services/letterMailboxService';

const getDS = () => (TestDataFactory as any)['testDataSource'];
const VALID_ALPHABET = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/;

describe('letterMailboxService (integration)', () => {
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

	describe('generateMailboxCode', () => {
		it('produce códigos de 8 caracteres del alfabeto sin ambiguos', () => {
			for (let i = 0; i < 50; i++) {
				expect(generateMailboxCode()).toMatch(VALID_ALPHABET);
			}
		});

		it('produce códigos distintos en tiradas largas', () => {
			const codes = new Set(Array.from({ length: 100 }, () => generateMailboxCode()));
			expect(codes.size).toBeGreaterThan(90);
		});
	});

	describe('activateMailboxesForRetreat', () => {
		it('genera código y habilita a los elegibles; ignora cancelados, borrados y waiting', async () => {
			const walker = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' });
			const server = await TestDataFactory.createTestParticipant(retreat.id, { type: 'server' });
			const angelito = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'partial_server',
			});
			const cancelled = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				isCancelled: true,
			} as any);
			const waiting = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'waiting',
			} as any);
			// Borrado lógico: dataDeletedAt en el Participant global.
			const deleted = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' });
			await getDS()
				.getRepository(Participant)
				.update(deleted.id, { dataDeletedAt: new Date() });

			const result = await activateMailboxesForRetreat(retreat.id);
			expect(result.activated).toBe(3);
			expect(result.alreadyActive).toBe(0);

			const rpRepo = getDS().getRepository(RetreatParticipant);
			for (const participant of [walker, server, angelito]) {
				const rp = await rpRepo.findOne({ where: { participantId: participant.id } });
				expect(rp?.mailboxCode).toMatch(VALID_ALPHABET);
				expect(rp?.mailboxEnabled).toBe(true);
				expect(rp?.mailboxIssuedAt).toBeTruthy();
			}
			for (const participant of [cancelled, waiting, deleted]) {
				const rp = await rpRepo.findOne({ where: { participantId: participant.id } });
				expect(rp?.mailboxCode).toBeNull();
				expect(rp?.mailboxEnabled).toBe(false);
			}
		});

		it('es idempotente: segunda corrida no genera ni rota códigos ni re-habilita toggles', async () => {
			const walker = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' });
			await activateMailboxesForRetreat(retreat.id);

			const rpRepo = getDS().getRepository(RetreatParticipant);
			const rp = await rpRepo.findOne({ where: { participantId: walker.id } });
			const originalCode = rp!.mailboxCode;
			rp!.mailboxEnabled = false; // el coordinador lo apagó a mano
			await rpRepo.save(rp!);

			const second = await activateMailboxesForRetreat(retreat.id);
			expect(second).toEqual({ activated: 0, alreadyActive: 1 });

			const after = await rpRepo.findOne({ where: { participantId: walker.id } });
			expect(after!.mailboxCode).toBe(originalCode);
			expect(after!.mailboxEnabled).toBe(false);
		});
	});

	describe('resolveMailbox', () => {
		it('resuelve carta.{CODE}@emaus.cc case-insensitive → retreatParticipant', async () => {
			const walker = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' });
			await activateMailboxesForRetreat(retreat.id);
			const rp = await getDS()
				.getRepository(RetreatParticipant)
				.findOne({ where: { participantId: walker.id } });

			const resolution = await resolveMailbox(`CARTA.${rp!.mailboxCode!.toLowerCase()}@EMAUS.CC`);
			expect(resolution.status).toBe('ok');
			if (resolution.status === 'ok') {
				expect(resolution.retreatParticipant.id).toBe(rp!.id);
			}
		});

		it('rechaza dominio ajeno, prefijo ajeno y códigos inexistentes (unknown)', async () => {
			await expect(resolveMailbox('carta.AB23CD45@otro-dominio.com')).resolves.toEqual({
				status: 'unknown',
			});
			await expect(resolveMailbox('hola.AB23CD45@emaus.cc')).resolves.toEqual({ status: 'unknown' });
			await expect(resolveMailbox('carta.ZZ99ZZ99@emaus.cc')).resolves.toEqual({
				status: 'unknown',
			});
			await expect(resolveMailbox('sin-arroba')).resolves.toEqual({ status: 'unknown' });
		});

		it('distingue mailbox_disabled de unknown', async () => {
			const walker = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' });
			await activateMailboxesForRetreat(retreat.id);
			const rpRepo = getDS().getRepository(RetreatParticipant);
			const rp = await rpRepo.findOne({ where: { participantId: walker.id } });
			rp!.mailboxEnabled = false;
			await rpRepo.save(rp!);

			await expect(resolveMailbox(buildMailboxAddress(rp!.mailboxCode!))).resolves.toEqual({
				status: 'disabled',
			});
		});
	});

	describe('setMailboxEnabled', () => {
		it('genera código al habilitar un participante sin buzón', async () => {
			const walker = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
			} as any);
			// Sin activación previa: sin código.
			const rpRepo = getDS().getRepository(RetreatParticipant);
			const rp = await rpRepo.findOne({ where: { participantId: walker.id } });
			expect(rp!.mailboxCode).toBeNull();

			const updated = await setMailboxEnabled(retreat.id, rp!.id, true);
			expect(updated.mailboxCode).toMatch(VALID_ALPHABET);
			expect(updated.mailboxEnabled).toBe(true);
			expect(updated.mailboxIssuedAt).toBeTruthy();
		});

		it('falla con 404-mapeable cuando el retreatParticipant no es del retiro', async () => {
			const otherRetreat = await TestDataFactory.createTestRetreat();
			const walker = await TestDataFactory.createTestParticipant(otherRetreat.id, {
				type: 'walker',
			} as any);
			const rp = await getDS()
				.getRepository(RetreatParticipant)
				.findOne({ where: { participantId: walker.id } });
			await expect(setMailboxEnabled(retreat.id, rp!.id, true)).rejects.toThrow(
				'RetreatParticipant not found',
			);
		});
	});

	it('los tipos elegibles son walker/server/partial_server (D1)', () => {
		expect(MAILBOX_ELIGIBLE_TYPES).toEqual(['walker', 'server', 'partial_server']);
	});
});
