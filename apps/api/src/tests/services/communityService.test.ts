import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityService } from '@/services/communityService';
import { MemberStateEnum } from '@repo/types';
import { AppDataSource } from '@/data-source';
import { CommunityAdmin } from '@/entities/communityAdmin.entity';
import { CommunityMeeting } from '@/entities/communityMeeting.entity';

// Mock EmailService antes de cargar el servicio. Factory sin referencias externas
// (regla del proyecto con ESM experimental — ver test-setup.ts).
// Usamos globalThis.__sentEmails como bus observable porque jest.requireMock
// puede tener contextos distintos con ESM y el mock.calls puede no exponerse.
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async (data: any) => {
			(globalThis as any).__sentEmails ||= [];
			(globalThis as any).__sentEmails.push(data);
			return true;
		}),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

describe('Community Service', () => {
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
		testRetreat = await TestDataFactory.createTestRetreat();
	});

	describe('createCommunity', () => {
		it('should create a community', async () => {
			const data = {
				name: 'New Community',
				address1: '123 Main St',
				city: 'Test City',
				state: 'TS',
				zipCode: '12345',
				country: 'Test Country',
			};
			const community = await service.createCommunity(data, testUser.id);
			expect(community).toBeDefined();
			expect(community.name).toBe(data.name);
			expect(community.createdBy).toBe(testUser.id);
		});
	});

	describe('getCommunities', () => {
		it('should return communities for a user', async () => {
			const communities = await service.getCommunities(testUser.id);
			expect(communities.length).toBeGreaterThan(0);
			expect(communities[0].id).toBe(testCommunity.id);
		});

		it('should include memberCount in communities', async () => {
			// Create some members for the test community
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p1.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p2.id);

			const communities = await service.getCommunities(testUser.id);
			expect(communities.length).toBeGreaterThan(0);
			expect(communities[0].memberCount).toBe(2);
		});
	});

	describe('Member Management', () => {
		it('should import members from retreat', async () => {
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id);

			const result = await service.importFromRetreat(testCommunity.id, testRetreat.id, [
				p1.id,
				p2.id,
			]);

			expect(result.length).toBe(2);

			const members = await service.getMembers(testCommunity.id);
			expect(members.length).toBe(2);
		});

		it('should update member state', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const updated = await service.updateMemberState(
				member.id,
				MemberStateEnum.Enum.far_from_location,
			);

			expect(updated?.state).toBe(MemberStateEnum.Enum.far_from_location);
		});
	});

	describe('Meeting & Attendance', () => {
		it('should create a meeting and record attendance', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'First Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			});

			expect(meeting).toBeDefined();

			await service.recordAttendance(meeting.id, [{ memberId: member.id, attended: true }]);

			const attendance = await service.getAttendance(meeting.id);
			expect(attendance.length).toBe(1);
			expect(attendance[0].attended).toBe(true);
		});
	});

	describe('Dashboard Stats', () => {
		it('should calculate dashboard stats', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id, {
				state: MemberStateEnum.Enum.active_member,
			});

			const stats = await service.getDashboardStats(testCommunity.id);

			expect(stats.memberCount).toBe(1);
			expect(Array.isArray(stats.memberStateDistribution)).toBe(true);
			expect(
				stats.memberStateDistribution.find((s: any) => s.state === 'active_member')?.count,
			).toBe(1);
		});
	});

	describe('Admin Logic', () => {
		it('should invite an admin', async () => {
			const invitation = await service.inviteAdmin(testCommunity.id, testUser.email, testUser.id);

			expect(invitation).toBeDefined();
			expect(invitation.status).toBe('pending');
			expect(invitation.invitationToken).toBeDefined();
		});

		it('addAdminDirect should grant immediate active access without token', async () => {
			const newUser = await TestDataFactory.createTestUser();

			const admin = await service.addAdminDirect(testCommunity.id, newUser.id, testUser.id);

			expect(admin).toBeDefined();
			expect(admin!.userId).toBe(newUser.id);
			expect(admin!.status).toBe('active');
			expect(admin!.role).toBe('admin');
			expect(admin!.acceptedAt).toBeDefined();
			expect(admin!.invitationToken).toBeFalsy();
			// debe traer la relación user para que el front lo pinte
			expect(admin!.user).toBeDefined();
			expect(admin!.user.id).toBe(newUser.id);
		});

		it('addAdminDirect should reactivate an existing pending/revoked admin without duplicating', async () => {
			const newUser = await TestDataFactory.createTestUser();
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);

			// invitación pendiente previa
			await service.inviteAdmin(testCommunity.id, newUser.email, testUser.id);

			const admin = await service.addAdminDirect(testCommunity.id, newUser.id, testUser.id);
			expect(admin!.status).toBe('active');

			const rows = await adminRepo.find({
				where: { communityId: testCommunity.id, userId: newUser.id },
			});
			expect(rows.length).toBe(1);
		});

		it('addAdminDirect should not downgrade the owner', async () => {
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const owner = await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: testUser.id,
					role: 'owner',
					status: 'active',
				}),
			);

			const result = await service.addAdminDirect(testCommunity.id, testUser.id, testUser.id);
			expect(result!.role).toBe('owner');

			const reloaded = await adminRepo.findOne({ where: { id: owner.id } });
			expect(reloaded!.role).toBe('owner');
		});

		it('addAdminDirect should throw when the user does not exist', async () => {
			await expect(
				service.addAdminDirect(testCommunity.id, 'non-existent-user', testUser.id),
			).rejects.toThrow('User not found');
		});
	});

	describe('createNextMeetingInstance', () => {
		it('should create next instance for weekly recurrence', async () => {
			// Use a future date
			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7); // Next week

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Weekly Meeting',
				startDate: baseDate,
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance).toBeDefined();
			expect(nextInstance.parentMeetingId).toBe(meeting.id);
			expect(nextInstance.recurrenceFrequency).toBe('weekly'); // Kept for next instance
			expect(new Date(nextInstance.startDate).getTime()).toBeGreaterThan(new Date().getTime()); // Should be in future
		});

		it('should create next instance for monthly recurrence', async () => {
			// Use a future date
			const baseDate = new Date();
			baseDate.setMonth(baseDate.getMonth() + 1); // Next month

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Monthly Meeting',
				startDate: baseDate,
				durationMinutes: 90,
				recurrenceFrequency: 'monthly',
			});

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance).toBeDefined();
			expect(nextInstance.durationMinutes).toBe(90); // Preserve duration
			expect(new Date(nextInstance.startDate).getTime()).toBeGreaterThan(new Date().getTime()); // Should be in future
		});

		it('should create next instance for daily recurrence', async () => {
			// Use a future date
			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7); // Next week

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Daily Meeting',
				startDate: baseDate,
				durationMinutes: 30,
				recurrenceFrequency: 'daily',
			});

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance).toBeDefined();
			expect(new Date(nextInstance.startDate).getTime()).toBeGreaterThan(new Date().getTime()); // Should be in future
		});

		it('should handle day-of-month overflow gracefully', async () => {
			// Use January 31st of next year
			const baseDate = new Date();
			baseDate.setFullYear(baseDate.getFullYear() + 1);
			baseDate.setMonth(0); // January
			baseDate.setDate(31);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'End of Month Meeting',
				startDate: baseDate,
				durationMinutes: 60,
				recurrenceFrequency: 'monthly',
			});

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance).toBeDefined();
			// Should successfully create a next instance (may adjust day for shorter months)
			expect(new Date(nextInstance.startDate).getTime()).toBeGreaterThan(new Date().getTime());
		});

		it('should throw error for non-recurrence template', async () => {
			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'One-time Meeting',
				startDate: new Date(),
				durationMinutes: 60,
				// No recurrenceFrequency set
			});

			await expect(service.createNextMeetingInstance(meeting.id)).rejects.toThrow();
		});

		it('should preserve duration from original meeting', async () => {
			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7); // Next week

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Long Weekly Meeting',
				startDate: baseDate,
				durationMinutes: 120,
				recurrenceFrequency: 'weekly',
			});

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance.durationMinutes).toBe(120);
		});

		it('should set parentMeetingId correctly', async () => {
			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7); // Next week

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Parent Meeting',
				startDate: baseDate,
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});

			const { meeting: nextInstance } = await service.createNextMeetingInstance(meeting.id);

			expect(nextInstance.parentMeetingId).toBe(meeting.id);
			expect(nextInstance.id).not.toBe(meeting.id);
		});

		it('should send notification email to active members on instance creation (with feature flag ON)', async () => {
			(globalThis as any).__sentEmails = [];
			// Activar el feature flag para este test: el comportamiento "envía email
			// al crear instancia" solo aplica cuando MEETING_EMAIL_NOTIFICATIONS_ENABLED=true.
			const prevFlag = process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED;
			process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED = 'true';

			try {
				const p = await TestDataFactory.createTestParticipant(testRetreat.id, {
					email: 'recipient@example.com',
				});
				await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id, {
					state: 'active_member',
				});

				const baseDate = new Date();
				baseDate.setDate(baseDate.getDate() + 7);
				const meeting = await service.createMeeting(testCommunity.id, {
					title: 'Weekly Notif Test',
					startDate: baseDate,
					durationMinutes: 60,
					recurrenceFrequency: 'weekly',
				});

				// Reset emails después del createMeeting (que no envía porque es template)
				(globalThis as any).__sentEmails = [];

				await service.createNextMeetingInstance(meeting.id);

				// Esperar al fire-and-forget
				await new Promise((r) => setTimeout(r, 50));

				const sent = (globalThis as any).__sentEmails || [];
				expect(sent.length).toBe(1);
				expect(sent[0].to).toBe('recipient@example.com');
			} finally {
				if (prevFlag === undefined) delete process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED;
				else process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED = prevFlag;
			}
		});

		it('should skip notification when feature flag is OFF (default)', async () => {
			// Feature flag pausado: createNextMeetingInstance NO envía email aunque el
			// caller no pase notify=false. Es el estado de prod actual.
			delete process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED;
			(globalThis as any).__sentEmails = [];

			const p = await TestDataFactory.createTestParticipant(testRetreat.id, {
				email: 'no-email@example.com',
			});
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id, {
				state: 'active_member',
			});

			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7);
			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Flag Off Test',
				startDate: baseDate,
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});

			(globalThis as any).__sentEmails = [];
			await service.createNextMeetingInstance(meeting.id);
			await new Promise((r) => setTimeout(r, 50));

			expect(((globalThis as any).__sentEmails || []).length).toBe(0);
		});

		it('should skip notification when notify=false is passed (even if flag is ON)', async () => {
			const prevFlag = process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED;
			process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED = 'true';

			try {
				(globalThis as any).__sentEmails = [];

				const p = await TestDataFactory.createTestParticipant(testRetreat.id, {
					email: 'silent@example.com',
				});
				await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id, {
					state: 'active_member',
				});

				const baseDate = new Date();
				baseDate.setDate(baseDate.getDate() + 7);
				const meeting = await service.createMeeting(testCommunity.id, {
					title: 'Silent Test',
					startDate: baseDate,
					durationMinutes: 60,
					recurrenceFrequency: 'weekly',
				});

				(globalThis as any).__sentEmails = [];
				await service.createNextMeetingInstance(meeting.id, { notify: false });
				await new Promise((r) => setTimeout(r, 50));

				const sent = (globalThis as any).__sentEmails || [];
				expect(sent.length).toBe(0);
			} finally {
				if (prevFlag === undefined) delete process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED;
				else process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED = prevFlag;
			}
		});

		it('respects recurrenceEndDate as a hard ceiling', async () => {
			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7); // Next week
			const endDate = new Date();
			endDate.setDate(endDate.getDate() + 10); // Solo 10 días: 1 instancia +14d ya pasa.

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Bounded Series',
				startDate: baseDate,
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
				recurrenceEndDate: endDate,
			});

			// La próxima ocurrencia (baseDate + 7d = +14d desde hoy) excede endDate.
			await expect(
				service.createNextMeetingInstance(meeting.id, { notify: false }),
			).rejects.toThrow(/Recurrence end date/);
		});

		it('propagates parentMeetingId to root template across chained creates', async () => {
			const baseDate = new Date();
			baseDate.setDate(baseDate.getDate() + 7);
			const root = await service.createMeeting(testCommunity.id, {
				title: 'Root series',
				startDate: baseDate,
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});

			const { meeting: i1 } = await service.createNextMeetingInstance(root.id, {
				notify: false,
			});
			const { meeting: i2 } = await service.createNextMeetingInstance(i1.id, {
				notify: false,
			});

			// Ambas instancias deben apuntar al root, no formar cadena.
			expect(i1.parentMeetingId).toBe(root.id);
			expect(i2.parentMeetingId).toBe(root.id);
		});
	});

	describe('updateMeeting with scope', () => {
		const futureDate = (daysFromNow: number) => {
			const d = new Date();
			d.setDate(d.getDate() + daysFromNow);
			return d;
		};

		const pastDate = (daysAgo: number) => {
			const d = new Date();
			d.setDate(d.getDate() - daysAgo);
			return d;
		};

		it('scope=this updates only the target instance', async () => {
			const template = await service.createMeeting(testCommunity.id, {
				title: 'Series A',
				startDate: futureDate(7),
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});
			const { meeting: instance } = await service.createNextMeetingInstance(template.id, {
				notify: false,
			});

			await service.updateMeeting(instance.id, { title: 'Modified' }, 'this');

			const reloadedTemplate = await service.getMeetingById(template.id);
			const reloadedInstance = await service.getMeetingById(instance.id);

			expect(reloadedInstance?.title).toBe('Modified');
			expect(reloadedTemplate?.title).toBe('Series A');
		});

		it('scope=all updates root template + propagates non-date fields to all instances', async () => {
			const template = await service.createMeeting(testCommunity.id, {
				title: 'Original Title',
				startDate: futureDate(7),
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});
			const { meeting: instance } = await service.createNextMeetingInstance(template.id, {
				notify: false,
			});

			await service.updateMeeting(
				template.id,
				{ title: 'New Title', durationMinutes: 90 },
				'all',
			);

			const reloadedTemplate = await service.getMeetingById(template.id);
			const reloadedInstance = await service.getMeetingById(instance.id);

			expect(reloadedTemplate?.title).toBe('New Title');
			expect(reloadedTemplate?.durationMinutes).toBe(90);
			expect(reloadedInstance?.title).toBe('New Title');
			expect(reloadedInstance?.durationMinutes).toBe(90);
		});

		it('scope=all does NOT propagate startDate (instances keep their original times)', async () => {
			const template = await service.createMeeting(testCommunity.id, {
				title: 'Stable Schedule',
				startDate: futureDate(7),
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});
			const { meeting: instance } = await service.createNextMeetingInstance(template.id, {
				notify: false,
			});
			const originalInstanceDate = new Date(instance.startDate).getTime();

			const newTime = futureDate(30);
			await service.updateMeeting(template.id, { startDate: newTime }, 'all');

			const reloadedInstance = await service.getMeetingById(instance.id);
			expect(new Date(reloadedInstance!.startDate).getTime()).toBe(originalInstanceDate);
		});

		it('scope=all_future propagates non-date fields only to instances at/after cutoff', async () => {
			// Crear template + 1 instancia futura
			const template = await service.createMeeting(testCommunity.id, {
				title: 'Old Title',
				startDate: futureDate(7),
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});
			const { meeting: instance } = await service.createNextMeetingInstance(template.id, {
				notify: false,
			});

			// Inyectar una instancia "pasada" directamente con queryBuilder para simular historial
			const pastInstance = await AppDataSource.getRepository(CommunityMeeting).save({
				communityId: testCommunity.id,
				title: 'Old Title',
				startDate: pastDate(14),
				durationMinutes: 60,
				parentMeetingId: template.id,
				isRecurrenceTemplate: true,
			} as any);

			// Llamar update desde el template con scope=all_future
			await service.updateMeeting(template.id, { title: 'Refreshed' }, 'all_future');

			const reloadedFuture = await service.getMeetingById(instance.id);
			const reloadedPast = await service.getMeetingById((pastInstance as any).id);
			const reloadedTemplate = await service.getMeetingById(template.id);

			expect(reloadedTemplate?.title).toBe('Refreshed');
			expect(reloadedFuture?.title).toBe('Refreshed');
			expect(reloadedPast?.title).toBe('Old Title');
		});
	});

	describe('deleteMeeting with scope', () => {
		const futureDate = (daysFromNow: number) => {
			const d = new Date();
			d.setDate(d.getDate() + daysFromNow);
			return d;
		};

		it('scope=this deletes only the target instance', async () => {
			const template = await service.createMeeting(testCommunity.id, {
				title: 'Series B',
				startDate: futureDate(7),
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});
			const { meeting: instance } = await service.createNextMeetingInstance(template.id, {
				notify: false,
			});

			await service.deleteMeeting(instance.id, 'this');

			const reloadedTemplate = await service.getMeetingById(template.id);
			const reloadedInstance = await service.getMeetingById(instance.id);

			expect(reloadedTemplate).toBeDefined();
			expect(reloadedInstance).toBeNull();
		});

		it('scope=all deletes template + all instances', async () => {
			const template = await service.createMeeting(testCommunity.id, {
				title: 'Series C',
				startDate: futureDate(7),
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});
			const { meeting: instance1 } = await service.createNextMeetingInstance(template.id, {
				notify: false,
			});
			const { meeting: instance2 } = await service.createNextMeetingInstance(instance1.id, {
				notify: false,
			});

			await service.deleteMeeting(template.id, 'all');

			expect(await service.getMeetingById(template.id)).toBeNull();
			expect(await service.getMeetingById(instance1.id)).toBeNull();
			expect(await service.getMeetingById(instance2.id)).toBeNull();
		});

		it('scope=all_future deletes current+future, keeps past, severs recurrence', async () => {
			const template = await service.createMeeting(testCommunity.id, {
				title: 'Series D',
				startDate: futureDate(7),
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});

			// Inyectar instancia pasada
			const pastInstance = await AppDataSource.getRepository(CommunityMeeting).save({
				communityId: testCommunity.id,
				title: 'Past Instance',
				startDate: (() => {
					const d = new Date();
					d.setDate(d.getDate() - 14);
					return d;
				})(),
				durationMinutes: 60,
				parentMeetingId: template.id,
				isRecurrenceTemplate: true,
			} as any);

			const { meeting: futureInstance } = await service.createNextMeetingInstance(template.id, {
				notify: false,
			});

			// Borrar desde la futureInstance con scope=all_future
			await service.deleteMeeting(futureInstance.id, 'all_future');

			const reloadedPast = await service.getMeetingById((pastInstance as any).id);
			const reloadedFuture = await service.getMeetingById(futureInstance.id);
			const reloadedTemplate = await service.getMeetingById(template.id);

			// Past survives
			expect(reloadedPast).toBeDefined();
			expect(reloadedPast!.id).toBe((pastInstance as any).id);
			// Future is gone
			expect(reloadedFuture).toBeNull();
			// Template still exists but recurrence severed
			expect(reloadedTemplate).toBeDefined();
			expect(reloadedTemplate!.recurrenceFrequency).toBeNull();
			expect(reloadedTemplate!.isRecurrenceTemplate).toBe(false);
		});
	});

	describe('exceptionType=cancelled handling', () => {
		const futureDate = (daysFromNow: number) => {
			const d = new Date();
			d.setDate(d.getDate() + daysFromNow);
			return d;
		};

		it('cancelled instance is excluded from getMeetings listing', async () => {
			const m1 = await service.createMeeting(testCommunity.id, {
				title: 'Alive',
				startDate: futureDate(7),
				durationMinutes: 60,
			});
			const m2 = await service.createMeeting(testCommunity.id, {
				title: 'Cancelled',
				startDate: futureDate(14),
				durationMinutes: 60,
			});

			// Marcar m2 como cancelled
			await AppDataSource.getRepository(CommunityMeeting).update(m2.id, {
				exceptionType: 'cancelled',
			});

			const meetings = await service.getMeetings(testCommunity.id);
			const titles = meetings.map((m) => m.title);
			expect(titles).toContain('Alive');
			expect(titles).not.toContain('Cancelled');
		});

		it('getPublicAttendanceData returns null for cancelled meeting', async () => {
			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Cancelled Public',
				startDate: futureDate(7),
				durationMinutes: 60,
			});
			await AppDataSource.getRepository(CommunityMeeting).update(meeting.id, {
				exceptionType: 'cancelled',
			});

			const data = await service.getPublicAttendanceData(testCommunity.id, meeting.id);
			expect(data).toBeNull();
		});

		it('notifyMembersOfMeeting does NOT send for cancelled meeting', async () => {
			(globalThis as any).__sentEmails = [];

			const p = await TestDataFactory.createTestParticipant(testRetreat.id, {
				email: 'will-not-receive@example.com',
			});
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id, {
				state: 'active_member',
			});

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'About to be cancelled',
				startDate: futureDate(7),
				durationMinutes: 60,
			});

			// Pausa por fire-and-forget de createMeeting + reset por defensa. Con el
			// feature flag OFF el createMeeting no envía nada; con ON sí — el reset
			// nos aísla en ambos casos.
			await new Promise((r) => setTimeout(r, 50));
			(globalThis as any).__sentEmails = [];

			await AppDataSource.getRepository(CommunityMeeting).update(meeting.id, {
				exceptionType: 'cancelled',
			});

			await service.notifyMembersOfMeeting(meeting.id);
			await new Promise((r) => setTimeout(r, 30));

			const sent = (globalThis as any).__sentEmails || [];
			expect(sent.length).toBe(0);
		});
	});

	describe('getMembers - Attendance Rate', () => {
		it('should return 0% for members with no attendance', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const members = await service.getMembers(testCommunity.id);

			expect(members.length).toBe(1);
			expect(members[0].lastMeetingsAttendanceRate).toBe(0);
			expect(members[0].lastMeetingsFrequency).toBe('none');
		});

		it('should return 100% for members attending all meetings', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create 3 meetings
			const meeting1 = await service.createMeeting(testCommunity.id, {
				title: 'Meeting 1',
				startDate: new Date(),
				durationMinutes: 60,
			});
			const meeting2 = await service.createMeeting(testCommunity.id, {
				title: 'Meeting 2',
				startDate: new Date(),
				durationMinutes: 60,
			});
			const meeting3 = await service.createMeeting(testCommunity.id, {
				title: 'Meeting 3',
				startDate: new Date(),
				durationMinutes: 60,
			});

			// Attend all meetings
			await service.recordAttendance(meeting1.id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meeting2.id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meeting3.id, [{ memberId: member.id, attended: true }]);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsAttendanceRate).toBe(100);
			expect(members[0].lastMeetingsFrequency).toBe('high');
		});

		it('cuenta una reunión asistida aunque sea anterior al joinedAt (alta durante la reunión)', async () => {
			// Repro del "0% falso": la reunión empezó ANTES de que el miembro se uniera
			// (se le dio de alta durante la propia reunión), pero tiene asistencia
			// registrada. La reunión debe contar → 100%, no 0%.
			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Reunión en curso',
				startDate: new Date(Date.now() - 60 * 60 * 1000), // hace 1 hora
				durationMinutes: 60,
			});

			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			// joinedAt se fija al insertar (ahora) → posterior al startDate de la reunión.
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			await service.recordAttendance(meeting.id, [{ memberId: member.id, attended: true }]);

			const members = await service.getMembers(testCommunity.id);
			const everardo = members.find((m) => m.id === member.id)!;

			expect(everardo.lastMeetingsAttendanceRate).toBe(100);
			expect(everardo.lastMeetingsFrequency).toBe('high');
		});

		it('NO penaliza con reuniones anteriores al ingreso a las que el miembro no asistió', async () => {
			// La reunión previa al ingreso, SIN registro de asistencia, no entra al
			// denominador (se mantiene la intención original del cálculo).
			await service.createMeeting(testCommunity.id, {
				title: 'Reunión previa al ingreso',
				startDate: new Date(Date.now() - 60 * 60 * 1000),
				durationMinutes: 60,
			});
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsAttendanceRate).toBe(0);
			expect(members[0].lastMeetingsFrequency).toBe('none');
		});

		it('should calculate rate for members with partial attendance', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create 4 meetings
			const meetings = [];
			for (let i = 0; i < 4; i++) {
				const meeting = await service.createMeeting(testCommunity.id, {
					title: `Meeting ${i}`,
					startDate: new Date(),
					durationMinutes: 60,
				});
				meetings.push(meeting);
			}

			// Attend 2 out of 4 meetings
			await service.recordAttendance(meetings[0].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[1].id, [{ memberId: member.id, attended: false }]);
			await service.recordAttendance(meetings[2].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[3].id, [{ memberId: member.id, attended: false }]);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsAttendanceRate).toBe(50);
			expect(members[0].lastMeetingsFrequency).toBe('medium');
		});

		it('should categorize high frequency (>=75%)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create 4 meetings
			const meetings = [];
			for (let i = 0; i < 4; i++) {
				const meeting = await service.createMeeting(testCommunity.id, {
					title: `Meeting ${i}`,
					startDate: new Date(),
					durationMinutes: 60,
				});
				meetings.push(meeting);
			}

			// Attend 3 out of 4 (75%)
			await service.recordAttendance(meetings[0].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[1].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[2].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[3].id, [{ memberId: member.id, attended: false }]);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsFrequency).toBe('high');
		});

		it('should categorize medium frequency (25-74%)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create 4 meetings
			const meetings = [];
			for (let i = 0; i < 4; i++) {
				const meeting = await service.createMeeting(testCommunity.id, {
					title: `Meeting ${i}`,
					startDate: new Date(),
					durationMinutes: 60,
				});
				meetings.push(meeting);
			}

			// Attend 2 out of 4 (50%)
			await service.recordAttendance(meetings[0].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[1].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[2].id, [{ memberId: member.id, attended: false }]);
			await service.recordAttendance(meetings[3].id, [{ memberId: member.id, attended: false }]);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsFrequency).toBe('medium');
		});

		it('should categorize low frequency (1-24%)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create 5 meetings
			const meetings = [];
			for (let i = 0; i < 5; i++) {
				const meeting = await service.createMeeting(testCommunity.id, {
					title: `Meeting ${i}`,
					startDate: new Date(),
					durationMinutes: 60,
				});
				meetings.push(meeting);
			}

			// Attend 1 out of 5 (20%)
			await service.recordAttendance(meetings[0].id, [{ memberId: member.id, attended: true }]);
			await service.recordAttendance(meetings[1].id, [{ memberId: member.id, attended: false }]);
			await service.recordAttendance(meetings[2].id, [{ memberId: member.id, attended: false }]);
			await service.recordAttendance(meetings[3].id, [{ memberId: member.id, attended: false }]);
			await service.recordAttendance(meetings[4].id, [{ memberId: member.id, attended: false }]);

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsFrequency).toBe('low');
		});

		it('should categorize none frequency (0%)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Create meetings but don't attend
			await service.createMeeting(testCommunity.id, {
				title: 'Meeting 1',
				startDate: new Date(),
				durationMinutes: 60,
			});

			const members = await service.getMembers(testCommunity.id);

			expect(members[0].lastMeetingsFrequency).toBe('none');
		});

		it('should sort by attendance rate descending', async () => {
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p3 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const m1 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p1.id);
			const m2 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p2.id);
			const m3 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p3.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			});

			// m1 attends, m2 and m3 don't
			await service.recordAttendance(meeting.id, [
				{ memberId: m1.id, attended: true },
				{ memberId: m2.id, attended: false },
				{ memberId: m3.id, attended: false },
			]);

			const members = await service.getMembers(testCommunity.id);

			// Should be sorted: m1 (100%), then m2 and m3 (0%)
			expect(members[0].id).toBe(m1.id);
			expect(members[0].lastMeetingsAttendanceRate).toBe(100);
		});
	});

	// Participantes que ejercieron su derecho de borrado de datos
	// (participant.dataDeletedAt != null → nombre anonimizado a "(eliminado)",
	// email deleted-<id>@local) NO deben reaparecer en NINGÚN listado ni conteo
	// de la comunidad. Cada método que carga miembros con su participant filtra
	// `dataDeletedAt IS NULL`. Estos tests son la red de seguridad de esa regla.
	// Doc: docs/features/community-data-deleted-exclusion.md
	describe('exclusión de participantes con datos borrados (dataDeletedAt)', () => {
		const partRepo = () =>
			AppDataSource.getRepository(require('@/entities/participant.entity').Participant);

		// Crea dos participantes en el retiro: uno normal y uno anonimizado por
		// borrado de datos. Devuelve ambos para que cada test los use según necesite.
		async function makeNormalAndDeleted() {
			const pNormal = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pDeleted = await TestDataFactory.createTestParticipant(testRetreat.id);
			await partRepo().update(pNormal.id, { firstName: 'Normal', lastName: 'User' });
			// Simula anonymizeParticipantByToken: nombre anonimizado + dataDeletedAt.
			await partRepo().update(pDeleted.id, {
				firstName: '(eliminado)',
				lastName: '',
				dataDeletedAt: new Date(),
			});
			return { pNormal, pDeleted };
		}

		it('getMembers excluye al miembro con datos borrados del roster', async () => {
			const { pNormal, pDeleted } = await makeNormalAndDeleted();
			await service.addMember(testCommunity.id, pNormal.id);
			await service.addMember(testCommunity.id, pDeleted.id);

			const members = await service.getMembers(testCommunity.id);

			expect(members.length).toBe(1);
			expect(members[0].participant.firstName).toBe('Normal');
			expect(
				members.find((m: any) => m.participant?.firstName === '(eliminado)'),
			).toBeUndefined();
		});

		it('getPotentialMembers no ofrece al participante con datos borrados como candidato', async () => {
			const { pNormal, pDeleted } = await makeNormalAndDeleted();

			const candidates = await service.getPotentialMembers(testCommunity.id, testRetreat.id);

			const ids = candidates.map((c: any) => c.id);
			expect(ids).toContain(pNormal.id);
			expect(ids).not.toContain(pDeleted.id);
			expect(
				candidates.find((c: any) => c.firstName === '(eliminado)'),
			).toBeUndefined();
		});

		it('getDashboardStats no cuenta al miembro con datos borrados en totales ni distribución', async () => {
			const { pNormal, pDeleted } = await makeNormalAndDeleted();
			await TestDataFactory.createTestCommunityMember(testCommunity.id, pNormal.id, {
				state: MemberStateEnum.Enum.active_member,
			});
			await TestDataFactory.createTestCommunityMember(testCommunity.id, pDeleted.id, {
				state: MemberStateEnum.Enum.active_member,
			});

			const stats = await service.getDashboardStats(testCommunity.id);

			// Solo el miembro normal cuenta — el borrado no infla el padrón.
			expect(stats.memberCount).toBe(1);
			expect(
				stats.memberStateDistribution.find((s: any) => s.state === 'active_member')?.count,
			).toBe(1);
		});
	});

	describe('getPublicAttendanceData', () => {
		it('should return data for valid community and meeting', async () => {
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id, {
				firstName: 'Juan',
				lastName: 'Perez',
			});
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id, {
				firstName: 'Maria',
				lastName: 'Garcia',
			});
			const m1 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p1.id);
			const m2 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p2.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Public Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			});

			await service.recordAttendance(meeting.id, [
				{ memberId: m1.id, attended: true },
				{ memberId: m2.id, attended: false },
			]);

			const data = await service.getPublicAttendanceData(testCommunity.id, meeting.id);

			expect(data).toBeDefined();
			expect(data.meetingId).toBe(meeting.id);
			expect(data.meetingTitle).toBe('Public Meeting');
			expect(data.communityId).toBe(testCommunity.id);
			expect(data.members.length).toBe(2);

			// Find Juan and Maria by name (order not guaranteed)
			const juan = data.members.find((m: any) => m.participant.firstName === 'Juan');
			const maria = data.members.find((m: any) => m.participant.firstName === 'Maria');

			expect(juan).toBeDefined();
			expect(juan.participant.lastName).toBe('Perez');
			expect(juan.attended).toBe(true);

			expect(maria).toBeDefined();
			expect(maria.participant.lastName).toBe('Garcia');
			expect(maria.attended).toBe(false);
		});

		it('should return null for non-existent community', async () => {
			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			});

			const data = await service.getPublicAttendanceData('non-community-id', meeting.id);

			expect(data).toBeNull();
		});

		it('should return null for non-existent meeting', async () => {
			const data = await service.getPublicAttendanceData(testCommunity.id, 'non-meeting-id');

			expect(data).toBeNull();
		});

		it('should include all members with attendance status', async () => {
			const participants = await Promise.all([
				TestDataFactory.createTestParticipant(testRetreat.id),
				TestDataFactory.createTestParticipant(testRetreat.id),
				TestDataFactory.createTestParticipant(testRetreat.id),
			]);

			const members = await Promise.all(
				participants.map((p) => TestDataFactory.createTestCommunityMember(testCommunity.id, p.id)),
			);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Meeting',
				startDate: new Date(),
				durationMinutes: 60,
			});

			await service.recordAttendance(meeting.id, [
				{ memberId: members[0].id, attended: true },
				{ memberId: members[1].id, attended: false },
				{ memberId: members[2].id, attended: true },
			]);

			const data = await service.getPublicAttendanceData(testCommunity.id, meeting.id);

			expect(data.members.length).toBe(3);
			expect(data.members.every((m: any) => 'attended' in m)).toBe(true);
		});

		it('incluye TODOS los miembros sin filtrar por state', async () => {
			// La vista pública de asistencia muestra el padrón completo: el coordinador
			// pasa lista contra todos, sin que el state de seguimiento oculte a nadie.
			// El state se expone para que la UI pueda agrupar/etiquetar visualmente.
			const pActive1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pActive2 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pPending = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pAnotherGroup = await TestDataFactory.createTestParticipant(testRetreat.id);

			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(pActive1.id, { firstName: 'Active', lastName: 'One' });
			await partRepo.update(pActive2.id, { firstName: 'Active', lastName: 'Two' });
			await partRepo.update(pPending.id, { firstName: 'Pending', lastName: 'User' });
			await partRepo.update(pAnotherGroup.id, { firstName: 'Other', lastName: 'Group' });

			const m1 = await service.addMember(testCommunity.id, pActive1.id);
			const m2 = await service.addMember(testCommunity.id, pActive2.id);
			const m3 = await service.addMember(testCommunity.id, pPending.id);
			const m4 = await service.addMember(testCommunity.id, pAnotherGroup.id);

			await service.updateMemberState(m3.id, 'pending_verification', testUser.id);
			await service.updateMemberState(m4.id, 'another_group', testUser.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Meeting filtrado',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			});

			const data = await service.getPublicAttendanceData(testCommunity.id, meeting.id);

			// 2 active + 1 pending + 1 another_group = 4. Ninguno queda fuera.
			expect(data!.members.length).toBe(4);
			const firstNames = data!.members.map((m: any) => m.participant.firstName).sort();
			expect(firstNames).toEqual(['Active', 'Active', 'Other', 'Pending']);
			// El roster expone el state para que la UI pueda agrupar visualmente
			const states = data!.members.map((m: any) => m.state).sort();
			expect(states).toEqual(['active_member', 'active_member', 'another_group', 'pending_verification']);
		});

		it('excluye participantes con datos borrados (dataDeletedAt → "(eliminado)")', async () => {
			const pNormal = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pDeleted = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(pNormal.id, { firstName: 'Normal', lastName: 'User' });
			// Simula anonymizeParticipantByToken: nombre anonimizado + dataDeletedAt.
			await partRepo.update(pDeleted.id, { firstName: '(eliminado)', lastName: '', dataDeletedAt: new Date() });

			await service.addMember(testCommunity.id, pNormal.id);
			await service.addMember(testCommunity.id, pDeleted.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Roster sin eliminados',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			});

			const data = await service.getPublicAttendanceData(testCommunity.id, meeting.id);

			expect(data!.members.length).toBe(1);
			expect(data!.members[0].participant.firstName).toBe('Normal');
			expect(
				data!.members.find((m: any) => m.participant.firstName === '(eliminado)'),
			).toBeUndefined();
		});
	});

	describe('importFromRetreat - Edge Cases', () => {
		it('should return existing members for already imported participants', async () => {
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id);

			// Import p1 first
			await service.importFromRetreat(testCommunity.id, testRetreat.id, [p1.id]);

			// Try to import both - should return both (p1 existing, p2 new)
			const result = await service.importFromRetreat(testCommunity.id, testRetreat.id, [
				p1.id,
				p2.id,
			]);

			expect(result.length).toBe(2); // Both returned
			expect(result[0].participantId).toBe(p1.id);
			expect(result[1].participantId).toBe(p2.id);
		});

		it('should handle empty participant list', async () => {
			const result = await service.importFromRetreat(testCommunity.id, testRetreat.id, []);

			expect(result.length).toBe(0);
		});

		it('should not validate retreat existence', async () => {
			// The service doesn't validate retreatId, it just tries to add members
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);

			// This will work because retreatId isn't validated against participant's retreat
			const result = await service.importFromRetreat(testCommunity.id, 'any-retreat-id', [p.id]);

			expect(result.length).toBe(1);
		});

		it('should set initial state to active_member', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);

			await service.importFromRetreat(testCommunity.id, testRetreat.id, [p.id]);

			const members = await service.getMembers(testCommunity.id);
			expect(members[0].state).toBe('active_member');
		});

		it('should handle non-existent participants with foreign key error', async () => {
			// This will cause a foreign key constraint error
			// The service doesn't handle this gracefully, so we expect it to fail
			await expect(
				service.importFromRetreat(testCommunity.id, testRetreat.id, ['non-existent-id']),
			).rejects.toThrow();
		});
	});

	describe('createPublicJoinRequest — notificaciones', () => {
		const getSent = () => ((globalThis as any).__sentEmails as any[]) || [];

		beforeEach(() => {
			(globalThis as any).__sentEmails = [];
		});

		it('crea el miembro y dispara notificaciones a admins + solicitante', async () => {
			const adminUser = await TestDataFactory.createTestUser({
				email: 'admin@test.com',
				displayName: 'Admin User',
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

			const member = await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Juan',
				lastName: 'Pérez',
				email: 'juan@test.com',
				cellPhone: '555-1234',
			});

			expect(member).toBeTruthy();
			expect(member!.state).toBe('pending_verification');

			// Esperar a que la fire-and-forget termine
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			expect(sent.length).toBeGreaterThanOrEqual(2);

			const adminEmail = sent.find((e) => e.to === 'admin@test.com');
			expect(adminEmail).toBeTruthy();
			expect(adminEmail.subject).toContain(testCommunity.name);
			expect(adminEmail.html).toContain('Juan');
			expect(adminEmail.html).toContain('juan@test.com');

			const requesterEmail = sent.find((e) => e.to === 'juan@test.com');
			expect(requesterEmail).toBeTruthy();
			expect(requesterEmail.subject).toContain('Recibimos tu solicitud');
			expect(requesterEmail.html).toContain('Juan');
		});

		it('escapa HTML del solicitante para prevenir XSS en el email', async () => {
			const adminUser = await TestDataFactory.createTestUser({
				email: 'admin2@test.com',
				displayName: 'Admin Owner',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: adminUser.id,
					role: 'owner',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);

			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: '<script>alert(1)</script>',
				lastName: 'Hacker',
				email: 'hack@test.com',
			});

			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			const adminEmail = sent.find((e) => e.to === 'admin2@test.com');
			expect(adminEmail).toBeTruthy();
			expect(adminEmail.html).not.toContain('<script>alert(1)</script>');
			expect(adminEmail.html).toContain('&lt;script&gt;');
		});

		it('NO falla la creación si la notificación falla', async () => {
			// notifyJoinRequest tiene su propio try/catch — si todo falla, la creación
			// del miembro debe seguir devolviendo el resultado.
			const memberPromise = service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Robust',
				lastName: 'Test',
				email: 'robust@test.com',
			});

			await expect(memberPromise).resolves.toBeTruthy();
		});

		it('envía solo el email al solicitante si no hay admins activos', async () => {
			// El factory crea un admin owner por defecto — lo borramos para este test
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: testCommunity.id });

			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Solo',
				lastName: 'User',
				email: 'solo@test.com',
			});

			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			// Sin admins, solo debe haber el email al solicitante
			expect(sent.length).toBe(1);
			expect(sent[0].to).toBe('solo@test.com');
			expect(sent[0].subject).toContain('Recibimos tu solicitud');
		});

		it('notifica a TODOS los admins activos (múltiples destinatarios)', async () => {
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const admin1 = await TestDataFactory.createTestUser({ email: 'admin1@test.com' });
			const admin2 = await TestDataFactory.createTestUser({ email: 'admin2@test.com' });
			const admin3 = await TestDataFactory.createTestUser({ email: 'admin3@test.com' });
			for (const [user, role] of [
				[admin1, 'admin'],
				[admin2, 'admin'],
				[admin3, 'owner'],
			] as const) {
				await adminRepo.save(
					adminRepo.create({
						communityId: testCommunity.id,
						userId: user.id,
						role,
						status: 'active',
						invitedBy: testUser.id,
						invitedAt: new Date(),
						acceptedAt: new Date(),
					}),
				);
			}

			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Multi',
				lastName: 'Admins',
				email: 'multi@test.com',
			});
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			const adminRecipients = sent.map((e) => e.to).filter((to) => to !== 'multi@test.com');
			expect(adminRecipients).toContain('admin1@test.com');
			expect(adminRecipients).toContain('admin2@test.com');
			expect(adminRecipients).toContain('admin3@test.com');
		});

		it('omite admin sin email configurado (user.email vacío)', async () => {
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			// Admin con user que NO tiene email — el factory siempre asigna pero
			// vamos a crear uno y vaciar el email manualmente.
			const noEmailUser = await TestDataFactory.createTestUser({ email: 'temp@test.com' });
			const userRepo = AppDataSource.getRepository(User);
			await userRepo.update(noEmailUser.id, { email: '' as any });
			await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: noEmailUser.id,
					role: 'admin',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);

			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'NoEmail',
				lastName: 'Admin',
				email: 'requester@test.com',
			});
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			// Solicitante sí recibe
			expect(sent.find((e) => e.to === 'requester@test.com')).toBeTruthy();
			// Admin sin email NO recibe (no debe haber email con to=''
			expect(sent.find((e) => e.to === '')).toBeUndefined();
		});

		it('no crashea si la comunidad ya no existe al notificar', async () => {
			// Pre-crear miembro pero borrar la comunidad antes de que notifyJoinRequest se dispare
			// Llamando notifyJoinRequest directamente con communityId inexistente
			const fakeParticipant: any = {
				firstName: 'Ghost',
				lastName: 'Test',
				email: 'ghost@test.com',
				cellPhone: '',
			};

			await expect(
				service.notifyJoinRequest('non-existent-community-id', fakeParticipant),
			).resolves.toBeUndefined();
		});

		it('rechaza con ALREADY_MEMBER al detectar duplicado dentro de la transacción', async () => {
			// Primera solicitud OK
			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'First',
				lastName: 'Try',
				email: 'dup@test.com',
			});

			// Segunda solicitud con el mismo email debe fallar con ALREADY_MEMBER
			await expect(
				service.createPublicJoinRequest(testCommunity.id, {
					firstName: 'Second',
					lastName: 'Try',
					email: 'dup@test.com',
				}),
			).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
		});

		it('match case-insensitive del email al detectar duplicado', async () => {
			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Lower',
				lastName: 'Case',
				email: 'mixed@TEST.com',
			});

			await expect(
				service.createPublicJoinRequest(testCommunity.id, {
					firstName: 'Upper',
					lastName: 'Case',
					email: 'MIXED@test.com',
				}),
			).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
		});

		it('NO notifica a admins con status=pending o role=viewer', async () => {
			// Admin pendiente
			const pendingUser = await TestDataFactory.createTestUser({ email: 'pending@test.com' });
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: pendingUser.id,
					role: 'admin',
					status: 'pending',
					invitedBy: testUser.id,
					invitedAt: new Date(),
				}),
			);

			await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Tester',
				lastName: 'User',
				email: 'tester@test.com',
			});

			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			// pending admin no debe recibir
			expect(sent.find((e) => e.to === 'pending@test.com')).toBeUndefined();
			// solicitante sí
			expect(sent.find((e) => e.to === 'tester@test.com')).toBeTruthy();
		});
	});

	// ─── G: Audit log ─────────────────────────────────────────────────────

	describe('CommunityAuditLog (G)', () => {
		it('persiste un evento de audit directo via repo (smoke test)', async () => {
			// Persistir directo via repo evita el path-alias issue del singleton service
			// dentro del test ESM. El service real lo prueba el E2E HTTP.
			const { CommunityAuditLog } = await import('@/entities/communityAuditLog.entity');
			const repo = AppDataSource.getRepository(CommunityAuditLog);
			const entry = repo.create({
				action: 'community.update',
				resourceType: 'community',
				resourceId: testCommunity.id,
				communityId: testCommunity.id,
				actorUserId: testUser.id,
				metadata: JSON.stringify({ changedFields: ['name'] }),
				ipAddress: '127.0.0.1',
				userAgent: 'TestRunner/1.0',
			});
			await repo.save(entry);

			const rows = await repo.find({
				where: { communityId: testCommunity.id, action: 'community.update' },
			});
			expect(rows.length).toBeGreaterThanOrEqual(1);
			expect(rows[0].actorUserId).toBe(testUser.id);
			expect(rows[0].ipAddress).toBe('127.0.0.1');
		});

		it('audit service silencia errores (no throw aunque insert falle)', async () => {
			const { CommunityAuditService } = await import('@/services/communityAuditService');
			const audit = new CommunityAuditService();
			await expect(
				audit.log({
					action: 'test.action',
					resourceType: 'test',
				} as any),
			).resolves.toBeUndefined();
		});
	});

	// ─── P2: Trimming de PII según rol del viewer ──────────────────────────

	describe('getMembersForViewer — SECURITY trimming', () => {
		const setupCommunityWithPiiMember = async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id);
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, {
				email: 'pii@test.com',
				cellPhone: '555-1234',
				homePhone: '555-9999',
				workPhone: '555-0000',
				street: 'Calle Secreta 42',
				postalCode: '06100',
				neighborhood: 'Roma Norte',
				hasMedication: true,
				emergencyContact1Name: 'Mamá',
				emergencyContact1CellPhone: '555-MOM',
			});
			await service.addMember(community.id, p.id);
			return community;
		};

		it('OWNER: ve PII completa (dirección, médico, contactos de emergencia)', async () => {
			const community = await setupCommunityWithPiiMember();
			// testUser es owner (creado por TestDataFactory.createTestCommunity)
			const members = await service.getMembersForViewer(community.id, {
				userId: testUser.id,
				isSuperadmin: false,
			});

			expect(members.length).toBe(1);
			const p = (members[0] as any).participant;
			expect(p.email).toBe('pii@test.com');
			expect(p.cellPhone).toBe('555-1234');
			expect(p.homePhone).toBe('555-9999');
			expect(p.street).toBe('Calle Secreta 42');
			expect(p.hasMedication).toBe(true);
			expect(p.emergencyContact1Name).toBe('Mamá');
			expect(p._trimmed).toBeUndefined();
		});

		it('SUPERADMIN: ve PII completa aunque no sea miembro de la community', async () => {
			const community = await setupCommunityWithPiiMember();
			const outsiderUser = await TestDataFactory.createTestUser({ email: 'outsider@test.com' });
			const members = await service.getMembersForViewer(community.id, {
				userId: outsiderUser.id,
				isSuperadmin: true,
			});

			expect(members.length).toBe(1);
			const p = (members[0] as any).participant;
			expect(p.street).toBe('Calle Secreta 42'); // PII visible
			expect(p._trimmed).toBeUndefined();
		});

		it('ADMIN no-owner: solo ve firstName, lastName, email, cellPhone (PII trimmed)', async () => {
			const community = await setupCommunityWithPiiMember();
			// Crear un admin distinto del owner
			const adminUser = await TestDataFactory.createTestUser({ email: 'just-admin@test.com' });
			const adminRepo = AppDataSource.getRepository(
				require('@/entities/communityAdmin.entity').CommunityAdmin,
			);
			await adminRepo.save(
				adminRepo.create({
					communityId: community.id,
					userId: adminUser.id,
					role: 'admin',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);

			const members = await service.getMembersForViewer(community.id, {
				userId: adminUser.id,
				isSuperadmin: false,
			});

			expect(members.length).toBe(1);
			const p = (members[0] as any).participant;
			// Campos visibles
			expect(p.email).toBe('pii@test.com');
			expect(p.cellPhone).toBe('555-1234');
			expect(p.firstName).toBeTruthy();
			expect(p.lastName).toBeTruthy();
			expect(p._trimmed).toBe(true);
			// Campos sensibles NO deben estar
			expect(p.street).toBeUndefined();
			expect(p.postalCode).toBeUndefined();
			expect(p.neighborhood).toBeUndefined();
			expect(p.homePhone).toBeUndefined();
			expect(p.workPhone).toBeUndefined();
			expect(p.hasMedication).toBeUndefined();
			expect(p.emergencyContact1Name).toBeUndefined();
			expect(p.emergencyContact1CellPhone).toBeUndefined();
		});

		it('admin non-owner recibe el overlay top-level (no solo participant trimmed)', async () => {
			// Setup: admin non-owner + miembro con overlay
			const adminUser = await TestDataFactory.createTestUser({
				email: 'overlay-admin@test.com',
			});
			const community = await TestDataFactory.createTestCommunity(testUser.id);
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.save(
				adminRepo.create({
					communityId: community.id,
					userId: adminUser.id,
					role: 'admin',
					status: 'active',
					acceptedAt: new Date(),
				}),
			);
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, {
				firstName: 'JosephReal',
				lastName: 'PerezReal',
				email: 'real@test.com',
			});
			const member = await service.addMember(community.id, p.id);
			// Owner pone overlay (esta editar requiere owner — usamos testUser que es owner)
			await service.updateMemberProfile(community.id, member.id, {
				firstName: 'JuanOverlay',
				lastName: 'PerezOverlay',
				email: 'overlay@test.com',
			});

			// Admin non-owner pide lista
			const members = await service.getMembersForViewer(community.id, {
				userId: adminUser.id,
				isSuperadmin: false,
			});

			expect(members.length).toBe(1);
			const m = members[0] as any;
			// El overlay viene top-level — frontend usa resolveMemberProfile
			expect(m.firstName).toBe('JuanOverlay');
			expect(m.lastName).toBe('PerezOverlay');
			expect(m.email).toBe('overlay@test.com');
			// participant trimmed sigue presente como fallback
			expect(m.participant._trimmed).toBe(true);
			expect(m.participant.firstName).toBe('JosephReal');
		});

		it('getViewerRoleForCommunity retorna superadmin sin tocar BD si isSuperadmin=true', async () => {
			const role = await service.getViewerRoleForCommunity('any-cid', 'any-uid', true);
			expect(role).toBe('superadmin');
		});

		it('getViewerRoleForCommunity retorna null si el user no es admin activo', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id);
			const outsider = await TestDataFactory.createTestUser({ email: 'no-role@test.com' });
			const role = await service.getViewerRoleForCommunity(outsider.id, community.id, false);
			expect(role).toBeNull();
		});

		it('getViewerRoleForCommunity diferencia owner de admin', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id);
			// testUser es owner por TestDataFactory
			const ownerRole = await service.getViewerRoleForCommunity(testUser.id, community.id, false);
			expect(ownerRole).toBe('owner');

			// Crear un admin secundario (no-owner)
			const adminUser = await TestDataFactory.createTestUser({ email: 'second-admin@test.com' });
			const adminRepo = AppDataSource.getRepository(
				require('@/entities/communityAdmin.entity').CommunityAdmin,
			);
			await adminRepo.save(
				adminRepo.create({
					communityId: community.id,
					userId: adminUser.id,
					role: 'admin',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);
			const adminRole = await service.getViewerRoleForCommunity(adminUser.id, community.id, false);
			expect(adminRole).toBe('admin');
		});
	});

	// ─── G4: Vista del miembro (getMyCommunitiesWithMeetings) ──────────────

	describe('getMyCommunitiesWithMeetings (G4)', () => {
		it('devuelve las comunidades donde el user es active_member', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'g4@test.com' });
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { userId: user.id });
			await service.addMember(testCommunity.id, p.id);

			const result = await service.getMyCommunitiesWithMeetings(user.id);
			expect(result.length).toBe(1);
			expect(result[0].community.id).toBe(testCommunity.id);
		});

		it('incluye hasta 3 próximas reuniones (ordenadas ASC)', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'g4m@test.com' });
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { userId: user.id });
			await service.addMember(testCommunity.id, p.id);

			// Crear 4 meetings: 3 futuras + 1 pasada — usar el repo directamente para evitar disparar emails
			const meetingRepo = AppDataSource.getRepository(
				require('@/entities/communityMeeting.entity').CommunityMeeting,
			);
			const tomorrow = new Date(Date.now() + 86_400_000);
			const inWeek = new Date(Date.now() + 7 * 86_400_000);
			const inMonth = new Date(Date.now() + 30 * 86_400_000);
			const inYear = new Date(Date.now() + 365 * 86_400_000);
			await meetingRepo.save(meetingRepo.create({ communityId: testCommunity.id, title: 'M3', startDate: inMonth, durationMinutes: 60 } as any));
			await meetingRepo.save(meetingRepo.create({ communityId: testCommunity.id, title: 'M2', startDate: inWeek, durationMinutes: 60 } as any));
			await meetingRepo.save(meetingRepo.create({ communityId: testCommunity.id, title: 'M1', startDate: tomorrow, durationMinutes: 60 } as any));
			await meetingRepo.save(meetingRepo.create({ communityId: testCommunity.id, title: 'M4', startDate: inYear, durationMinutes: 60 } as any));

			const result = await service.getMyCommunitiesWithMeetings(user.id);
			expect(result[0].upcomingMeetings.length).toBe(3);
			expect(result[0].upcomingMeetings[0].title).toBe('M1'); // más cercana primero
		});

		it('NO incluye plantillas de recurrencia', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'g4t@test.com' });
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { userId: user.id });
			await service.addMember(testCommunity.id, p.id);

			const meetingRepo = AppDataSource.getRepository(
				require('@/entities/communityMeeting.entity').CommunityMeeting,
			);
			await meetingRepo.save(meetingRepo.create({
				communityId: testCommunity.id,
				title: 'Plantilla',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
				isRecurrenceTemplate: true,
			} as any));

			const result = await service.getMyCommunitiesWithMeetings(user.id);
			expect(result[0].upcomingMeetings.length).toBe(0);
		});

		it('NO devuelve comunidades donde el user es pending_verification', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'g4pending@test.com' });
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { userId: user.id });
			const member = await service.addMember(testCommunity.id, p.id);
			await service.updateMemberState(member.id, 'pending_verification', testUser.id);

			const result = await service.getMyCommunitiesWithMeetings(user.id);
			expect(result.length).toBe(0);
		});

		it('devuelve array vacío si el user no es miembro de ninguna comunidad', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'g4lonely@test.com' });
			const result = await service.getMyCommunitiesWithMeetings(user.id);
			expect(result).toEqual([]);
		});
	});

	// ─── G3: Notificar miembros de reunión próxima ──────────────────────────

	describe('notifyMembersOfMeeting (G3)', () => {
		const getSent = () => ((globalThis as any).__sentEmails as any[]) || [];
		let prevFlag: string | undefined;
		beforeAll(() => {
			// Esta suite valida el comportamiento "createMeeting envía email" y otras
			// rutas que dependen del feature flag. Activamos explícitamente para no
			// acoplar al default global.
			prevFlag = process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED;
			process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED = 'true';
		});
		afterAll(() => {
			if (prevFlag === undefined) delete process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED;
			else process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED = prevFlag;
		});
		beforeEach(() => {
			(globalThis as any).__sentEmails = [];
		});

		it('envía email a cada miembro activo cuando se crea una reunión no-template', async () => {
			const p1 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const p2 = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p1.id, { email: 'm1@test.com' });
			await partRepo.update(p2.id, { email: 'm2@test.com' });
			await service.addMember(testCommunity.id, p1.id);
			await service.addMember(testCommunity.id, p2.id);

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Reunión Semanal',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			expect(sent.find((e) => e.to === 'm1@test.com')).toBeTruthy();
			expect(sent.find((e) => e.to === 'm2@test.com')).toBeTruthy();
			expect(sent[0].subject).toContain(testCommunity.name);
			expect(sent[0].html).toContain('Reunión Semanal');
			expect(sent[0].html).toContain('/public/attendance/');
		});

		it('invita a todos los contactables (incluye no_answer/far_from_location), excluye los SILENT', async () => {
			// Todos están invitados a la reunión: declinaciones blandas SÍ reciben.
			// Solo se excluyen canal-roto/no-contactar (EMAIL_SILENT_STATES).
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			const mkMember = async (email: string, state: string) => {
				const p = await TestDataFactory.createTestParticipant(testRetreat.id);
				await partRepo.update(p.id, { email });
				const m = await service.addMember(testCommunity.id, p.id);
				if (state !== 'active_member') await service.updateMemberState(m.id, state as any, testUser.id);
				return m;
			};

			await mkMember('active@test.com', 'active_member');
			await mkMember('noanswer@test.com', 'no_answer');
			await mkMember('faraway@test.com', 'far_from_location');
			await mkMember('paused@test.com', 'paused');
			await mkMember('dnc@test.com', 'do_not_contact');
			await mkMember('badinfo@test.com', 'wrong_contact_info');

			const meetingRepo = AppDataSource.getRepository(
				require('@/entities/communityMeeting.entity').CommunityMeeting,
			);
			const meeting = await meetingRepo.save(
				meetingRepo.create({
					communityId: testCommunity.id,
					title: 'Invitación amplia',
					startDate: new Date(Date.now() + 86_400_000),
					durationMinutes: 60,
				} as any),
			);
			(globalThis as any).__sentEmails = [];

			await service.notifyMembersOfMeeting(meeting.id, testCommunity.id);
			await new Promise((r) => setTimeout(r, 100));

			const tos = getSent().map((e) => e.to);
			expect(tos).toContain('active@test.com');
			expect(tos).toContain('noanswer@test.com');
			expect(tos).toContain('faraway@test.com');
			// SILENT: canal roto / no contactar
			expect(tos).not.toContain('paused@test.com');
			expect(tos).not.toContain('dnc@test.com');
			expect(tos).not.toContain('badinfo@test.com');
		});

		it('SECURITY: rechaza con MEETING_COMMUNITY_MISMATCH si meetingId pertenece a otra comunidad (IDOR fix)', async () => {
			// Crear segunda comunidad y un meeting en ella
			const otherUser = await TestDataFactory.createTestUser({ email: 'other-comm@test.com' });
			const otherCommunity = await TestDataFactory.createTestCommunity(otherUser.id, {
				name: 'Other Community',
			});
			const meetingRepo = AppDataSource.getRepository(
				require('@/entities/communityMeeting.entity').CommunityMeeting,
			);
			const otherMeeting = await meetingRepo.save(
				meetingRepo.create({
					communityId: otherCommunity.id,
					title: 'Reunión privada',
					startDate: new Date(Date.now() + 86_400_000),
					durationMinutes: 60,
				} as any),
			);

			// Intentar notificar con expectedCommunityId = testCommunity (otro tenant)
			await expect(
				service.notifyMembersOfMeeting(otherMeeting.id, testCommunity.id),
			).rejects.toMatchObject({ code: 'MEETING_COMMUNITY_MISMATCH' });

			// Verificar que NO se enviaron emails
			expect(getSent().length).toBe(0);
		});

		it('SECURITY: permite cuando expectedCommunityId coincide con la del meeting', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'match@test.com' });
			await service.addMember(testCommunity.id, p.id);

			const meetingRepo = AppDataSource.getRepository(
				require('@/entities/communityMeeting.entity').CommunityMeeting,
			);
			const meeting = await meetingRepo.save(
				meetingRepo.create({
					communityId: testCommunity.id,
					title: 'OK',
					startDate: new Date(Date.now() + 86_400_000),
					durationMinutes: 60,
				} as any),
			);
			(globalThis as any).__sentEmails = [];

			await service.notifyMembersOfMeeting(meeting.id, testCommunity.id);
			await new Promise((r) => setTimeout(r, 50));

			expect(getSent().find((e) => e.to === 'match@test.com')).toBeTruthy();
		});

		it('NO envía cuando es una plantilla de recurrencia (isRecurrenceTemplate=true)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'tpl@test.com' });
			await service.addMember(testCommunity.id, p.id);

			await service.createMeeting(testCommunity.id, {
				title: 'Plantilla',
				startDate: new Date(),
				recurrenceFrequency: 'weekly',
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			expect(getSent().length).toBe(0);
		});

		it('invita a todos los contactables (incl. declinados blandos), omite SILENT y sin email', async () => {
			// Todos están invitados a la reunión: pending y declinados blandos
			// (another_group/no_answer/etc) SÍ reciben. Solo se excluyen los SILENT
			// (paused/do_not_contact/wrong_contact_info) y los que no tienen email.
			const pActive = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pNoEmail = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pPending = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pAnother = await TestDataFactory.createTestParticipant(testRetreat.id);
			const pPaused = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(pActive.id, { email: 'active@test.com' });
			await partRepo.update(pNoEmail.id, { email: '' });
			await partRepo.update(pPending.id, { email: 'pending@test.com' });
			await partRepo.update(pAnother.id, { email: 'another@test.com' });
			await partRepo.update(pPaused.id, { email: 'paused@test.com' });

			await service.addMember(testCommunity.id, pActive.id);
			await service.addMember(testCommunity.id, pNoEmail.id);
			const memberPending = await service.addMember(testCommunity.id, pPending.id);
			const memberAnother = await service.addMember(testCommunity.id, pAnother.id);
			const memberPaused = await service.addMember(testCommunity.id, pPaused.id);
			await service.updateMemberState(memberPending.id, 'pending_verification', testUser.id);
			await service.updateMemberState(memberAnother.id, 'another_group', testUser.id);
			await service.updateMemberState(memberPaused.id, 'paused', testUser.id);
			(globalThis as any).__sentEmails = []; // limpiar previos

			await service.createMeeting(testCommunity.id, {
				title: 'Filter Test',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			expect(sent.find((e) => e.to === 'active@test.com')).toBeTruthy();
			expect(sent.find((e) => e.to === 'pending@test.com')).toBeTruthy();
			expect(sent.find((e) => e.to === 'another@test.com')).toBeTruthy();
			expect(sent.find((e) => e.to === '')).toBeUndefined();
			// SILENT: pausa explícita → no recibe
			expect(sent.find((e) => e.to === 'paused@test.com')).toBeUndefined();
		});
	});

	// ─── Templates en BD (refactor inline → renderTemplate) ──────────────────

	describe('renderTemplate — DB-driven email bodies', () => {
		const getSent = () => ((globalThis as any).__sentEmails as any[]) || [];
		let prevFlag: string | undefined;
		beforeAll(() => {
			// Estos tests validan el render de la plantilla cuando createMeeting
			// dispara el correo. Activamos el feature flag para esta suite.
			prevFlag = process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED;
			process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED = 'true';
		});
		afterAll(() => {
			if (prevFlag === undefined) delete process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED;
			else process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED = prevFlag;
		});
		beforeEach(() => {
			(globalThis as any).__sentEmails = [];
		});

		it('usa plantilla COMMUNITY_MEETING_INVITATION de BD cuando existe (override del inline)', async () => {
			const { MessageTemplate } = require('@/entities/messageTemplate.entity');
			const tplRepo = AppDataSource.getRepository(MessageTemplate);
			await tplRepo.save(
				tplRepo.create({
					name: 'Test global meeting invite',
					type: 'COMMUNITY_MEETING_INVITATION',
					scope: 'community',
					message:
						'Hola {{firstName}}, hay reunión en {{communityName}}: {{meetingTitle}} el {{meetingDate}}. Confirma: {{attendanceLink}}',
				} as any),
			);

			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'tpl-user@test.com', firstName: 'Maria' });
			await service.addMember(testCommunity.id, p.id);

			await service.createMeeting(testCommunity.id, {
				title: 'Reunión DB tpl',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			const email = getSent().find((e: any) => e.to === 'tpl-user@test.com');
			expect(email).toBeTruthy();
			expect(email.html).toContain('Hola Maria');
			expect(email.html).toContain('Reunión DB tpl');
			expect(email.html).toContain(testCommunity.name);
			// El link aparece como anchor (wrapTemplateHtml lo convierte) — verifica que se interpoló
			expect(email.html).toContain('/public/attendance/');
			// NO debe contener el HTML inline rico (h2 con "Hola ...") porque la plantilla ganó
			expect(email.html).not.toContain('<h2 style="color:#1c1917');
		});

		it('escapa HTML peligroso en variables (XSS protection en plantillas)', async () => {
			const { MessageTemplate } = require('@/entities/messageTemplate.entity');
			const tplRepo = AppDataSource.getRepository(MessageTemplate);
			await tplRepo.save(
				tplRepo.create({
					name: 'Test xss-escaping template',
					type: 'COMMUNITY_MEMBER_APPROVED',
					scope: 'community',
					message: 'Bienvenido {{firstName}} a {{communityName}}',
				} as any),
			);

			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, {
				email: 'xss@test.com',
				firstName: '<script>alert(1)</script>',
			});
			const member = await service.addMember(testCommunity.id, p.id);
			await service.updateMemberState(member.id, 'pending_verification', testUser.id);
			(globalThis as any).__sentEmails = [];
			await service.updateMemberState(member.id, 'active_member', testUser.id);
			await new Promise((r) => setTimeout(r, 50));

			const email = getSent().find((e: any) => e.to === 'xss@test.com');
			expect(email).toBeTruthy();
			// Variables se escapan
			expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
			// El raw script NO debe estar presente
			expect(email.html).not.toContain('<script>alert(1)</script>');
		});

		it('regression: placeholder spoofing — un firstName con forma de placeholder NO debe re-interpretarse', async () => {
			// SECURITY: previo a este fix, renderTemplate hacía dos pasadas
			// secuenciales (mustache → canónica). Un participante con
			// `firstName = '{community.name}'` veía su nombre reemplazado por
			// el nombre real de la comunidad en el output:
			//   "Hola {{firstName}} en {community.name}"
			//   → primera pasada: "Hola {community.name} en {community.name}"
			//   → segunda pasada (BUG): "Hola <nombre real> en <nombre real>"
			//
			// El fix usa un único regex combinado que matchea contra el
			// template original. Cada placeholder se reemplaza una sola vez
			// y los valores nunca se procesan como template.
			const { MessageTemplate } = require('@/entities/messageTemplate.entity');
			const tplRepo = AppDataSource.getRepository(MessageTemplate);
			// Borrar cualquier plantilla COMMUNITY_MEMBER_APPROVED previa para
			// que mi template gane sin ambigüedad de orden.
			await tplRepo.delete({ type: 'COMMUNITY_MEMBER_APPROVED' });
			await tplRepo.save(
				tplRepo.create({
					name: 'Test double-pass regression',
					type: 'COMMUNITY_MEMBER_APPROVED',
					scope: 'community',
					message: 'Hola {{firstName}} en {community.name}',
				} as any),
			);

			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			// firstName tiene contenido que parece placeholder canónico
			await partRepo.update(p.id, {
				email: 'doublepass@test.com',
				firstName: '{community.name}',
			});
			const member = await service.addMember(testCommunity.id, p.id);
			await service.updateMemberState(member.id, 'pending_verification', testUser.id);
			(globalThis as any).__sentEmails = [];
			await service.updateMemberState(member.id, 'active_member', testUser.id);
			await new Promise((r) => setTimeout(r, 50));

			const email = getSent().find((e: any) => e.to === 'doublepass@test.com');
			expect(email).toBeTruthy();
			// Resultado correcto: el firstName aparece LITERAL donde estaba
			// `{{firstName}}`, y el nombre real de la comunidad aparece
			// donde estaba `{community.name}`.
			expect(email.html).toContain(`en ${testCommunity.name}`);
			expect(email.html).toContain('Hola {community.name} en');
			// Y el firstName NO se debe duplicar como nombre de comunidad.
			const nameOccurrences = (email.html.match(new RegExp(testCommunity.name, 'g')) || []).length;
			expect(nameOccurrences).toBe(1);
		});

		it('cae al HTML inline cuando NO existe plantilla en BD', async () => {
			// Asegurar BD limpia: borrar cualquier plantilla COMMUNITY_MEETING_INVITATION
			const { MessageTemplate } = require('@/entities/messageTemplate.entity');
			await AppDataSource.getRepository(MessageTemplate).delete({
				type: 'COMMUNITY_MEETING_INVITATION',
			});

			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'fallback@test.com', firstName: 'Juan' });
			await service.addMember(testCommunity.id, p.id);

			await service.createMeeting(testCommunity.id, {
				title: 'Fallback meeting',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			const email = getSent().find((e: any) => e.to === 'fallback@test.com');
			expect(email).toBeTruthy();
			// Debe usar el HTML inline rico (con h2 + estilo distintivo)
			expect(email.html).toContain('<h2 style="color:#1c1917');
			expect(email.html).toContain('Fallback meeting');
		});

		it('plantilla específica de community gana sobre la global', async () => {
			const { MessageTemplate } = require('@/entities/messageTemplate.entity');
			const tplRepo = AppDataSource.getRepository(MessageTemplate);
			// Plantilla global (communityId NULL)
			await tplRepo.save(
				tplRepo.create({
					name: 'Global tpl',
					type: 'COMMUNITY_MEETING_INVITATION',
					scope: 'community',
					message: 'GLOBAL: {{communityName}} {{meetingTitle}}',
				} as any),
			);
			// Plantilla específica de testCommunity
			await tplRepo.save(
				tplRepo.create({
					name: 'Specific tpl',
					type: 'COMMUNITY_MEETING_INVITATION',
					scope: 'community',
					communityId: testCommunity.id,
					message: 'SPECIFIC: {{communityName}} {{meetingTitle}}',
				} as any),
			);

			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'override@test.com', firstName: 'Ana' });
			await service.addMember(testCommunity.id, p.id);

			await service.createMeeting(testCommunity.id, {
				title: 'Reunión override',
				startDate: new Date(Date.now() + 86_400_000),
				durationMinutes: 60,
			} as any);
			await new Promise((r) => setTimeout(r, 100));

			const email = getSent().find((e: any) => e.to === 'override@test.com');
			expect(email).toBeTruthy();
			expect(email.html).toContain('SPECIFIC:');
			expect(email.html).not.toContain('GLOBAL:');
		});
	});

	// ─── G2: Notificación al solicitante cuando admin cambia su estado ──────

	describe('updateMemberState — notificación al solicitante (G2)', () => {
		const getSent = () => ((globalThis as any).__sentEmails as any[]) || [];
		beforeEach(() => {
			(globalThis as any).__sentEmails = [];
		});

		it('al aprobar (pending → active) envía email de bienvenida al solicitante', async () => {
			// Crear member pending
			const member = await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Pending',
				lastName: 'User',
				email: 'pending-approve@test.com',
				cellPhone: '555-1111',
			});
			await new Promise((r) => setTimeout(r, 50)); // dejar pasar notifyJoinRequest
			(globalThis as any).__sentEmails = []; // limpiar

			await service.updateMemberState(member!.id, 'active_member', testUser.id);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			const welcome = sent.find((e) => e.to === 'pending-approve@test.com');
			expect(welcome).toBeTruthy();
			expect(welcome.subject).toContain('Bienvenido');
			expect(welcome.html).toContain('Pending');
		});

		it('al rechazar (pending → no_answer) envía email de seguimiento', async () => {
			const member = await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Rejected',
				lastName: 'User',
				email: 'rejected@test.com',
				cellPhone: '555-2222',
			});
			await new Promise((r) => setTimeout(r, 50));
			(globalThis as any).__sentEmails = [];

			await service.updateMemberState(member!.id, 'no_answer', testUser.id);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			const followup = sent.find((e) => e.to === 'rejected@test.com');
			expect(followup).toBeTruthy();
			expect(followup.subject).toContain('Tu solicitud');
		});

		it('NO envía email si la transición no es desde pending_verification', async () => {
			// member directamente active
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await service.addMember(testCommunity.id, p.id);
			const memberRepo = AppDataSource.getRepository(
				require('@/entities/communityMember.entity').CommunityMember,
			);
			const member = await memberRepo.findOne({ where: { participantId: p.id } });
			(globalThis as any).__sentEmails = [];

			await service.updateMemberState(member!.id, 'no_answer', testUser.id);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			expect(sent.length).toBe(0);
		});

		it('audit fields se llenan al cambiar estado (G5)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await service.addMember(testCommunity.id, p.id);
			const memberRepo = AppDataSource.getRepository(
				require('@/entities/communityMember.entity').CommunityMember,
			);
			let member = await memberRepo.findOne({ where: { participantId: p.id } });

			await service.updateMemberState(member!.id, 'no_answer', testUser.id);

			member = await memberRepo.findOne({ where: { id: member!.id } });
			expect(member!.previousState).toBe('active_member');
			expect(member!.verifiedBy).toBe(testUser.id);
			expect(member!.verifiedAt).toBeTruthy();
		});
	});

	// ─── G1: Auto-link Participant ↔ User existente ─────────────────────────

	describe('linkParticipantToExistingUser (G1)', () => {
		it('vincula Participant a User existente con mismo email', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'autolink@test.com' });
			// Crear participant sin userId
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'autolink@test.com', userId: null });

			await service.linkParticipantToExistingUser(p.id);

			const updated = await partRepo.findOne({ where: { id: p.id } });
			expect(updated!.userId).toBe(user.id);
		});

		it('no sobrescribe userId si Participant ya tiene uno', async () => {
			const existingUser = await TestDataFactory.createTestUser({ email: 'existing@test.com' });
			const newUser = await TestDataFactory.createTestUser({ email: 'newuser@test.com' });
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'newuser@test.com', userId: existingUser.id });

			await service.linkParticipantToExistingUser(p.id);

			const updated = await partRepo.findOne({ where: { id: p.id } });
			expect(updated!.userId).toBe(existingUser.id); // sin cambio
		});

		it('no falla si no existe User con el email del Participant', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { email: 'lonely@test.com', userId: null });

			await expect(service.linkParticipantToExistingUser(p.id)).resolves.toBeUndefined();
		});

		it('createCommunityMember invoca auto-link cuando hay User con ese email', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'create-member@test.com' });

			const member = await service.createCommunityMember(testCommunity.id, {
				firstName: 'Auto',
				lastName: 'Link',
				email: 'create-member@test.com',
				cellPhone: '555-1234',
			});

			expect(member).toBeTruthy();
			expect(member!.participant!.userId).toBe(user.id);
		});

		it('createPublicJoinRequest vincula a User existente dentro de la TX', async () => {
			const user = await TestDataFactory.createTestUser({ email: 'public-link@test.com' });

			const member = await service.createPublicJoinRequest(testCommunity.id, {
				firstName: 'Public',
				lastName: 'Link',
				email: 'public-link@test.com',
				cellPhone: '555-9999',
			});

			expect(member).toBeTruthy();
			expect(member!.participant!.userId).toBe(user.id);
		});
	});

	describe('joinedAt custom (fecha de ingreso)', () => {
		it('createCommunityMember respeta un joinedAt provisto', async () => {
			const joined = new Date('2026-01-15T00:00:00.000Z');
			const member = await service.createCommunityMember(testCommunity.id, {
				firstName: 'Nuevo',
				lastName: 'Miembro',
				email: 'joined-custom@test.com',
				cellPhone: '555-0001',
				joinedAt: joined,
			});
			expect(member).toBeTruthy();
			expect(new Date(member!.joinedAt).getTime()).toBe(joined.getTime());
		});

		it('createCommunityMember usa el default cuando no se provee joinedAt', async () => {
			const member = await service.createCommunityMember(testCommunity.id, {
				firstName: 'Sin',
				lastName: 'Fecha',
				email: 'joined-default@test.com',
				cellPhone: '555-0002',
			});
			expect(member!.joinedAt).toBeTruthy();
		});

		it('updateMemberProfile actualiza joinedAt y lo reporta en changedFields', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);
			const newJoined = new Date('2026-02-20T00:00:00.000Z');

			const { member: updated, changedFields } = await service.updateMemberProfile(
				testCommunity.id,
				member.id,
				{ joinedAt: newJoined },
			);

			expect(changedFields).toContain('joinedAt');
			expect(new Date(updated!.joinedAt).getTime()).toBe(newJoined.getTime());
		});

		it('mover joinedAt hacia atrás incluye reuniones no asistidas en la tasa (caso Everardo)', async () => {
			// Dos reuniones previas al ingreso por default del miembro.
			const r1 = await service.createMeeting(testCommunity.id, {
				title: 'R1',
				startDate: new Date('2026-03-01T02:00:00.000Z'),
				durationMinutes: 60,
			});
			await service.createMeeting(testCommunity.id, {
				title: 'R2',
				startDate: new Date('2026-03-08T02:00:00.000Z'),
				durationMinutes: 60,
			});
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);
			// Asiste solo a R1.
			await service.recordSingleAttendance(testCommunity.id, r1.id, member.id, true);

			// joinedAt = ahora (posterior a ambas). Solo R1 cuenta (tiene asistencia
			// registrada) → 100%. R2 no cuenta porque es previa al ingreso y sin asistencia.
			let members = await service.getMembers(testCommunity.id);
			expect(members.find((m) => m.id === member.id)!.lastMeetingsAttendanceRate).toBe(100);

			// Corregir la fecha de ingreso a antes de ambas reuniones → R2 (no asistida)
			// ahora también cuenta → 1 de 2 = 50%.
			await service.updateMemberProfile(testCommunity.id, member.id, {
				joinedAt: new Date('2026-01-01T00:00:00.000Z'),
			});
			members = await service.getMembers(testCommunity.id);
			expect(members.find((m) => m.id === member.id)!.lastMeetingsAttendanceRate).toBe(50);
		});
	});

	describe('asistencia por miembro (getMemberAttendance / bulkRecordMemberAttendance)', () => {
		it('getMembers expone el conteo lastMeetingsAttended / lastMeetingsTotal', async () => {
			const m1 = await service.createMeeting(testCommunity.id, {
				title: 'A', startDate: new Date('2026-03-01T02:00:00.000Z'), durationMinutes: 60,
			});
			await service.createMeeting(testCommunity.id, {
				title: 'B', startDate: new Date('2026-03-08T02:00:00.000Z'), durationMinutes: 60,
			});
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);
			// joinedAt es @CreateDateColumn (no lo respeta el factory): fijarlo con update
			// a antes de ambas reuniones para que las dos cuenten en el denominador.
			await service.updateMemberProfile(testCommunity.id, member.id, {
				joinedAt: new Date('2026-01-01T00:00:00.000Z'),
			});
			await service.recordSingleAttendance(testCommunity.id, m1.id, member.id, true);

			const members = await service.getMembers(testCommunity.id);
			const target = members.find((m) => m.id === member.id)! as any;
			expect(target.lastMeetingsAttended).toBe(1);
			expect(target.lastMeetingsTotal).toBe(2);
			expect(target.lastMeetingsAttendanceRate).toBe(50);
		});

		it('getMemberAttendance devuelve solo registros de reuniones de la comunidad', async () => {
			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Reunión', startDate: new Date('2026-03-01T02:00:00.000Z'), durationMinutes: 60,
			});
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);
			await service.recordSingleAttendance(testCommunity.id, meeting.id, member.id, true);

			const records = await service.getMemberAttendance(testCommunity.id, member.id);
			expect(records).toEqual([{ meetingId: meeting.id, attended: true }]);
		});

		it('getMemberAttendance lanza si el miembro no pertenece a la comunidad', async () => {
			await expect(
				service.getMemberAttendance(testCommunity.id, 'non-existent-member'),
			).rejects.toThrow('Member not found');
		});

		it('bulkRecordMemberAttendance hace upsert de varias reuniones en una llamada', async () => {
			const m1 = await service.createMeeting(testCommunity.id, {
				title: 'A', startDate: new Date('2026-03-01T02:00:00.000Z'), durationMinutes: 60,
			});
			const m2 = await service.createMeeting(testCommunity.id, {
				title: 'B', startDate: new Date('2026-03-08T02:00:00.000Z'), durationMinutes: 60,
			});
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const res = await service.bulkRecordMemberAttendance(testCommunity.id, member.id, [
				{ meetingId: m1.id, attended: true },
				{ meetingId: m2.id, attended: false },
			]);
			expect(res.updated).toBe(2);

			const records = await service.getMemberAttendance(testCommunity.id, member.id);
			expect(records.find((r) => r.meetingId === m1.id)?.attended).toBe(true);
			expect(records.find((r) => r.meetingId === m2.id)?.attended).toBe(false);

			// Upsert: volver a marcar m1 como ausente actualiza (no duplica).
			await service.bulkRecordMemberAttendance(testCommunity.id, member.id, [
				{ meetingId: m1.id, attended: false },
			]);
			const after = await service.getMemberAttendance(testCommunity.id, member.id);
			expect(after.filter((r) => r.meetingId === m1.id).length).toBe(1);
			expect(after.find((r) => r.meetingId === m1.id)?.attended).toBe(false);
		});

		it('bulkRecordMemberAttendance ignora reuniones que no son de la comunidad', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const res = await service.bulkRecordMemberAttendance(testCommunity.id, member.id, [
				{ meetingId: 'foreign-meeting-id', attended: true },
			]);
			expect(res.updated).toBe(0);
			expect(await service.getMemberAttendance(testCommunity.id, member.id)).toEqual([]);
		});
	});

	// ─── Auto-link de líder a su comunidad ──────────────────────────────────

	describe('linkUserToContactCommunities', () => {
		const getSent = () => ((globalThis as any).__sentEmails as any[]) || [];

		beforeEach(() => {
			(globalThis as any).__sentEmails = [];
		});

		it('SECURITY (Vuln 2 fix): crea pending+token (NO active) cuando la comunidad pending y sin owner', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'leader@test.com',
				status: 'pending',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: community.id });

			const leader = await TestDataFactory.createTestUser({
				email: 'leader@test.com',
				displayName: 'Líder Test',
			});

			const linked = await service.linkUserToContactCommunities(leader);

			expect(linked.length).toBe(1);
			expect(linked[0].id).toBe(community.id);

			const admin = await adminRepo.findOne({ where: { communityId: community.id, userId: leader.id } });
			expect(admin).toBeTruthy();
			expect(admin!.role).toBe('owner');
			// SECURITY: status debe ser 'pending', NO 'active' — el usuario NO obtiene
			// acceso hasta que el verdadero líder acepte vía email al contactEmail.
			expect(admin!.status).toBe('pending');
			expect(admin!.invitationToken).toBeTruthy();
			expect(admin!.invitationToken!.length).toBeGreaterThanOrEqual(64); // 32 bytes hex
			expect(admin!.invitationExpiresAt).toBeTruthy();
			expect(admin!.acceptedAt).toBeFalsy();
		});

		it('SECURITY (Vuln 2 fix): propone rol admin (pending) cuando ya hay owner activo', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'leader2@test.com',
				status: 'active',
			});
			// El factory ya hizo a testUser owner

			const leader = await TestDataFactory.createTestUser({ email: 'leader2@test.com' });
			const linked = await service.linkUserToContactCommunities(leader);

			expect(linked.length).toBe(1);
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const admin = await adminRepo.findOne({ where: { communityId: community.id, userId: leader.id } });
			expect(admin!.role).toBe('admin');
			// SECURITY: pending hasta confirmación
			expect(admin!.status).toBe('pending');
			expect(admin!.invitationToken).toBeTruthy();
		});

		it('NO duplica si el usuario ya es admin de la comunidad', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'already@test.com',
			});
			const leader = await TestDataFactory.createTestUser({ email: 'already@test.com' });

			// Primer link
			await service.linkUserToContactCommunities(leader);
			// Segundo link no debe crear duplicado
			const linked2 = await service.linkUserToContactCommunities(leader);

			expect(linked2.length).toBe(0);
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const admins = await adminRepo.find({ where: { communityId: community.id, userId: leader.id } });
			expect(admins.length).toBe(1);
		});

		it('NO vincula a comunidades con status=rejected', async () => {
			await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'rejected@test.com',
				status: 'rejected',
			});
			const leader = await TestDataFactory.createTestUser({ email: 'rejected@test.com' });

			const linked = await service.linkUserToContactCommunities(leader);
			expect(linked.length).toBe(0);
		});

		it('match case-insensitive entre user.email y community.contactEmail', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'mIXEDcase@TEST.com',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: community.id });

			const leader = await TestDataFactory.createTestUser({ email: 'MixedCase@Test.COM' });
			const linked = await service.linkUserToContactCommunities(leader);

			expect(linked.length).toBe(1);
		});

		it('vincula a múltiples comunidades si el mismo email es contacto de varias', async () => {
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const c1 = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'multi-leader@test.com',
				status: 'pending',
			});
			const c2 = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'multi-leader@test.com',
				status: 'active',
			});
			await adminRepo.delete({ communityId: c1.id });

			const leader = await TestDataFactory.createTestUser({ email: 'multi-leader@test.com' });
			const linked = await service.linkUserToContactCommunities(leader);
			expect(linked.length).toBe(2);
			const ids = linked.map((c) => c.id);
			expect(ids).toContain(c1.id);
			expect(ids).toContain(c2.id);
		});

		it('SECURITY: envía email al CONTACT EMAIL (no al user) con link de aceptación', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'real-leader@parroquia.com',
				name: 'Mi Comunidad',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: community.id });

			// Mallory registra cuenta con el email del líder
			const mallory = await TestDataFactory.createTestUser({
				email: 'real-leader@parroquia.com',
				displayName: 'Mallory',
			});
			await service.linkUserToContactCommunities(mallory);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			// El email debe ir al contactEmail original (igual al user.email en este caso)
			const email = sent.find((e) => e.to === 'real-leader@parroquia.com');
			expect(email).toBeTruthy();
			expect(email.subject).toContain('Confirma acceso');
			expect(email.html).toContain('Mi Comunidad');
			// Debe incluir el link de aceptación con un token
			expect(email.html).toMatch(/invitations\/accept\?token=[a-f0-9]{64}/);
		});

		it('NO envía email si no se vinculó nada', async () => {
			const leader = await TestDataFactory.createTestUser({ email: 'lonely@test.com' });
			await service.linkUserToContactCommunities(leader);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			expect(sent.length).toBe(0);
		});

		it('escapa HTML del email y nombre de comunidad en el email', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'xss@test.com',
				name: '<img src=x onerror=1>',
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: community.id });

			const leader = await TestDataFactory.createTestUser({
				email: 'xss@test.com',
				displayName: '<script>steal()</script>',
			});
			await service.linkUserToContactCommunities(leader);
			await new Promise((r) => setTimeout(r, 100));

			const sent = getSent();
			const email = sent.find((e) => e.to === 'xss@test.com');
			expect(email.html).not.toContain('<img src=x onerror=1>');
			expect(email.html).toContain('&lt;img');
		});

		it('approveCommunity también crea solicitud pending si contactUser existe', async () => {
			// Crear user con email que será contactEmail
			const leader = await TestDataFactory.createTestUser({ email: 'pre-approve@test.com' });

			// Crear comunidad pending con ese contactEmail
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				contactEmail: 'pre-approve@test.com',
				status: 'pending',
			});
			// Borrar el admin auto-creado para simular flujo real
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.delete({ communityId: community.id });

			// El superadmin aprueba
			await service.approveCommunity(community.id, testUser.id);

			// SECURITY: El leader debe estar como pending (no activo automáticamente)
			const leaderAdmin = await adminRepo.findOne({
				where: { communityId: community.id, userId: leader.id },
			});
			expect(leaderAdmin).toBeTruthy();
			expect(leaderAdmin!.status).toBe('pending');
			expect(leaderAdmin!.invitationToken).toBeTruthy();
			// Como el approver ya es owner, el leader queda como admin (al aceptar)
			expect(leaderAdmin!.role).toBe('admin');
		});
	});

	// ─── Vuln 2 hardening — acceptInvitation guards ──────────────────────────

	describe('acceptInvitation — emailVerified + TTL guards (Vuln 2 hardening)', () => {
		it('SECURITY: rechaza con EMAIL_NOT_VERIFIED si user.emailVerified=false', async () => {
			const userRepo = AppDataSource.getRepository(
				require('@/entities/user.entity').User,
			);
			const leader = await TestDataFactory.createTestUser({
				email: 'unverified-acceptor@test.com',
			});
			// Aseguramos emailVerified=false explícitamente
			await userRepo.update(leader.id, { emailVerified: false });
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Vuln2-emailverify',
				contactEmail: 'unverified-acceptor@test.com',
				status: 'active',
			});
			await service.linkUserToContactCommunities(leader);
			const pending = await AppDataSource.getRepository(CommunityAdmin).findOne({
				where: { communityId: community.id, userId: leader.id, status: 'pending' },
			});
			expect(pending?.invitationToken).toBeTruthy();

			await expect(
				service.acceptInvitation(pending!.invitationToken!, leader.id),
			).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });

			// El admin record sigue pending (no fue consumido)
			const stillPending = await AppDataSource.getRepository(CommunityAdmin).findOne({
				where: { id: pending!.id },
			});
			expect(stillPending?.status).toBe('pending');
			expect(stillPending?.invitationToken).toBeTruthy();
		});

		it('SECURITY: acepta cuando user.emailVerified=true', async () => {
			const userRepo = AppDataSource.getRepository(
				require('@/entities/user.entity').User,
			);
			const leader = await TestDataFactory.createTestUser({
				email: 'verified-acceptor@test.com',
			});
			await userRepo.update(leader.id, { emailVerified: true });
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Vuln2-verified',
				contactEmail: 'verified-acceptor@test.com',
				status: 'active',
			});
			await service.linkUserToContactCommunities(leader);
			const pending = await AppDataSource.getRepository(CommunityAdmin).findOne({
				where: { communityId: community.id, userId: leader.id, status: 'pending' },
			});
			expect(pending?.invitationToken).toBeTruthy();

			const accepted = await service.acceptInvitation(pending!.invitationToken!, leader.id);
			expect(accepted.status).toBe('active');
			expect(accepted.acceptedAt).toBeInstanceOf(Date);
		});

		it('SECURITY: rechaza con INVITATION_EXPIRED si TTL pasó', async () => {
			const userRepo = AppDataSource.getRepository(
				require('@/entities/user.entity').User,
			);
			const leader = await TestDataFactory.createTestUser({
				email: 'expired-acceptor@test.com',
			});
			await userRepo.update(leader.id, { emailVerified: true });
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Vuln2-expired',
				contactEmail: 'expired-acceptor@test.com',
				status: 'active',
			});
			await service.linkUserToContactCommunities(leader);
			// Forzar expiración a hace 1 minuto
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			const pending = await adminRepo.findOne({
				where: { communityId: community.id, userId: leader.id, status: 'pending' },
			});
			await adminRepo.update(pending!.id, {
				invitationExpiresAt: new Date(Date.now() - 60_000),
			});

			await expect(
				service.acceptInvitation(pending!.invitationToken!, leader.id),
			).rejects.toMatchObject({ code: 'INVITATION_EXPIRED' });
		});

		it('TTL: tokens emitidos por linkUserToContactCommunities expiran en ~48h', async () => {
			const leader = await TestDataFactory.createTestUser({ email: 'ttl-check@test.com' });
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Vuln2-ttl',
				contactEmail: 'ttl-check@test.com',
				status: 'active',
			});
			const before = Date.now();
			await service.linkUserToContactCommunities(leader);
			const after = Date.now();
			const pending = await AppDataSource.getRepository(CommunityAdmin).findOne({
				where: { communityId: community.id, userId: leader.id, status: 'pending' },
			});
			expect(pending?.invitationExpiresAt).toBeInstanceOf(Date);
			const ttl = pending!.invitationExpiresAt!.getTime();
			const expectedMin = before + 48 * 60 * 60 * 1000 - 1000;
			const expectedMax = after + 48 * 60 * 60 * 1000 + 1000;
			expect(ttl).toBeGreaterThanOrEqual(expectedMin);
			expect(ttl).toBeLessThanOrEqual(expectedMax);
		});
	});

	describe('updateMemberProfile — overlay de perfil por-comunidad', () => {
		it('persiste overlay en community_member.* SIN tocar el Participant', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, {
				firstName: 'Joseph',
				lastName: 'Perez',
				email: 'joseph@example.com',
				cellPhone: '5550000000',
			});
			const member = await service.addMember(testCommunity.id, p.id);

			const updated = await service.updateMemberProfile(testCommunity.id, member.id, {
				firstName: 'Juan Carlos',
				lastName: 'Pérez',
				email: 'juancarlos@example.com',
				cellPhone: '5551234567',
			});

			// Overlay vive en community_member
			expect((updated.member as any)?.firstName).toBe('Juan Carlos');
			expect((updated.member as any)?.lastName).toBe('Pérez');
			expect((updated.member as any)?.email).toBe('juancarlos@example.com');
			expect((updated.member as any)?.cellPhone).toBe('5551234567');

			// Participant NO se tocó
			const reloadedParticipant = await partRepo.findOne({ where: { id: p.id } });
			expect(reloadedParticipant?.firstName).toBe('Joseph');
			expect(reloadedParticipant?.lastName).toBe('Perez');
			expect(reloadedParticipant?.email).toBe('joseph@example.com');
			expect(reloadedParticipant?.cellPhone).toBe('5550000000');
		});

		it('trims whitespace on all fields', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await service.addMember(testCommunity.id, p.id);

			const updated = await service.updateMemberProfile(testCommunity.id, member.id, {
				firstName: '  Juan  ',
				lastName: '  Pérez  ',
				email: '  juan@example.com  ',
				cellPhone: '  5551234567  ',
			});

			expect((updated.member as any)?.firstName).toBe('Juan');
			expect((updated.member as any)?.lastName).toBe('Pérez');
			expect((updated.member as any)?.email).toBe('juan@example.com');
			expect((updated.member as any)?.cellPhone).toBe('5551234567');
		});

		it('empty-string fields se persisten como NULL (limpia overlay)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await service.addMember(testCommunity.id, p.id);

			// Primero setea overlay
			await service.updateMemberProfile(testCommunity.id, member.id, {
				lastName: 'Pérez',
				cellPhone: '5550000000',
				email: 'overlay@example.com',
			});

			// Luego "limpia" con strings vacíos
			const updated = await service.updateMemberProfile(testCommunity.id, member.id, {
				lastName: '',
				cellPhone: '',
				email: '',
			});

			expect((updated.member as any)?.lastName).toBeNull();
			expect((updated.member as any)?.cellPhone).toBeNull();
			expect((updated.member as any)?.email).toBeNull();
		});

		it('partial update: solo toca los campos provistos', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await service.addMember(testCommunity.id, p.id);

			// Setear overlay completo
			await service.updateMemberProfile(testCommunity.id, member.id, {
				firstName: 'Juan',
				lastName: 'Pérez',
				email: 'juan@example.com',
				cellPhone: '5550000000',
			});

			// Tocar solo lastName — los demás overlays se mantienen
			const updated = await service.updateMemberProfile(testCommunity.id, member.id, {
				lastName: 'González',
			});

			expect((updated.member as any)?.firstName).toBe('Juan');
			expect((updated.member as any)?.lastName).toBe('González');
			expect((updated.member as any)?.email).toBe('juan@example.com');
			expect((updated.member as any)?.cellPhone).toBe('5550000000');
		});

		it('SECURITY: throws cross-tenant cuando memberId no pertenece a communityId', async () => {
			const otherCommunity = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Otra comunidad',
			});
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberInOther = await service.addMember(otherCommunity.id, p.id);

			await expect(
				service.updateMemberProfile(testCommunity.id, memberInOther.id, {
					lastName: 'HackedSurname',
				}),
			).rejects.toThrow('Member not found in this community');
		});

		it('rejects empty firstName explícitamente', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await service.addMember(testCommunity.id, p.id);

			await expect(
				service.updateMemberProfile(testCommunity.id, member.id, {
					firstName: '   ',
				}),
			).rejects.toThrow('firstName cannot be empty');
		});

		it('no-op cuando no se provee ningún campo', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, { firstName: 'Juan', lastName: 'Pérez' });
			const member = await service.addMember(testCommunity.id, p.id);

			const updated = await service.updateMemberProfile(testCommunity.id, member.id, {});

			expect(updated.member?.participant?.firstName).toBe('Juan');
			expect(updated.member?.participant?.lastName).toBe('Pérez');
			expect((updated.member as any)?.firstName).toBeFalsy();
			expect((updated.member as any)?.lastName).toBeFalsy();
		});

		it('SECURITY: editar email NO afecta participant.email (anti account-takeover)', async () => {
			// Participant con user vinculado — antes esto era el vector de takeover
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(p.id, {
				email: 'real-user@example.com',
				userId: testUser.id,
			});
			const member = await service.addMember(testCommunity.id, p.id);

			// Admin "malicioso" cambia el email del overlay
			const updated = await service.updateMemberProfile(testCommunity.id, member.id, {
				email: 'attacker@example.com',
			});

			// El overlay se guardó — eso es OK porque NO afecta auto-link
			expect((updated.member as any)?.email).toBe('attacker@example.com');

			// El Participant queda INTACTO — auto-link en signup sigue funcionando con el email original
			const reloadedParticipant = await partRepo.findOne({ where: { id: p.id } });
			expect(reloadedParticipant?.email).toBe('real-user@example.com');
		});

		it('SECURITY: rechaza colisión de email dentro de la misma comunidad', async () => {
			// Miembro A con email overlay
			const pA = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberA = await service.addMember(testCommunity.id, pA.id);
			await service.updateMemberProfile(testCommunity.id, memberA.id, {
				email: 'taken@example.com',
			});

			// Miembro B intenta usar el mismo email (case-insensitive)
			const pB = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberB = await service.addMember(testCommunity.id, pB.id);

			await expect(
				service.updateMemberProfile(testCommunity.id, memberB.id, {
					email: 'TAKEN@example.com',
				}),
			).rejects.toThrow('EMAIL_DUPLICATE_IN_COMMUNITY');
		});

		it('permite mismo email en COMUNIDADES DISTINTAS (overlay es per-community)', async () => {
			const otherCommunity = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Comunidad B',
			});
			const pA = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberA = await service.addMember(testCommunity.id, pA.id);
			await service.updateMemberProfile(testCommunity.id, memberA.id, {
				email: 'shared@example.com',
			});

			const pB = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberB = await service.addMember(otherCommunity.id, pB.id);

			// Mismo email pero en Comunidad B — debería pasar
			const updated = await service.updateMemberProfile(otherCommunity.id, memberB.id, {
				email: 'shared@example.com',
			});

			expect((updated.member as any)?.email).toBe('shared@example.com');
		});

		it('detecta colisión contra el participant.email heredado (overlay null) de otro miembro', async () => {
			// Miembro A sin overlay (su email efectivo es participant.email)
			const pA = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(pA.id, { email: 'shared@example.com' });
			await service.addMember(testCommunity.id, pA.id);

			// Miembro B intenta poner overlay con el mismo email
			const pB = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberB = await service.addMember(testCommunity.id, pB.id);

			await expect(
				service.updateMemberProfile(testCommunity.id, memberB.id, {
					email: 'shared@example.com',
				}),
			).rejects.toThrow('EMAIL_DUPLICATE_IN_COMMUNITY');
		});

		// ---- Teléfono: misma garantía que email ----
		it('SECURITY: rechaza colisión de teléfono dentro de la misma comunidad (overlay vs overlay)', async () => {
			const pA = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberA = await service.addMember(testCommunity.id, pA.id);
			await service.updateMemberProfile(testCommunity.id, memberA.id, {
				cellPhone: '5512345678',
			});

			const pB = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberB = await service.addMember(testCommunity.id, pB.id);

			// Mismo número con formato distinto (espacios, +52) — debe colisionar
			// por normalización a últimos 10 dígitos.
			await expect(
				service.updateMemberProfile(testCommunity.id, memberB.id, {
					cellPhone: '+52 55 1234 5678',
				}),
			).rejects.toThrow('PHONE_DUPLICATE_IN_COMMUNITY');
		});

		it('detecta colisión contra el participant.cellPhone heredado (overlay null) de otro miembro', async () => {
			// Miembro A sin overlay — su cellPhone efectivo es participant.cellPhone
			const pA = await TestDataFactory.createTestParticipant(testRetreat.id);
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			await partRepo.update(pA.id, { cellPhone: '5599998888' });
			await service.addMember(testCommunity.id, pA.id);

			// Miembro B intenta poner overlay con el mismo tel — debe bloquearse.
			// Este es el caso real reportado: Fernando Marin con 2 perfiles, ambos
			// con tel en participant y overlay NULL.
			const pB = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberB = await service.addMember(testCommunity.id, pB.id);

			await expect(
				service.updateMemberProfile(testCommunity.id, memberB.id, {
					cellPhone: '5599998888',
				}),
			).rejects.toThrow('PHONE_DUPLICATE_IN_COMMUNITY');
		});

		it('permite mismo teléfono en COMUNIDADES DISTINTAS', async () => {
			const otherCommunity = await TestDataFactory.createTestCommunity(testUser.id, {
				name: 'Comunidad C',
			});
			const pA = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberA = await service.addMember(testCommunity.id, pA.id);
			await service.updateMemberProfile(testCommunity.id, memberA.id, {
				cellPhone: '5577776666',
			});

			const pB = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberB = await service.addMember(otherCommunity.id, pB.id);

			const updated = await service.updateMemberProfile(otherCommunity.id, memberB.id, {
				cellPhone: '5577776666',
			});
			expect((updated.member as any)?.cellPhone).toBe('5577776666');
		});

		it('no reporta colisión cuando el teléfono es el mismo del miembro (no cambia)', async () => {
			const pA = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberA = await service.addMember(testCommunity.id, pA.id);
			await service.updateMemberProfile(testCommunity.id, memberA.id, {
				cellPhone: '5566665555',
			});

			// Re-set del mismo tel debe ser no-op
			const updated = await service.updateMemberProfile(testCommunity.id, memberA.id, {
				cellPhone: '5566665555',
			});
			expect((updated.member as any)?.cellPhone).toBe('5566665555');
		});

		it('SECURITY: el partial unique index dispara EMAIL_DUPLICATE_IN_COMMUNITY si la race condition salta el check', async () => {
			// Defense in depth: simulamos la race condition insertando directamente
			// otro miembro con email overlay para evitar el check del service y
			// disparar el unique index a nivel DB.
			const pA = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberA = await service.addMember(testCommunity.id, pA.id);
			const memberRepo = AppDataSource.getRepository(
				require('@/entities/communityMember.entity').CommunityMember,
			);
			await memberRepo.update(memberA.id, { email: 'taken@example.com' });

			const pB = await TestDataFactory.createTestParticipant(testRetreat.id);
			const memberB = await service.addMember(testCommunity.id, pB.id);

			// El service rechaza con EMAIL_DUPLICATE_IN_COMMUNITY (puede venir del
			// check de aplicación o del constraint de DB — ambos son válidos como
			// defense in depth).
			await expect(
				service.updateMemberProfile(testCommunity.id, memberB.id, {
					email: 'taken@example.com',
				}),
			).rejects.toThrow('EMAIL_DUPLICATE_IN_COMMUNITY');
		});

		it('no reporta colisión cuando el email es el mismo del miembro (no cambia)', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await service.addMember(testCommunity.id, p.id);
			await service.updateMemberProfile(testCommunity.id, member.id, {
				email: 'me@example.com',
			});

			// Re-enviar el mismo email (con distinto case) NO debe fallar
			const updated = await service.updateMemberProfile(testCommunity.id, member.id, {
				email: 'ME@example.com',
				lastName: 'Pérez',
			});

			expect((updated.member as any)?.lastName).toBe('Pérez');
			// El email se actualiza al nuevo case, pero sin error de colisión
			expect((updated.member as any)?.email?.toLowerCase()).toBe('me@example.com');
		});
	});

	describe('bulkAddMembers — overlay cuando el input difiere del Participant existente', () => {
		it('guarda overlay cuando el Participant existente tiene nombre/email distinto al input', async () => {
			// Crear un Participant "Joseph Perez" con email joe@x.com
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			const existing = await TestDataFactory.createTestParticipant(testRetreat.id);
			await partRepo.update(existing.id, {
				firstName: 'Joseph',
				lastName: 'Perez',
				email: 'joe@example.com',
				cellPhone: '5550000000',
			});

			// El bot agrega "Juan Pérez" con el mismo email (dedupe debería hit)
			const result = await service.bulkAddMembers(testCommunity.id, [
				{
					firstName: 'Juan',
					lastName: 'Pérez García',
					email: 'joe@example.com',
					cellPhone: '5551111111',
				},
			]);

			expect(result.linked).toHaveLength(1);
			expect(result.added).toHaveLength(0);

			// Verificar overlay en el nuevo member
			const memberId = result.linked[0].memberId;
			const memberRepo = AppDataSource.getRepository(
				require('@/entities/communityMember.entity').CommunityMember,
			);
			const member = await memberRepo.findOne({
				where: { id: memberId },
				relations: ['participant'],
			});
			expect((member as any)?.firstName).toBe('Juan');
			expect((member as any)?.lastName).toBe('Pérez García');
			expect((member as any)?.cellPhone).toBe('5551111111');
			// Email es igual (joe@) → no se persiste como overlay
			expect((member as any)?.email).toBeFalsy();

			// El Participant subyacente queda intacto
			const reloaded = await partRepo.findOne({ where: { id: existing.id } });
			expect(reloaded?.firstName).toBe('Joseph');
			expect(reloaded?.lastName).toBe('Perez');
			expect(reloaded?.email).toBe('joe@example.com');
		});

		it('NO guarda overlay cuando los datos son idénticos al Participant existente', async () => {
			const partRepo = AppDataSource.getRepository(
				require('@/entities/participant.entity').Participant,
			);
			const existing = await TestDataFactory.createTestParticipant(testRetreat.id);
			await partRepo.update(existing.id, {
				firstName: 'Juan',
				lastName: 'Pérez',
				email: 'juan@example.com',
				cellPhone: '5550000000',
			});

			const result = await service.bulkAddMembers(testCommunity.id, [
				{
					firstName: 'Juan',
					lastName: 'Pérez',
					email: 'juan@example.com',
					cellPhone: '5550000000',
				},
			]);

			expect(result.linked).toHaveLength(1);
			const memberId = result.linked[0].memberId;
			const memberRepo = AppDataSource.getRepository(
				require('@/entities/communityMember.entity').CommunityMember,
			);
			const member = await memberRepo.findOne({ where: { id: memberId } });
			expect((member as any)?.firstName).toBeFalsy();
			expect((member as any)?.lastName).toBeFalsy();
			expect((member as any)?.email).toBeFalsy();
			expect((member as any)?.cellPhone).toBeFalsy();
		});

		it('cuando crea Participant nuevo (no hit), NO setea overlay', async () => {
			const result = await service.bulkAddMembers(testCommunity.id, [
				{
					firstName: 'NuevoMiembro',
					lastName: 'NuevoApellido',
					email: 'nuevo@example.com',
					cellPhone: '5559999999',
				},
			]);

			expect(result.added).toHaveLength(1);
			expect(result.linked).toHaveLength(0);

			const memberId = result.added[0].memberId;
			const memberRepo = AppDataSource.getRepository(
				require('@/entities/communityMember.entity').CommunityMember,
			);
			const member = await memberRepo.findOne({
				where: { id: memberId },
				relations: ['participant'],
			});
			// Sin overlay — los datos viven en participant
			expect((member as any)?.firstName).toBeFalsy();
			expect((member as any)?.lastName).toBeFalsy();
			expect(member?.participant?.firstName).toBe('NuevoMiembro');
			expect(member?.participant?.lastName).toBe('NuevoApellido');
		});
	});
});
