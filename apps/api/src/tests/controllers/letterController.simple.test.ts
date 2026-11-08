/**
 * Test del controller de cartas (specs/letters-email T8).
 *
 * Handlers llamados directo (req/res fake) sobre TypeORM real: transiciones de
 * revisión con sello reviewedAt/reviewedBy, 403 sin acceso al retiro de la
 * carta (regla anti-IDOR de recurso específico), 404, print-mark por lote y
 * wiring source-level de los permisos letter:* en letterRoutes.
 *
 * domainAuditService se spy-ea (el log real es fire-and-forget; el patrón de
 * espera awaitAuditRow se usa solo en el caso que verifica la fila).
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

jest.mock('@/middleware/authorization', () => {
	const actual = jest.requireActual('@/middleware/authorization');
	return {
		...actual,
		authorizationService: {
			...actual.authorizationService,
			hasRetreatAccess: jest.fn(),
			hasPermission: jest.fn(),
		},
	};
});
jest.mock('@/services/domainAuditService', () => {
	const actual = jest.requireActual('@/services/domainAuditService');
	return {
		...actual,
		domainAuditService: { log: jest.fn().mockResolvedValue(undefined) },
	};
});

import { authorizationService } from '@/middleware/authorization';
import { domainAuditService } from '@/services/domainAuditService';
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Letter } from '@/entities/letter.entity';
import { activateMailboxesForRetreat } from '@/services/letterMailboxService';
import { ingestLetter } from '@/services/letterService';
import {
	listLettersHandler,
	reviewLetterHandler,
	markPrintedHandler,
	getMailboxesHandler,
	getFoldersHandler,
	getPrintBatchHandler,
	unmarkPrintedHandler,
} from '@/controllers/letterController';

const getDS = () => (TestDataFactory as any)['testDataSource'];
const mockedHasRetreatAccess = authorizationService.hasRetreatAccess as jest.Mock;

const mockRes = () => {
	// 200 como default: Express responde 200 si el handler solo llama res.json().
	const res: any = { statusCode: 200, body: undefined };
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (payload: unknown) => {
		res.body = payload;
		return res;
	};
	return res;
};

// Usuario REAL: la DB de test enforcea FKs y letters.reviewedById apunta a
// users — un uuid inventado revienta el UPDATE (memoria reference_test_db).
let USER_ID = uuidv4();

describe('letterController (integration)', () => {
	let retreat: any;
	let letterId: string;

	const seedLetter = async (status = 'pending') => {
		const walker = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' });
		await activateMailboxesForRetreat(retreat.id);
		const ingest = await ingestLetter({
			messageId: `<seed-${Date.now()}-${Math.random()}@mail.ejemplo.com>`,
			from: 'familia@ejemplo.com',
			to: `carta.${(
				await getDS().getRepository(Letter).manager.query(
					`SELECT "mailboxCode" AS code FROM "retreat_participants" WHERE "participantId" = ?`,
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					[walker.id!],
				)
			)[0].code}@emaus.cc`,
			text: 'Carta de prueba',
			receivedAt: '2026-11-05T14:03:00.000Z',
		});
		expect(ingest.status).toBe('accepted');
		const letter = await getDS().getRepository(Letter).findOne({ where: { id: ingest.letterId } });
		if (status !== 'pending') {
			letter!.status = status as 'approved' | 'hidden';
			await getDS().getRepository(Letter).save(letter!);
		}
		return letter!.id;
	};

	const fakeReq = (over: Record<string, unknown> = {}): any => ({
		user: { id: USER_ID },
		params: {},
		query: {},
		body: {},
		...over,
	});

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.clearAllMocks();
		// clearTestData borra users: el revisor se crea por test (FK de
		// letters.reviewedById → users; la DB de test enforcea FKs).
		const user = await TestDataFactory.createTestUser();
		USER_ID = user.id;
		retreat = await TestDataFactory.createTestRetreat();
		letterId = await seedLetter();
		mockedHasRetreatAccess.mockResolvedValue(true);
	});

	describe('reviewLetterHandler', () => {
		it('aprueba y sella reviewedAt/reviewedBy; audit con letterId y status', async () => {
			const req = fakeReq({ params: { id: letterId }, body: { status: 'approved' } });
			const res = mockRes();
			await reviewLetterHandler(req, res);

			expect(res.statusCode).toBe(200);
			expect(res.body.letter.status).toBe('approved');
			expect(res.body.letter.reviewedAt).toBeTruthy();

			expect(domainAuditService.log).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'letter.review',
					resourceType: 'letter',
					retreatId: retreat.id,
					metadata: expect.objectContaining({ letterId, status: 'approved' }),
				}),
			);
			expect(mockedHasRetreatAccess).toHaveBeenCalledWith(USER_ID, retreat.id);
		});

		it('oculta (hidden) una carta approved — transición válida', async () => {
			const id = await seedLetter('approved');
			const res = mockRes();
			await reviewLetterHandler(fakeReq({ params: { id }, body: { status: 'hidden' } }), res);
			expect(res.statusCode).toBe(200);
			expect(res.body.letter.status).toBe('hidden');
		});

		it('403 sin acceso al retiro de la carta aunque el permiso global exista', async () => {
			mockedHasRetreatAccess.mockResolvedValue(false);
			const res = mockRes();
			await reviewLetterHandler(fakeReq({ params: { id: letterId }, body: { status: 'approved' } }), res);
			expect(res.statusCode).toBe(403);
			// La carta NO cambia.
			const letter = await getDS().getRepository(Letter).findOne({ where: { id: letterId } });
			expect(letter!.status).toBe('pending');
		});

		it('404 para carta inexistente', async () => {
			const res = mockRes();
			await reviewLetterHandler(fakeReq({ params: { id: uuidv4() }, body: { status: 'approved' } }), res);
			expect(res.statusCode).toBe(404);
		});
	});

	describe('markPrintedHandler', () => {
		it('marca el lote con printedAt y printedBatchId', async () => {
			await reviewLetterHandler(
				fakeReq({ params: { id: letterId }, body: { status: 'approved' } }),
				mockRes(),
			);
			const batchId = uuidv4();
			const res = mockRes();
			await markPrintedHandler(
				fakeReq({ params: { retreatId: retreat.id }, body: { letterIds: [letterId], batchId } }),
				res,
			);
			expect(res.statusCode).toBe(200);
			expect(res.body.marked).toBe(1);

			const letter = await getDS().getRepository(Letter).findOne({ where: { id: letterId } });
			expect(letter!.printedAt).toBeTruthy();
			expect(letter!.printedBatchId).toBe(batchId);
		});
	});

	describe('listLettersHandler', () => {
		it('filtra por status y devuelve counts del retiro', async () => {
			await reviewLetterHandler(
				fakeReq({ params: { id: letterId }, body: { status: 'approved' } }),
				mockRes(),
			);
			const res = mockRes();
			await listLettersHandler(
				fakeReq({ params: { retreatId: retreat.id }, query: { status: 'approved' } }),
				res,
			);
			expect(res.statusCode).toBe(200);
			expect(res.body.letters).toHaveLength(1);
			expect(res.body.counts).toEqual({
				pending: 0,
				approved: 1,
				hidden: 0,
				attached: 0,
			});
		});
	});

	describe('getMailboxesHandler', () => {
		it('devuelve buzones con contadores y dirección completa', async () => {
			const res = mockRes();
			await getMailboxesHandler(fakeReq({ params: { retreatId: retreat.id } }), res);
			expect(res.statusCode).toBe(200);
			expect(res.body.mailboxes).toHaveLength(1);
			const row = res.body.mailboxes[0];
			expect(row.mailboxAddress).toBe(`carta.${row.mailboxCode}@emaus.cc`);
			expect(row.letterCounts).toEqual({ pending: 1, approved: 0, hidden: 0 });
		});
	});

	describe('quitar la marca de impresa', () => {
		const approveAndPrint = async (id: string) => {
			await reviewLetterHandler(fakeReq({ params: { id }, body: { status: 'approved' } }), mockRes());
			await markPrintedHandler(
				fakeReq({ params: { retreatId: retreat.id }, body: { letterIds: [id], batchId: uuidv4() } }),
				mockRes(),
			);
		};
		const unmark = async (body: Record<string, unknown>, retreatId = retreat.id) => {
			const res = mockRes();
			await unmarkPrintedHandler(fakeReq({ params: { retreatId }, body }), res);
			return res;
		};

		it('por carta: limpia printedAt y printedBatchId y lo audita', async () => {
			await approveAndPrint(letterId);
			const res = await unmark({ letterIds: [letterId] });
			expect(res.body.unmarked).toBe(1);
			const letter = await getDS().getRepository(Letter).findOneByOrFail({ id: letterId });
			expect(letter.printedAt).toBeNull();
			expect(letter.printedBatchId).toBeNull();
			expect(domainAuditService.log).toHaveBeenCalledWith(
				expect.objectContaining({ action: 'letter.print_unmark', metadata: expect.objectContaining({ count: 1 }) }),
			);
		});

		it('por carpeta: todas las impresas de ese participante', async () => {
			await approveAndPrint(letterId);
			const rp = await getDS().getRepository(Letter).findOneByOrFail({ id: letterId });
			const second = await getDS().getRepository(Letter).save({
				retreatId: retreat.id, retreatParticipantId: rp.retreatParticipantId, fromEmail: 'tia@ejemplo.com',
				bodyText: 'Segunda', status: 'pending', receivedAt: new Date(),
			});
			await approveAndPrint(second.id);
			const participantId = (
				await getDS().query(`SELECT "participantId" FROM "retreat_participants" WHERE "id" = ?`, [
					rp.retreatParticipantId,
				])
			)[0].participantId;

			const res = await unmark({ participantIds: [participantId] });
			expect(res.body.unmarked).toBe(2);
		});

		it('acotado al retiro: una carta de otro retiro no se toca (anti-IDOR)', async () => {
			await approveAndPrint(letterId);
			const otherRetreat = await TestDataFactory.createTestRetreat();
			const res = await unmark({ letterIds: [letterId] }, otherRetreat.id);
			expect(res.body.unmarked).toBe(0);
			const letter = await getDS().getRepository(Letter).findOneByOrFail({ id: letterId });
			expect(letter.printedAt).toBeTruthy();
		});

		it('schema: exige letterIds o participantIds', async () => {
			const { UnmarkLettersPrintedSchema } = await import('@repo/types');
			const parsed = UnmarkLettersPrintedSchema.safeParse({ params: { retreatId: retreat.id }, body: {} });
			expect(parsed.success).toBe(false);
		});
	});

	describe('filtro por palanquero asignado', () => {
		const setPalanquero = async (value: string | null) => {
			const rpId = (await getDS().getRepository(Letter).findOneByOrFail({ id: letterId }))
				.retreatParticipantId;
			await getDS().query(`UPDATE "retreat_participants" SET "palancasCoordinator" = ? WHERE "id" = ?`, [
				value,
				rpId,
			]);
		};
		const list = async (palanquero: string) => {
			const res = mockRes();
			await listLettersHandler(fakeReq({ params: { retreatId: retreat.id }, query: { palanquero } }), res);
			return res.body.letters as any[];
		};

		it('bandeja: solo las cartas de los caminantes de ese palanquero; __none__ = sin asignar', async () => {
			await setPalanquero('Palanquero 2');
			expect(await list('Palanquero 2')).toHaveLength(1);
			expect(await list('Palanquero 1')).toHaveLength(0);
			expect(await list('__none__')).toHaveLength(0);

			await setPalanquero(null);
			expect(await list('__none__')).toHaveLength(1);
			// Cadena vacía también cuenta como sin asignar (el formulario la deja así).
			await setPalanquero('');
			expect(await list('__none__')).toHaveLength(1);
		});

		it('carpetas: cada fila trae su palanquero', async () => {
			await setPalanquero('Palanquero 3');
			const res = mockRes();
			await getFoldersHandler(fakeReq({ params: { retreatId: retreat.id } }), res);
			expect(res.body.folders[0].palancasCoordinator).toBe('Palanquero 3');
		});
	});

	describe('carpetas y lo que falta imprimir', () => {
		const approve = (id: string) =>
			reviewLetterHandler(fakeReq({ params: { id }, body: { status: 'approved' } }), mockRes());
		const markPrinted = (ids: string[]) =>
			markPrintedHandler(
				fakeReq({ params: { retreatId: retreat.id }, body: { letterIds: ids, batchId: uuidv4() } }),
				mockRes(),
			);

		it('folders: estado del folder por participante (impresas, sin imprimir, por revisar)', async () => {
			// Mismo caminante: 3 cartas — una impresa, una aprobada sin imprimir, una pendiente.
			const rpId = (await getDS().getRepository(Letter).findOneByOrFail({ id: letterId }))
				.retreatParticipantId;
			const second = await getDS().getRepository(Letter).save({
				retreatId: retreat.id, retreatParticipantId: rpId, fromEmail: 'tia@ejemplo.com',
				bodyText: 'Segunda', status: 'pending', receivedAt: new Date(),
			});
			const third = await getDS().getRepository(Letter).save({
				retreatId: retreat.id, retreatParticipantId: rpId, fromEmail: 'primo@ejemplo.com',
				bodyText: 'Tercera', status: 'pending', receivedAt: new Date(),
			});
			await approve(letterId);
			await approve(second.id);
			await markPrinted([letterId]);
			// Un segundo caminante sin cartas también aparece (elegible para buzón).
			await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' });

			const res = mockRes();
			await getFoldersHandler(fakeReq({ params: { retreatId: retreat.id } }), res);
			expect(res.statusCode).toBe(200);
			expect(res.body.folders).toHaveLength(2);
			const mine = res.body.folders.find((f: any) => f.retreatParticipantId === rpId);
			expect(mine.counts).toEqual({ pending: 1, approved: 2, hidden: 0, attached: 0 });
			expect(mine.printed).toBe(1);
			expect(mine.unprinted).toBe(1);
			expect(third.status).toBe('pending');
			const empty = res.body.folders.find((f: any) => f.retreatParticipantId !== rpId);
			expect(empty.counts).toEqual({ pending: 0, approved: 0, hidden: 0, attached: 0 });
		});

		it('print-batch onlyUnprinted: solo las aprobadas que aún no salieron en papel', async () => {
			const rp = await getDS().getRepository(Letter).findOneByOrFail({ id: letterId });
			const second = await getDS().getRepository(Letter).save({
				retreatId: retreat.id, retreatParticipantId: rp.retreatParticipantId, fromEmail: 'tia@ejemplo.com',
				bodyText: 'Segunda', status: 'approved', receivedAt: new Date(),
			});
			await approve(letterId);
			await markPrinted([letterId]);

			const all = mockRes();
			await getPrintBatchHandler(
				fakeReq({ params: { retreatId: retreat.id }, query: { scope: 'retreat' } }),
				all,
			);
			expect(all.body.entries[0].letters).toHaveLength(2);

			const missing = mockRes();
			await getPrintBatchHandler(
				fakeReq({ params: { retreatId: retreat.id }, query: { scope: 'retreat', onlyUnprinted: 'true' } }),
				missing,
			);
			expect(missing.body.entries[0].letters.map((l: any) => l.id)).toEqual([second.id]);
		});
	});

	it('wiring: cada ruta de letterRoutes lleva su permiso letter:* y el prefijo es /letters', () => {
		const routeSrc = readFileSync(join(__dirname, '..', '..', 'routes', 'letterRoutes.ts'), 'utf-8');
		expect(routeSrc).toMatch(/requirePermission\(\s*['"]letter:manage['"]\s*\)/);
		expect(routeSrc).toMatch(/requirePermission\(\s*['"]letter:read['"]\s*\)/);
		expect(routeSrc).toMatch(/requirePermission\(\s*['"]letter:update['"]\s*\)/);
		expect(routeSrc).toMatch(/requirePermission\(\s*['"]letter:print['"]\s*\)/);
		// El detalle autenticado exige sesión ANTES del permiso. El router se monta
		// con prefijo /letters (routes/index.ts), así que sus paths internos no
		// llevan ese segmento — el bug de wiring del primer deploy (404 del POST
		// activate) fue exactamente esto.
		const indexSrc = readFileSync(join(__dirname, '..', '..', 'routes', 'index.ts'), 'utf-8');
		expect(indexSrc).toMatch(/router\.use\(\s*['"]\/letters['"],\s*letterRoutes\s*\)/);
		const detail = routeSrc.match(/router\.get\(\s*['"]\/:id['"][^)]*\)/);
		expect(detail).not.toBeNull();
		expect(detail![0]).toMatch(/isAuthenticated/);
		expect(detail![0]).toMatch(/requirePermission\(\s*['"]letter:read['"]\s*\)/);
		// Los paths de gestión SÍ llevan el segmento interno letters/ (después del prefijo).
		expect(routeSrc).toMatch(/['"]\/retreats\/:retreatId\/letters\/mailbox\/activate['"]/);
	});
});
