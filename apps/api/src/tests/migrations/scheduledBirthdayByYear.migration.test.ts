import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { MessageSequence } from '@/entities/messageSequence.entity';
import { SequenceStep } from '@/entities/sequenceStep.entity';
import { ScheduledMessage } from '@/entities/scheduledMessage.entity';
import type { QueryRunner } from 'typeorm';

/**
 * Seed-and-verify de la migración que cambia la UQ de scheduled_messages de
 * (stepId, participantId) a (stepId, participantId, occurrenceYear) (#1):
 * birthday dispara una vez por AÑO, el resto una vez en la vida.
 *
 * La DB de test sincroniza desde las entities (esquema YA nuevo), así que el
 * flujo es sembrar → down() (esquema viejo) → up() (esquema nuevo) y afirmar:
 *  - las filas sobreviven al roundtrip (la tabla es hoja, sin FKs entrantes);
 *  - el backfill deriva occurrenceYear por trigger (año del scheduledFor para
 *    birthday, 0 para el resto) — NO copia el valor basura sembrado;
 *  - la UQ nueva rechaza el duplicado del mismo año y admite el año siguiente;
 *  - up() es re-ejecutable (reinicio del API a mitad de corrida).
 *
 * Tras el down() la entity mapea una columna inexistente: las verificaciones
 * de ese tramo van por SQL crudo, nunca por el repositorio.
 */
describe('ScheduledBirthdayByYear20260912160000 — recreate con UQ por año', () => {
	let qr: QueryRunner;
	let migration: { up: (qr: QueryRunner) => Promise<void>; down: (qr: QueryRunner) => Promise<void> };
	let birthdayStepId: string;
	let otherStepId: string;
	let participantId: string;
	let retreatId: string;
	let birthdayRowId: string;
	let otherRowId: string;

	const tableColumns = async () =>
		(await qr.query(`PRAGMA table_info("scheduled_messages")`)) as Array<{
			name: string;
			notnull: number;
			dflt_value: string | null;
		}>;

	beforeAll(async () => {
		await setupTestDatabase();

		// Seed con el esquema nuevo (coincide con las entities): una secuencia
		// birthday y una days_before_retreat, cada una con una fila materializada
		// cuyo occurrenceYear es basura — el up() debe RE-DERIVARLO, no copiarlo.
		const retreat = await TestDataFactory.createTestRetreat({
			startDate: new Date('2026-12-01T00:00:00.000Z'),
			endDate: new Date('2026-12-05T00:00:00.000Z'),
			timezone: 'America/Mexico_City',
		});
		retreatId = retreat.id;
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: 'mig-birthday@example.com',
			birthDate: new Date('1990-05-20T00:00:00.000Z'),
		} as any);
		participantId = participant.id;

		const seqRepo = AppDataSource.getRepository(MessageSequence);
		const stepRepo = AppDataSource.getRepository(SequenceStep);
		const seqBirthday = await seqRepo.save(
			seqRepo.create({
				name: 'Felicitación de cumpleaños',
				retreatId: retreat.id,
				trigger: 'birthday',
				audience: 'walker',
				isActive: true,
			}),
		);
		const stepBirthday = await stepRepo.save(
			stepRepo.create({
				sequenceId: seqBirthday.id,
				stepOrder: 0,
				offsetDays: 0,
				sendHour: 9,
				templateType: 'GENERAL',
				channel: 'whatsapp',
			}),
		);
		const seqOther = await seqRepo.save(
			seqRepo.create({
				name: 'Recordatorio previo',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'walker',
				isActive: true,
			}),
		);
		const stepOther = await stepRepo.save(
			stepRepo.create({
				sequenceId: seqOther.id,
				stepOrder: 0,
				offsetDays: 7,
				sendHour: 9,
				templateType: 'WALKER_WELCOME',
				channel: 'email',
			}),
		);
		birthdayStepId = stepBirthday.id;
		otherStepId = stepOther.id;

		const smRepo = AppDataSource.getRepository(ScheduledMessage);
		const birthdayRow = await smRepo.save(
			smRepo.create({
				sequenceId: seqBirthday.id,
				stepId: stepBirthday.id,
				participantId: participant.id,
				retreatId: retreat.id,
				channel: 'whatsapp',
				templateType: 'GENERAL',
				recipientTarget: 'participant',
				scheduledFor: new Date('2026-05-20T15:00:00.000Z'),
				occurrenceYear: 1999, // basura: el backfill debe derivar 2026
				status: 'sent',
				sentAt: new Date('2026-05-20T15:05:00.000Z'),
			}),
		);
		const otherRow = await smRepo.save(
			smRepo.create({
				sequenceId: seqOther.id,
				stepId: stepOther.id,
				participantId: participant.id,
				retreatId: retreat.id,
				channel: 'email',
				templateType: 'WALKER_WELCOME',
				recipientTarget: 'participant',
				scheduledFor: new Date('2026-11-24T15:00:00.000Z'),
				occurrenceYear: 55, // basura: el backfill debe derivar 0
				status: 'pending',
			}),
		);
		birthdayRowId = birthdayRow.id;
		otherRowId = otherRow.id;

		const mod = await import('@/migrations/sqlite/20260912160000_ScheduledBirthdayByYear');
		migration = new mod.ScheduledBirthdayByYear20260912160000() as any;
		qr = TestDataFactory.getDataSource().createQueryRunner();
	});

	afterAll(async () => {
		await qr.release();
		await teardownTestDatabase();
	});

	it('down(): restaura el esquema viejo (sin occurrenceYear, UQ doble) conservando las filas', async () => {
		await migration.down(qr);

		const cols = await tableColumns();
		expect(cols.map((c) => c.name)).not.toContain('occurrenceYear');

		const count = (await qr.query(`SELECT COUNT(*) AS c FROM "scheduled_messages"`))[0].c;
		expect(count).toBe(2);

		const ddl: Array<{ sql: string }> = await qr.query(
			`SELECT "sql" FROM sqlite_master WHERE type = 'table' AND name = 'scheduled_messages'`,
		);
		expect(ddl[0].sql).toContain('UQ_scheduled_step_participant"');
		expect(ddl[0].sql).not.toContain('_year');
	});

	it('up(): preserva filas, deriva occurrenceYear por trigger y aplica la UQ triple', async () => {
		await migration.up(qr);

		const cols = await tableColumns();
		const yearCol = cols.find((c) => c.name === 'occurrenceYear');
		expect(yearCol).toBeTruthy();
		expect(yearCol!.notnull).toBe(1); // NOT NULL: NULLs distintos romperían la garantía no-birthday
		expect(yearCol!.dflt_value).toBe('0');

		const count = (await qr.query(`SELECT COUNT(*) AS c FROM "scheduled_messages"`))[0].c;
		expect(count).toBe(2);

		// Backfill: birthday → año del scheduledFor; el resto → 0.
		const rows: Array<{ id: string; occurrenceYear: number }> = await qr.query(
			`SELECT "id", "occurrenceYear" FROM "scheduled_messages"`,
		);
		const byId = new Map(rows.map((r) => [r.id, Number(r.occurrenceYear)]));
		expect(byId.get(birthdayRowId)).toBe(2026);
		expect(byId.get(otherRowId)).toBe(0);

		// La UQ triple vive como constraint de tabla.
		const ddl: Array<{ sql: string }> = await qr.query(
			`SELECT "sql" FROM sqlite_master WHERE type = 'table' AND name = 'scheduled_messages'`,
		);
		expect(ddl[0].sql).toContain('UQ_scheduled_step_participant_year"');

		// Los índices del service se recrean.
		const idx: Array<{ name: string }> = await qr.query(
			`SELECT "name" FROM sqlite_master WHERE type = 'index' AND tbl_name = 'scheduled_messages'`,
		);
		const idxNames = idx.map((i) => i.name);
		expect(idxNames).toContain('IDX_scheduled_messages_due');
		expect(idxNames).toContain('IDX_scheduled_messages_status');
	});

	it('la UQ nueva rechaza el mismo año y admite el año siguiente', async () => {
		const insert = (id: string, year: number) => qr.query(
			`INSERT INTO "scheduled_messages"
				("id", "sequenceId", "stepId", "participantId", "retreatId", "channel", "templateType", "scheduledFor", "occurrenceYear")
				VALUES ('${id}', (SELECT "sequenceId" FROM "sequence_steps" WHERE "id" = '${birthdayStepId}'),
					'${birthdayStepId}', '${participantId}', '${retreatId}', 'whatsapp', 'GENERAL',
					'2030-05-20 15:00:00', ${year})`,
		);

		// Mismo (step, participant, año) que la fila de 2026 → viola la UQ triple.
		await expect(insert('dup-same-year', 2026)).rejects.toThrow();

		// Año distinto para el mismo paso/participante → el comportamiento NUEVO.
		await expect(insert('dup-next-year', 2030)).resolves.toBeDefined();

		const count = (await qr.query(`SELECT COUNT(*) AS c FROM "scheduled_messages"`))[0].c;
		expect(count).toBe(3);
	});

	it('up() es re-ejecutable (reinicio del API a mitad de corrida)', async () => {
		await migration.up(qr);

		const count = (await qr.query(`SELECT COUNT(*) AS c FROM "scheduled_messages"`))[0].c;
		expect(count).toBe(3); // nada se pierde ni duplica

		const leftovers: Array<{ name: string }> = await qr.query(
			`SELECT "name" FROM sqlite_master WHERE type = 'table'
			 AND "name" IN ('scheduled_messages_old', 'scheduled_messages_new')`,
		);
		expect(leftovers).toHaveLength(0);
	});
});
