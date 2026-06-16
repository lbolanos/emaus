/**
 * Regression tests para el bundle de cambios del 2026-05-18 / 19:
 *
 *   1. `getMembers` devuelve `lastMessageSentAt` (timestamp del último
 *      `participant_communications` con scope=community para ese
 *      participante en esta comunidad). Usado por el frontend para
 *      ordenar la lista de miembros por "último contacto".
 *
 *   2. `notifyMemberStateChange` corta en SILENT_STATES
 *      (wrong_contact_info, do_not_contact, paused) — el coordinador
 *      marcó al miembro como "canal roto" o "no contactar", el sistema
 *      NO debe mandar emails automáticos.
 *
 *   3. Los 5 estados nuevos (`wrong_contact_info`, `no_time`, `paused`,
 *      `not_interested`, `do_not_contact`) son aceptados por el CHECK
 *      constraint y son tratados como declinaciones — quedan fuera del
 *      roster del meeting muestra a TODOS los miembros (todos invitados); el state
	 *      solo silencia el EMAIL de invitación para los SILENT.
 *
 *   4. `inferTimezoneFromCoords` se dispara en `createCommunity` cuando
 *      vienen lat/lon. Sin coords, queda NULL y `getCommunityTimezone`
 *      cae al default 'America/Mexico_City'.
 */

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityService, getCommunityTimezone } from '@/services/communityService';
import { AppDataSource } from '@/data-source';

// Mock EmailService igual que en el suite principal — observable via
// globalThis.__sentEmails para verificar que NO se mandó email en SILENT_STATES.
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

describe('Community Service — 2026-05-18 updates', () => {
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
		(globalThis as any).__sentEmails = [];
		testUser = await TestDataFactory.createTestUser();
		testCommunity = await TestDataFactory.createTestCommunity(testUser.id);
		testRetreat = await TestDataFactory.createTestRetreat();
	});

	describe('getMembers — lastMessageSentAt', () => {
		it('devuelve null cuando el miembro nunca recibió un mensaje', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const members = await service.getMembers(testCommunity.id);
			expect(members).toHaveLength(1);
			expect(members[0].lastMessageSentAt).toBeNull();
		});

		it('devuelve el timestamp del último mensaje community-scope', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Insertar dos mensajes con distintas fechas
			const older = '2026-05-10 10:00:00';
			const newer = '2026-05-15 16:30:00';
			await AppDataSource.query(
				`INSERT INTO participant_communications (id, participantId, scope, communityId, messageType, recipientContact, messageContent, sentAt)
				 VALUES (?, ?, 'community', ?, 'email', 'a@x.com', 'older', ?)`,
				[crypto.randomUUID(), p.id, testCommunity.id, older],
			);
			await AppDataSource.query(
				`INSERT INTO participant_communications (id, participantId, scope, communityId, messageType, recipientContact, messageContent, sentAt)
				 VALUES (?, ?, 'community', ?, 'whatsapp', '555', 'newer', ?)`,
				[crypto.randomUUID(), p.id, testCommunity.id, newer],
			);

			const members = await service.getMembers(testCommunity.id);
			expect(members[0].lastMessageSentAt).toBeTruthy();
			// MAX() retorna la fecha más reciente.
			expect(String(members[0].lastMessageSentAt)).toContain('2026-05-15');
			// Regression: el valor DEBE ser ISO UTC con sufijo 'Z'. Sin esto,
			// `new Date(...)` en el navegador interpreta el string como local
			// time y los "hace N min" salen corridos por la diff de TZ del cliente.
			expect(String(members[0].lastMessageSentAt)).toMatch(/Z$/);
			// new Date(...) debe parsearlo a un timestamp UTC consistente.
			expect(Number.isNaN(new Date(members[0].lastMessageSentAt as string).getTime())).toBe(false);
		});

		it('ignora mensajes de otra comunidad y de scope retreat', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const otherCommunity = await TestDataFactory.createTestCommunity(testUser.id);

			// Mensaje en OTRA comunidad
			await AppDataSource.query(
				`INSERT INTO participant_communications (id, participantId, scope, communityId, messageType, recipientContact, messageContent, sentAt)
				 VALUES (?, ?, 'community', ?, 'email', 'a@x.com', 'other community', '2026-05-15 10:00:00')`,
				[crypto.randomUUID(), p.id, otherCommunity.id],
			);
			// Mensaje retreat-scope (mismo participante)
			await AppDataSource.query(
				`INSERT INTO participant_communications (id, participantId, scope, retreatId, messageType, recipientContact, messageContent, sentAt)
				 VALUES (?, ?, 'retreat', ?, 'email', 'a@x.com', 'retreat msg', '2026-05-15 10:00:00')`,
				[crypto.randomUUID(), p.id, testRetreat.id],
			);

			const members = await service.getMembers(testCommunity.id);
			// El miembro de THIS community no tiene mensajes community-scope aquí
			expect(members[0].lastMessageSentAt).toBeNull();
		});
	});

	describe('notifyMemberStateChange — SILENT_STATES', () => {
		const silentStates = ['wrong_contact_info', 'do_not_contact', 'paused'];
		const speakingStates = ['no_answer', 'another_group', 'far_from_location', 'no_time', 'not_interested'];

		it.each(silentStates)('NO manda email cuando el nuevo estado es %s', async (state) => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id, {
				email: 'silent-target@example.com',
			});
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			// Cargar member con relaciones que el método espera
			const fullMember = await AppDataSource.getRepository('CommunityMember').findOne({
				where: { id: member.id },
				relations: ['participant', 'community'],
			});
			expect(fullMember).toBeTruthy();

			(globalThis as any).__sentEmails = [];
			await service.notifyMemberStateChange(fullMember as any, 'pending_verification', state);
			expect((globalThis as any).__sentEmails).toHaveLength(0);
		});

		it.each(speakingStates)('SI manda email de rechazo suave para %s', async (state) => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id, {
				email: 'soft-reject-target@example.com',
			});
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const fullMember = await AppDataSource.getRepository('CommunityMember').findOne({
				where: { id: member.id },
				relations: ['participant', 'community'],
			});

			(globalThis as any).__sentEmails = [];
			await service.notifyMemberStateChange(fullMember as any, 'pending_verification', state);
			expect((globalThis as any).__sentEmails).toHaveLength(1);
			expect((globalThis as any).__sentEmails[0].to).toBe('soft-reject-target@example.com');
		});

		it('manda email de bienvenida cuando el nuevo estado es active_member', async () => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id, {
				email: 'welcome-target@example.com',
			});
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id);

			const fullMember = await AppDataSource.getRepository('CommunityMember').findOne({
				where: { id: member.id },
				relations: ['participant', 'community'],
			});

			(globalThis as any).__sentEmails = [];
			await service.notifyMemberStateChange(fullMember as any, 'pending_verification', 'active_member');
			expect((globalThis as any).__sentEmails).toHaveLength(1);
			expect(String((globalThis as any).__sentEmails[0].subject)).toContain('Bienvenido');
		});
	});

	describe('Extended member states — persistence and filtering', () => {
		const newStates = ['wrong_contact_info', 'no_time', 'paused', 'not_interested', 'do_not_contact'];

		it.each(newStates)('persiste el estado %s sin violar el CHECK', async (state) => {
			const p = await TestDataFactory.createTestParticipant(testRetreat.id);
			const member = await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id, {
				state: state as any,
			});
			expect(member.state).toBe(state);

			// Re-cargar desde DB
			const fromDb = await AppDataSource.getRepository('CommunityMember').findOne({
				where: { id: member.id },
			});
			expect((fromDb as any)?.state).toBe(state);
		});

		it('el roster del meeting incluye TODOS los estados (todos están invitados)', async () => {
			const states = [
				'active_member',
				'pending_verification',
				'wrong_contact_info',
				'no_time',
				'paused',
				'not_interested',
				'do_not_contact',
				'no_answer',
				'far_from_location',
				'another_group',
			];

			for (const s of states) {
				const p = await TestDataFactory.createTestParticipant(testRetreat.id);
				await TestDataFactory.createTestCommunityMember(testCommunity.id, p.id, { state: s as any });
			}

			const meeting = await service.createMeeting(testCommunity.id, {
				title: 'Roster test',
				startDate: new Date(),
				durationMinutes: 60,
			});

			const roster = await service.getPublicAttendanceData(testCommunity.id, meeting.id);
			expect(roster).not.toBeNull();
			const rosterStates = new Set((roster!.members as any[]).map((m) => m.state));
			// Todos los miembros están invitados a las reuniones: ningún state se oculta.
			for (const s of states) {
				expect(rosterStates.has(s)).toBe(true);
			}
			expect(roster!.members.length).toBe(states.length);
		});
	});

	describe('Community timezone — inferred from coords', () => {
		it('infiere America/Mexico_City para coords de CDMX', async () => {
			const community = await service.createCommunity(
				{
					name: 'CDMX Community',
					address1: 'Centro',
					city: 'CDMX',
					state: 'CDMX',
					zipCode: '06000',
					country: 'México',
					latitude: 19.4326,
					longitude: -99.1332,
				} as any,
				testUser.id,
			);

			expect(community.timezone).toBe('America/Mexico_City');
		});

		it('queda en null cuando NO hay coords (helper cae al default)', async () => {
			const community = await service.createCommunity(
				{
					name: 'No coords Community',
					address1: 'X',
					city: 'X',
					state: 'X',
					zipCode: '00000',
					country: 'México',
				} as any,
				testUser.id,
			);

			expect(community.timezone == null).toBe(true);
			expect(getCommunityTimezone(community)).toBe('America/Mexico_City');
		});

		it('recalcula timezone cuando updateCommunity cambia coords', async () => {
			const community = await service.createCommunity(
				{
					name: 'TZ migration',
					address1: 'X',
					city: 'X',
					state: 'X',
					zipCode: '00000',
					country: 'México',
					latitude: 19.4326,
					longitude: -99.1332,
				} as any,
				testUser.id,
			);
			expect(community.timezone).toBe('America/Mexico_City');

			// Mover a Bogotá
			const updated = await service.updateCommunity(community.id, {
				latitude: 4.711,
				longitude: -74.0721,
			} as any);
			expect(updated?.timezone).toBe('America/Bogota');
		});

		it('respeta timezone explícito sobre el inferido', async () => {
			const community = await service.createCommunity(
				{
					name: 'Explicit TZ',
					address1: 'X',
					city: 'X',
					state: 'X',
					zipCode: '00000',
					country: 'México',
					latitude: 19.4326,
					longitude: -99.1332,
					timezone: 'America/Tijuana',
				} as any,
				testUser.id,
			);
			expect(community.timezone).toBe('America/Tijuana');
		});
	});

	describe('getCommunityTimezone — sync helper fallback', () => {
		it('devuelve la timezone de la community cuando existe', () => {
			expect(getCommunityTimezone({ timezone: 'America/Bogota' } as any)).toBe('America/Bogota');
		});
		it('cae a America/Mexico_City cuando es null/undefined', () => {
			expect(getCommunityTimezone({ timezone: null } as any)).toBe('America/Mexico_City');
			expect(getCommunityTimezone({} as any)).toBe('America/Mexico_City');
			expect(getCommunityTimezone(null)).toBe('America/Mexico_City');
		});
	});
});
