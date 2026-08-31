import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityService } from '@/services/communityService';
import { AppDataSource } from '@/data-source';
import { CommunityAdmin } from '@/entities/communityAdmin.entity';
import { CommunityMember } from '@/entities/communityMember.entity';
import { Participant } from '@/entities/participant.entity';

// Mock EmailService antes de cargar el servicio (misma razón que en
// communityService.test.ts: factory sin referencias externas por ESM).
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

/** 'MM-DD' del día que cae `offsetDays` después de hoy en CDMX. */
const monthDayFromToday = (offsetDays: number): string => {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'America/Mexico_City',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(new Date());
	const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? '0');
	const target = new Date(Date.UTC(get('year'), get('month') - 1, get('day') + offsetDays));
	return target.toISOString().slice(5, 10);
};

describe('Cumpleaños de miembros de comunidad', () => {
	let testUser: User;
	let testCommunity: Community;
	let testRetreat: Retreat;
	let service: CommunityService;

	beforeAll(async () => {
		await setupTestDatabase();
		service = new CommunityService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		testUser = await TestDataFactory.createTestUser();
		testCommunity = await TestDataFactory.createTestCommunity(testUser.id);
		testRetreat = await TestDataFactory.createTestRetreat(testUser.id);
	});

	/** Da de alta un miembro y devuelve su id junto al del participant. */
	const addMember = async (overrides: Partial<Participant> = {}) => {
		const participant = await TestDataFactory.createTestParticipant(testRetreat.id, overrides);
		const member = await service.addMember(testCommunity.id, participant.id);
		return { memberId: (member as any).id as string, participantId: participant.id };
	};

	const memberRepo = () => AppDataSource.getRepository(CommunityMember);
	const participantRepo = () => AppDataSource.getRepository(Participant);

	// ─── Guardado ────────────────────────────────────────────────────────────

	describe('updateMemberProfile — birthDate', () => {
		it('guarda el cumpleaños con año', async () => {
			const { memberId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: '1985-03-14',
			});
			const saved = await memberRepo().findOne({ where: { id: memberId } });
			expect(saved?.birthDate).toBe('1985-03-14');
		});

		it('guarda el cumpleaños sin año', async () => {
			const { memberId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, { birthDate: '03-14' });
			const saved = await memberRepo().findOne({ where: { id: memberId } });
			expect(saved?.birthDate).toBe('03-14');
		});

		it('el string vacío limpia el dato', async () => {
			const { memberId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, { birthDate: '03-14' });
			await service.updateMemberProfile(testCommunity.id, memberId, { birthDate: '' });
			const saved = await memberRepo().findOne({ where: { id: memberId } });
			expect(saved?.birthDate).toBeNull();
		});

		it('rechaza una fecha que no existe en el calendario', async () => {
			const { memberId } = await addMember();
			await expect(
				service.updateMemberProfile(testCommunity.id, memberId, { birthDate: '02-31' }),
			).rejects.toThrow('INVALID_BIRTH_DATE');
		});

		it('NO escribe en participants.birthDate (el overlay no toca la identidad global)', async () => {
			// Misma garantía que el test anti account-takeover del email: lo que
			// captura una comunidad se queda en esa comunidad.
			const { memberId, participantId } = await addMember({
				birthDate: new Date('1990-01-01'),
			});
			await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: '1985-03-14',
			});
			const participant = await participantRepo().findOne({ where: { id: participantId } });
			expect(new Date(participant!.birthDate).toISOString().slice(0, 10)).toBe('1990-01-01');
		});

		it('marca birthDate en changedFields solo cuando cambia de verdad', async () => {
			const { memberId } = await addMember();
			const first = await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: '03-14',
			});
			expect(first.changedFields).toContain('birthDate');

			const repeat = await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: '03-14',
			});
			expect(repeat.changedFields).not.toContain('birthDate');
		});

		it('devuelve los derivados para que el cliente refresque la fila', async () => {
			const { memberId } = await addMember();
			const { member } = await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: '1985-03-14',
			});
			expect((member as any).birthdayMonthDay).toBe('03-14');
			expect((member as any).birthdayYear).toBe(1985);
		});
	});

	// ─── Filtrado de PII ─────────────────────────────────────────────────────

	describe('getMembersForViewer — el año es owner-only', () => {
		const makeNonOwnerAdmin = async () => {
			const adminUser = await TestDataFactory.createTestUser({
				email: `birthday-admin-${Date.now()}@test.com`,
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: adminUser.id,
					role: 'admin',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);
			return adminUser;
		};

		it('OWNER: recibe día, mes y año', async () => {
			const { memberId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: '1985-03-14',
			});

			const members = await service.getMembersForViewer(testCommunity.id, {
				userId: testUser.id,
				isSuperadmin: false,
			});
			expect((members[0] as any).birthdayMonthDay).toBe('03-14');
			expect((members[0] as any).birthdayYear).toBe(1985);
		});

		it('ADMIN no-owner: recibe día y mes, pero nunca el año ni el crudo', async () => {
			const { memberId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: '1985-03-14',
			});
			const adminUser = await makeNonOwnerAdmin();

			const members = await service.getMembersForViewer(testCommunity.id, {
				userId: adminUser.id,
				isSuperadmin: false,
			});
			expect((members[0] as any).birthdayMonthDay).toBe('03-14');
			expect((members[0] as any).birthdayYear).toBeNull();
			// El crudo llevaría el año dentro: no debe viajar.
			expect((members[0] as any).birthDate).toBeUndefined();
		});
	});

	// ─── Panel "Cumplen pronto" ──────────────────────────────────────────────

	describe('getUpcomingBirthdays', () => {
		const viewer = () => ({ userId: testUser.id, isSuperadmin: false });

		it('lista a quien cumple dentro de la ventana, con los días que faltan', async () => {
			const { memberId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: monthDayFromToday(3),
			});

			const rows = await service.getUpcomingBirthdays(testCommunity.id, viewer(), 30);
			const row = rows.find((r) => r.memberId === memberId);
			expect(row).toBeDefined();
			expect(row!.daysUntil).toBe(3);
			expect(row!.alreadyGreeted).toBe(false);
		});

		it('deja fuera a quien cumple después de la ventana', async () => {
			const { memberId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: monthDayFromToday(45),
			});

			const rows = await service.getUpcomingBirthdays(testCommunity.id, viewer(), 30);
			expect(rows.find((r) => r.memberId === memberId)).toBeUndefined();
		});

		it('ordena por proximidad', async () => {
			const soon = await addMember();
			const later = await addMember();
			await service.updateMemberProfile(testCommunity.id, soon.memberId, {
				birthDate: monthDayFromToday(2),
			});
			await service.updateMemberProfile(testCommunity.id, later.memberId, {
				birthDate: monthDayFromToday(9),
			});

			const rows = await service.getUpcomingBirthdays(testCommunity.id, viewer(), 30);
			const ids = rows.map((r) => r.memberId);
			expect(ids.indexOf(soon.memberId)).toBeLessThan(ids.indexOf(later.memberId));
		});

		it('excluye estados que no son de seguimiento activo', async () => {
			const { memberId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: monthDayFromToday(1),
			});
			await memberRepo().update(memberId, { state: 'do_not_contact' });

			const rows = await service.getUpcomingBirthdays(testCommunity.id, viewer(), 30);
			expect(rows.find((r) => r.memberId === memberId)).toBeUndefined();
		});

		it('incluye a los pendientes de verificación (lista positiva, no solo activos)', async () => {
			const { memberId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: monthDayFromToday(1),
			});
			await memberRepo().update(memberId, { state: 'pending_verification' });

			const rows = await service.getUpcomingBirthdays(testCommunity.id, viewer(), 30);
			expect(rows.find((r) => r.memberId === memberId)).toBeDefined();
		});

		it('excluye a quien pidió no ser contactado', async () => {
			const { memberId, participantId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: monthDayFromToday(1),
			});
			await participantRepo().update(participantId, { doNotContact: true });

			const rows = await service.getUpcomingBirthdays(testCommunity.id, viewer(), 30);
			expect(rows.find((r) => r.memberId === memberId)).toBeUndefined();
		});

		it('descarta el relleno automático del alta en vez de tratarlo como cumpleaños', async () => {
			// Participant creado hoy con `birthDate = new Date()`, tal como lo hace
			// el alta de comunidad. No debe aparecer en el panel.
			const today = new Date();
			const { memberId } = await addMember({ birthDate: today });
			await participantRepo().update(
				(await memberRepo().findOne({ where: { id: memberId } }))!.participantId,
				{ registrationDate: today },
			);

			const rows = await service.getUpcomingBirthdays(testCommunity.id, viewer(), 30);
			expect(rows.find((r) => r.memberId === memberId)).toBeUndefined();
		});

		it('el admin no-owner no recibe el año ni la edad', async () => {
			const { memberId } = await addMember();
			await service.updateMemberProfile(testCommunity.id, memberId, {
				birthDate: `1985-${monthDayFromToday(5)}`,
			});
			const adminUser = await TestDataFactory.createTestUser({
				email: `bday-admin-${Date.now()}@test.com`,
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: adminUser.id,
					role: 'admin',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);

			const rows = await service.getUpcomingBirthdays(testCommunity.id, {
				userId: adminUser.id,
				isSuperadmin: false,
			});
			const row = rows.find((r) => r.memberId === memberId);
			expect(row).toBeDefined();
			expect(row!.birthdayMonthDay).toBe(monthDayFromToday(5));
			expect(row!.birthdayYear).toBeNull();
			expect(row!.turningAge).toBeNull();
		});
	});
});
