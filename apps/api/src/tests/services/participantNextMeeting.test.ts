import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { findNextMeetingForParticipant } from '@/services/participantService';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';

/**
 * Tests para `findNextMeetingForParticipant`: el helper que resuelve la
 * próxima reunión de comunidad para un participante. Lo consume
 * `MessageDialog` y `BaseMessageTemplateModal` para llenar
 * `{retreat.next_meeting_date}` en las plantillas post-retiro.
 *
 * Casos cubiertos:
 *  - Participante sin community memberships → nulls
 *  - Memberships pero sin meetings próximos → nulls
 *  - Una reunión próxima → datos completos formateados
 *  - Múltiples comunidades → devuelve la reunión más temprana
 *  - Recurrence templates excluidos (solo instancias reales cuentan)
 *  - Estados no-active (no_answer, another_group) excluidos
 */
describe('findNextMeetingForParticipant', () => {
	let user: User;
	let retreat: Retreat;
	let participant: Participant;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		user = await TestDataFactory.createTestUser();
		retreat = await TestDataFactory.createTestRetreat();
		participant = await TestDataFactory.createTestParticipant(retreat.id);
	});

	it('returns nulls when participant has no community memberships', async () => {
		const result = await findNextMeetingForParticipant(participant.id);

		expect(result).toEqual({
			meetingId: null,
			nextMeetingDate: null,
			formattedDate: null,
			title: null,
			communityId: null,
			communityName: null,
		});
	});

	it('returns nulls when participant has memberships but no upcoming meetings', async () => {
		const community = await TestDataFactory.createTestCommunity(user.id);
		await TestDataFactory.createTestCommunityMember(community.id, participant.id);

		// Past meeting only
		await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Reunión pasada',
			startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
		});

		const result = await findNextMeetingForParticipant(participant.id);

		expect(result.nextMeetingDate).toBeNull();
		expect(result.formattedDate).toBeNull();
		expect(result.title).toBeNull();
	});

	it('returns formatted next meeting for participant in one community', async () => {
		const community = await TestDataFactory.createTestCommunity(user.id, {
			name: 'Buen Despacho',
		});
		await TestDataFactory.createTestCommunityMember(community.id, participant.id);

		const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Reunión mensual',
			startDate: futureDate,
		});

		const result = await findNextMeetingForParticipant(participant.id);

		expect(result.nextMeetingDate).toBe(futureDate.toISOString());
		expect(result.title).toBe('Reunión mensual');
		expect(result.communityId).toBe(community.id);
		expect(result.communityName).toBe('Buen Despacho');
		expect(result.meetingId).toBeTruthy(); // permite construir attendanceLink en el frontend
		expect(result.formattedDate).toBeTruthy();
		// Formatted should be a human-readable Spanish date string
		expect(result.formattedDate).toMatch(/\d{4}/); // contains the year
	});

	it('returns the EARLIEST meeting across multiple communities', async () => {
		const communityA = await TestDataFactory.createTestCommunity(user.id, {
			name: 'Comunidad A',
		});
		const communityB = await TestDataFactory.createTestCommunity(user.id, {
			name: 'Comunidad B',
		});

		await TestDataFactory.createTestCommunityMember(communityA.id, participant.id);
		await TestDataFactory.createTestCommunityMember(communityB.id, participant.id);

		const inTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
		const inOneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

		// Furthest meeting in A
		await TestDataFactory.createTestCommunityMeeting(communityA.id, {
			title: 'Reunión A (lejos)',
			startDate: inTwoWeeks,
		});
		// Closer meeting in B
		await TestDataFactory.createTestCommunityMeeting(communityB.id, {
			title: 'Reunión B (cerca)',
			startDate: inOneWeek,
		});

		const result = await findNextMeetingForParticipant(participant.id);

		expect(result.title).toBe('Reunión B (cerca)');
		expect(result.communityId).toBe(communityB.id);
		expect(result.communityName).toBe('Comunidad B');
	});

	it('prefiere INSTANCIA real sobre template recurrente cuando ambos existen', async () => {
		const community = await TestDataFactory.createTestCommunity(user.id);
		await TestDataFactory.createTestCommunityMember(community.id, participant.id);

		const inOneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		const inTwoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

		// Recurrence template earlier → debe ser SALTADO porque hay instancia real
		await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Template recurrente',
			startDate: inOneWeek,
			isRecurrenceTemplate: true,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
		});
		// Real instance later → debe ser elegida
		await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Reunión real',
			startDate: inTwoWeeks,
			isRecurrenceTemplate: false,
		});

		const result = await findNextMeetingForParticipant(participant.id);

		expect(result.title).toBe('Reunión real');
	});

	it('fallback: usa template recurrente calculando próxima ocurrencia cuando no hay instancia', async () => {
		// Caso real reportado: comunidad solo tiene template recurrente, sin
		// instancias materializadas. Antes devolvía null y disparaba el
		// warning de "variables sin datos" para {community.meetingDate}.
		const community = await TestDataFactory.createTestCommunity(user.id, {
			name: 'Con solo template',
		});
		await TestDataFactory.createTestCommunityMember(community.id, participant.id);

		// Template recurrente que empezó hace 2 semanas, weekly cada miércoles
		const startDate = new Date();
		startDate.setDate(startDate.getDate() - 14);
		await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Reunión semanal',
			startDate,
			isRecurrenceTemplate: true,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: 1,
			recurrenceDayOfWeek: 'wednesday',
		});

		const result = await findNextMeetingForParticipant(participant.id);

		expect(result.title).toBe('Reunión semanal');
		expect(result.meetingId).toBeTruthy(); // el template id
		expect(result.nextMeetingDate).toBeTruthy();
		// La próxima ocurrencia calculada debe ser futura
		expect(new Date(result.nextMeetingDate!).getTime()).toBeGreaterThan(Date.now());
		expect(result.communityName).toBe('Con solo template');
	});

	it('excludes members in declined states (no_answer, another_group)', async () => {
		const declinedCommunity = await TestDataFactory.createTestCommunity(user.id, {
			name: 'Declinada',
		});
		const activeCommunity = await TestDataFactory.createTestCommunity(user.id, {
			name: 'Activa',
		});

		// Participant declined in this community
		await TestDataFactory.createTestCommunityMember(declinedCommunity.id, participant.id, {
			state: 'no_answer' as any,
		});
		// Participant active here
		await TestDataFactory.createTestCommunityMember(activeCommunity.id, participant.id, {
			state: 'active_member' as any,
		});

		const inOneDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
		const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

		// Earlier meeting in DECLINED community → should be skipped
		await TestDataFactory.createTestCommunityMeeting(declinedCommunity.id, {
			title: 'No debería aparecer',
			startDate: inOneDay,
		});
		// Later meeting in active community → should be returned
		await TestDataFactory.createTestCommunityMeeting(activeCommunity.id, {
			title: 'Sí aparece',
			startDate: inTwoDays,
		});

		const result = await findNextMeetingForParticipant(participant.id);

		expect(result.title).toBe('Sí aparece');
		expect(result.communityName).toBe('Activa');
	});

	it('counts pending_verification members (coordinador-marker, no permission)', async () => {
		const community = await TestDataFactory.createTestCommunity(user.id);
		await TestDataFactory.createTestCommunityMember(community.id, participant.id, {
			state: 'pending_verification' as any,
		});

		const inOneWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
		await TestDataFactory.createTestCommunityMeeting(community.id, {
			title: 'Reunión',
			startDate: inOneWeek,
		});

		const result = await findNextMeetingForParticipant(participant.id);

		expect(result.title).toBe('Reunión');
	});

	describe('with explicit communityId (mensaje enviado desde una comunidad específica)', () => {
		it('restricts to the given community even when other communities have earlier meetings', async () => {
			const communityA = await TestDataFactory.createTestCommunity(user.id, {
				name: 'Comunidad A',
			});
			const communityB = await TestDataFactory.createTestCommunity(user.id, {
				name: 'Comunidad B',
			});

			// Participante en ambas
			await TestDataFactory.createTestCommunityMember(communityA.id, participant.id);
			await TestDataFactory.createTestCommunityMember(communityB.id, participant.id);

			// Reunión más temprana en A (la cercana)
			await TestDataFactory.createTestCommunityMeeting(communityA.id, {
				title: 'Reunión A — cercana',
				startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
			});
			// Reunión en B más lejana
			await TestDataFactory.createTestCommunityMeeting(communityB.id, {
				title: 'Reunión B — lejana',
				startDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
			});

			// Sin scope → debería devolver la de A (más temprana, comportamiento legacy).
			const unscoped = await findNextMeetingForParticipant(participant.id);
			expect(unscoped.title).toBe('Reunión A — cercana');

			// Con scope a B → debe devolver la de B aunque sea más lejana.
			const scoped = await findNextMeetingForParticipant(participant.id, communityB.id);
			expect(scoped.title).toBe('Reunión B — lejana');
			expect(scoped.communityId).toBe(communityB.id);
			expect(scoped.communityName).toBe('Comunidad B');
		});

		it('returns nulls when participant is not a member of the scoped community', async () => {
			const memberCommunity = await TestDataFactory.createTestCommunity(user.id, {
				name: 'Donde sí soy miembro',
			});
			const otherCommunity = await TestDataFactory.createTestCommunity(user.id, {
				name: 'Donde NO soy miembro',
			});

			await TestDataFactory.createTestCommunityMember(memberCommunity.id, participant.id);
			// Reunión en la otra comunidad — irrelevante porque no soy miembro
			await TestDataFactory.createTestCommunityMeeting(otherCommunity.id, {
				title: 'No debería aparecer',
				startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
			});

			const result = await findNextMeetingForParticipant(participant.id, otherCommunity.id);

			expect(result.nextMeetingDate).toBeNull();
			expect(result.title).toBeNull();
		});

		it('returns nulls when participant is in the community but with declined state', async () => {
			const community = await TestDataFactory.createTestCommunity(user.id);
			await TestDataFactory.createTestCommunityMember(community.id, participant.id, {
				state: 'no_answer' as any,
			});

			await TestDataFactory.createTestCommunityMeeting(community.id, {
				title: 'Reunión',
				startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
			});

			const result = await findNextMeetingForParticipant(participant.id, community.id);

			expect(result.nextMeetingDate).toBeNull();
			expect(result.title).toBeNull();
		});

		it('returns the scoped community next meeting when the participant has multiple memberships', async () => {
			const targetCommunity = await TestDataFactory.createTestCommunity(user.id, {
				name: 'Buen Despacho',
			});
			const otherCommunity = await TestDataFactory.createTestCommunity(user.id, {
				name: 'Otra',
			});

			await TestDataFactory.createTestCommunityMember(targetCommunity.id, participant.id);
			await TestDataFactory.createTestCommunityMember(otherCommunity.id, participant.id);

			await TestDataFactory.createTestCommunityMeeting(targetCommunity.id, {
				title: 'La que queremos',
				startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
			});
			await TestDataFactory.createTestCommunityMeeting(otherCommunity.id, {
				title: 'Más cercana en otra comunidad',
				startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
			});

			const result = await findNextMeetingForParticipant(participant.id, targetCommunity.id);

			expect(result.title).toBe('La que queremos');
			expect(result.communityName).toBe('Buen Despacho');
		});
	});

	describe('with allowedCommunityIds (caller-scoped allowlist, IDOR defense)', () => {
		it('returns nulls when allowedCommunityIds is empty (caller has no admin scope)', async () => {
			const community = await TestDataFactory.createTestCommunity(user.id);
			await TestDataFactory.createTestCommunityMember(community.id, participant.id);
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				title: 'Reunión',
				startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
			});

			const result = await findNextMeetingForParticipant(participant.id, undefined, []);

			expect(result.nextMeetingDate).toBeNull();
			expect(result.title).toBeNull();
			expect(result.communityName).toBeNull();
		});

		it('filters out communities the caller does NOT administer', async () => {
			const adminOfA = await TestDataFactory.createTestCommunity(user.id, {
				name: 'Soy admin acá',
			});
			const notAdminOf = await TestDataFactory.createTestCommunity(user.id, {
				name: 'NO soy admin acá',
			});

			await TestDataFactory.createTestCommunityMember(adminOfA.id, participant.id);
			await TestDataFactory.createTestCommunityMember(notAdminOf.id, participant.id);

			// Reunión más temprana en la comunidad donde NO soy admin
			await TestDataFactory.createTestCommunityMeeting(notAdminOf.id, {
				title: 'No debería leakear',
				startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
			});
			// Reunión más lejana en la comunidad donde sí soy admin
			await TestDataFactory.createTestCommunityMeeting(adminOfA.id, {
				title: 'Esta sí es accesible',
				startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			});

			const result = await findNextMeetingForParticipant(participant.id, undefined, [
				adminOfA.id,
			]);

			expect(result.title).toBe('Esta sí es accesible');
			expect(result.communityName).toBe('Soy admin acá');
		});

		it('combines communityId with allowedCommunityIds — communityId wins (controller will 403 mismatch)', async () => {
			// Sanity check: si pasan ambos, el communityId restringe (esta combinación
			// la usaría el controller solo después de verificar acceso al communityId
			// explícitamente, por lo que allowedCommunityIds es redundante pero no
			// debería romper).
			const community = await TestDataFactory.createTestCommunity(user.id);
			await TestDataFactory.createTestCommunityMember(community.id, participant.id);
			await TestDataFactory.createTestCommunityMeeting(community.id, {
				title: 'Reunión',
				startDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
			});

			const result = await findNextMeetingForParticipant(
				participant.id,
				community.id,
				[community.id],
			);

			expect(result.title).toBe('Reunión');
		});
	});
});
