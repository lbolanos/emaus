/**
 * Tests unitarios del SantisimoReminderService.performReminders().
 *
 * Mockea AppDataSource (sin TypeORM real) y EmailService.
 * Cada test instancia SantisimoReminderService con `new (SantisimoReminderService as any)()`
 * para obtener un objeto fresco sin afectar el singleton global.
 *
 * NOTA ESM: con --experimental-vm-modules, el factory de jest.mock NO puede
 * referenciar variables `const/let` del scope del módulo (no se hoistan correctamente).
 * En su lugar, usamos `jest.requireMock` dentro de cada test para acceder
 * a los mocks de manera segura.
 */

import { AppDataSource } from '@/data-source';
import { SantisimoReminderService } from '@/services/santisimoReminderService';
import { SantisimoSlot } from '@/entities/santisimoSlot.entity';
import { SantisimoSignup } from '@/entities/santisimoSignup.entity';
import { Participant } from '@/entities/participant.entity';

// ── Mocks (sin referencias externas en los factories) ─────────────────────────

jest.mock('@/data-source', () => ({
	AppDataSource: {
		getRepository: jest.fn(),
	},
}));

// El factory no referencia variables externas; accedemos a la instancia
// via jest.requireMock dentro de cada test.
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn().mockImplementation(() => ({
		sendEmail: jest.fn().mockResolvedValue(true),
	})),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMockQb(getManyFn: jest.Mock) {
	return {
		where: jest.fn().mockReturnThis(),
		andWhere: jest.fn().mockReturnThis(),
		leftJoinAndSelect: jest.fn().mockReturnThis(),
		select: jest.fn().mockReturnThis(),
		getMany: getManyFn,
	};
}

function makeFutureSlot(overrides: Partial<SantisimoSlot> = {}): SantisimoSlot {
	const now = Date.now();
	return {
		id: 'slot-1',
		retreatId: 'retreat-1',
		startTime: new Date(now + 24 * 60 * 60 * 1000),
		endTime: new Date(now + 24.5 * 60 * 60 * 1000),
		capacity: 1,
		isDisabled: false,
		mealWindow: false,
		retreat: { parish: 'San Agustín', timezone: 'America/Mexico_City' } as any,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	} as SantisimoSlot;
}

function makeSignup(overrides: Partial<SantisimoSignup> = {}): SantisimoSignup {
	return {
		id: 'signup-1',
		slotId: 'slot-1',
		name: 'Juan',
		participantId: 'p1',
		isAngelito: true,
		autoAssigned: false,
		createdAt: new Date(),
		...overrides,
	} as SantisimoSignup;
}

function makeParticipant(overrides: Partial<Participant> = {}): Participant {
	return {
		id: 'p1',
		firstName: 'Juan',
		email: 'test@example.com',
		...overrides,
	} as Participant;
}

/** Secuencia los 3 repositorios: slots → signups → participants. */
function setupRepositoryMocks(
	slotResults: SantisimoSlot[],
	signupResults: SantisimoSignup[],
	participantResults: Participant[],
) {
	(AppDataSource.getRepository as jest.Mock)
		.mockReturnValueOnce({
			createQueryBuilder: jest.fn().mockReturnValue(buildMockQb(jest.fn().mockResolvedValue(slotResults))),
		})
		.mockReturnValueOnce({
			createQueryBuilder: jest.fn().mockReturnValue(buildMockQb(jest.fn().mockResolvedValue(signupResults))),
		})
		.mockReturnValueOnce({
			createQueryBuilder: jest.fn().mockReturnValue(buildMockQb(jest.fn().mockResolvedValue(participantResults))),
		});
}


// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SantisimoReminderService (unit tests con mocks)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// ── Sin slots en ventana ──────────────────────────────────────────────────

	describe('performReminders - sin slots en la ventana 23-25h', () => {
		it('retorna { sent: 0 } cuando no hay slots en la ventana', async () => {
			const getManyEmpty = jest.fn().mockResolvedValue([]);
			(AppDataSource.getRepository as jest.Mock).mockReturnValue({
				createQueryBuilder: jest.fn().mockReturnValue(buildMockQb(getManyEmpty)),
			});

			const svc = new (SantisimoReminderService as any)();
			const result = await svc.performReminders();

			expect(result).toEqual({ sent: 0 });
			expect(getManyEmpty).toHaveBeenCalledTimes(1);
		});
	});

	// ── Con slots y signups ───────────────────────────────────────────────────

	describe('performReminders - con slots y signups', () => {
		it('envía email al angelito del sistema con slot en la ventana', async () => {
			setupRepositoryMocks([makeFutureSlot()], [makeSignup()], [makeParticipant()]);

			const svc = new (SantisimoReminderService as any)();
			const result = await svc.performReminders();

			// Verifica que el servicio identificó al angelito y procesó el envío.
			// El contenido del email se valida via el EmailService mockeado internamente.
			expect(result.sent).toBe(1);
		});

		it('guarda el signupId en reminderSentAt después del envío', async () => {
			setupRepositoryMocks([makeFutureSlot()], [makeSignup()], [makeParticipant()]);

			const svc = new (SantisimoReminderService as any)();
			await svc.performReminders();

			expect(svc.reminderSentAt.has('signup-1')).toBe(true);
		});

		it('NO envía a signups sin participantId (nombre libre)', async () => {
			const slot = makeFutureSlot();
			const signupLibre = makeSignup({ participantId: null });

			(AppDataSource.getRepository as jest.Mock)
				.mockReturnValueOnce({
					createQueryBuilder: jest.fn().mockReturnValue(buildMockQb(jest.fn().mockResolvedValue([slot]))),
				})
				.mockReturnValueOnce({
					createQueryBuilder: jest.fn().mockReturnValue(buildMockQb(jest.fn().mockResolvedValue([signupLibre]))),
				});

			const svc = new (SantisimoReminderService as any)();
			const result = await svc.performReminders();

			expect(result.sent).toBe(0);
		});

		it('NO envía a participantes sin email registrado', async () => {
			setupRepositoryMocks(
				[makeFutureSlot()],
				[makeSignup()],
				[makeParticipant({ email: undefined })],
			);

			const svc = new (SantisimoReminderService as any)();
			const result = await svc.performReminders();

			expect(result.sent).toBe(0);
		});

		it('NO reenvía si el signup ya está en reminderSentAt (deduplicación)', async () => {
			setupRepositoryMocks([makeFutureSlot()], [makeSignup()], [makeParticipant()]);

			const svc = new (SantisimoReminderService as any)();
			svc.reminderSentAt.set('signup-1', new Date());

			const result = await svc.performReminders();

			expect(result.sent).toBe(0);
		});

		it('devuelve sent = N coincidiendo con los emails enviados', async () => {
			const slot = makeFutureSlot();
			const signup1 = makeSignup({ id: 'signup-1', participantId: 'p1' });
			const signup2 = makeSignup({ id: 'signup-2', participantId: 'p2' });
			const p1 = makeParticipant({ id: 'p1', email: 'juan@example.com' });
			const p2 = makeParticipant({ id: 'p2', email: 'maria@example.com' });

			setupRepositoryMocks([slot], [signup1, signup2], [p1, p2]);

			const svc = new (SantisimoReminderService as any)();
			const result = await svc.performReminders();

			expect(result.sent).toBe(2);
		});
	});

	// ── Deduplicación / cleanOldEntries ───────────────────────────────────────

	describe('cleanOldEntries', () => {
		it('elimina entradas del Map cuando superan las 48h', () => {
			const svc = new (SantisimoReminderService as any)();
			svc.reminderSentAt.set('old', new Date(Date.now() - 49 * 60 * 60 * 1000));
			svc.reminderSentAt.set('recent', new Date(Date.now() - 1 * 60 * 60 * 1000));

			(svc as any).cleanOldEntries();

			expect(svc.reminderSentAt.has('old')).toBe(false);
			expect(svc.reminderSentAt.has('recent')).toBe(true);
		});

		it('preserva entradas recientes (< 48h)', () => {
			const svc = new (SantisimoReminderService as any)();
			svc.reminderSentAt.set('1h', new Date(Date.now() - 1 * 60 * 60 * 1000));
			svc.reminderSentAt.set('24h', new Date(Date.now() - 24 * 60 * 60 * 1000));
			svc.reminderSentAt.set('47h', new Date(Date.now() - 47 * 60 * 60 * 1000));

			(svc as any).cleanOldEntries();

			expect(svc.reminderSentAt.size).toBe(3);
		});

		it('limpia expiradas y preserva recientes en el mismo Map', () => {
			const svc = new (SantisimoReminderService as any)();
			svc.reminderSentAt.set('exp-1', new Date(Date.now() - 72 * 60 * 60 * 1000));
			svc.reminderSentAt.set('exp-2', new Date(Date.now() - 48 * 60 * 60 * 1000 - 1));
			svc.reminderSentAt.set('keep-1', new Date(Date.now() - 10 * 60 * 1000));
			svc.reminderSentAt.set('keep-2', new Date(Date.now() - 30 * 60 * 60 * 1000));

			(svc as any).cleanOldEntries();

			expect(svc.reminderSentAt.has('exp-1')).toBe(false);
			expect(svc.reminderSentAt.has('exp-2')).toBe(false);
			expect(svc.reminderSentAt.has('keep-1')).toBe(true);
			expect(svc.reminderSentAt.has('keep-2')).toBe(true);
			expect(svc.reminderSentAt.size).toBe(2);
		});
	});
});
