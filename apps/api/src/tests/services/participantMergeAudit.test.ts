import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import {
	mergeParticipants,
	ParticipantMergeError,
} from '@/services/participantMergeService';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { ParticipantNote } from '@/entities/participantNote.entity';
import { auditContext } from '@/utils/auditContext';

// El merge de duplicados es la operación más destructiva del módulo de
// participantes (SQL crudo en transacción) y corría sin dejar rastro: la única
// evidencia era el mergedIntoParticipantId de la fila absorbida. Ahora deja
// participant.merge con el detalle de qué se movió.
describe('participantMergeService — auditoría de dominio', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const auditRepo = () => AppDataSource.getRepository(DomainAuditLog);

	async function waitForLogs(
		predicate: (rows: DomainAuditLog[]) => boolean,
		tries = 60,
		delayMs = 5,
	): Promise<DomainAuditLog[]> {
		let rows = await auditRepo().find();
		for (let i = 0; i < tries && !predicate(rows); i++) {
			await new Promise((r) => setTimeout(r, delayMs));
			rows = await auditRepo().find();
		}
		return rows;
	}

	const rowsOf = (rows: DomainAuditLog[], action: string) => rows.filter((r) => r.action === action);
	const meta = (row: DomainAuditLog) => JSON.parse(row.metadata ?? '{}');

	async function seedNote(participantId: string, body: string) {
		const repo = AppDataSource.getRepository(ParticipantNote);
		return repo.save(
			repo.create({
				participantId,
				scope: 'retreat',
				kind: 'note',
				body,
			}),
		);
	}

	it('merge exitoso deja participant.merge con el absorbido como recurso y el detalle en metadata', async () => {
		const retreatA = await TestDataFactory.createTestRetreat();
		const retreatB = await TestDataFactory.createTestRetreat();
		const keep = await TestDataFactory.createTestParticipant(retreatA.id, {
			type: 'walker',
			email: 'keep-audit@example.com',
		} as any);
		const absorbed = await TestDataFactory.createTestParticipant(retreatB.id, {
			type: 'walker',
			email: 'absorbed-audit@example.com',
		} as any);
		// Notas en ambos: el hilo del absorbido se reapunta, el de keep ya está.
		await seedNote(absorbed.id, 'Nota del absorbido');

		await auditContext.run({ userId: 'actor-merge', ip: '10.0.0.9' }, async () => {
			await mergeParticipants(keep.id, absorbed.id);
		});

		const rows = await waitForLogs((r) => rowsOf(r, 'participant.merge').length > 0);
		const row = rowsOf(rows, 'participant.merge')[0];
		expect(row.resourceType).toBe('participant');
		expect(row.resourceId).toBe(absorbed.id);
		// El retreatId del log es el del ABSORBIDO (capturado antes de que la
		// fusión lo ponga en NULL): ancla el evento al retiro que lo perdió.
		expect(row.retreatId).toBe(retreatB.id);
		expect(row.actorUserId).toBe('actor-merge');
		expect(row.ipAddress).toBe('10.0.0.9');
		expect(JSON.parse(row.oldValues!)).toEqual({
			mergedIntoParticipantId: null,
			retreatId: retreatB.id,
		});
		expect(JSON.parse(row.newValues!)).toEqual({
			mergedIntoParticipantId: keep.id,
			retreatId: null,
		});
		expect(meta(row).keepId).toBe(keep.id);
		// El detalle de la fusión: qué tablas se movieron y cuántas filas.
		const noteMove = meta(row).moves.find((m: any) => m.table === 'participant_notes');
		expect(noteMove).toMatchObject({ rows: 1, discarded: 0 });
	});

	it('merge bloqueado (dos inscripciones activas en el mismo retiro) no deja fila', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const keep = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: 'keep-block@example.com',
		} as any);
		const merge = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: 'merge-block@example.com',
		} as any);

		await expect(mergeParticipants(keep.id, merge.id)).rejects.toBeInstanceOf(
			ParticipantMergeError,
		);
		await new Promise((r) => setTimeout(r, 50));
		expect(rowsOf(await auditRepo().find(), 'participant.merge')).toHaveLength(0);
	});
});
