import { AppDataSource } from '../data-source';
import { Community } from '../entities/community.entity';
import { CommunityMember } from '../entities/communityMember.entity';
import { CommunityMeeting } from '../entities/communityMeeting.entity';
import { CommunityAdmin } from '../entities/communityAdmin.entity';
import { CommunityAttendance } from '../entities/communityAttendance.entity';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/userRole.entity';
import { Participant } from '../entities/participant.entity';
import { MemberState } from '@repo/types';
import { In, MoreThanOrEqual } from 'typeorm';
import { calculateNextOccurrence } from '../utils/recurrenceUtils';
import { EmailService } from './emailService';
import { MessageTemplate } from '../entities/messageTemplate.entity';

export class CommunityService {
	private communityRepo = AppDataSource.getRepository(Community);
	private memberRepo = AppDataSource.getRepository(CommunityMember);
	private meetingRepo = AppDataSource.getRepository(CommunityMeeting);
	private adminRepo = AppDataSource.getRepository(CommunityAdmin);
	private attendanceRepo = AppDataSource.getRepository(CommunityAttendance);
	private participantRepo = AppDataSource.getRepository(Participant);
	// Lazy getter: el monkey-patch de AppDataSource.getRepository en test-setup
	// requiere resolver el repo en el momento del call, no al construir el service.
	private get messageTemplateRepo() {
		return AppDataSource.getRepository(MessageTemplate);
	}

	/**
	 * Renderiza una plantilla de `message_templates` interpolando `{{var}}`.
	 * Prefiere la plantilla específica de la community; si no existe, usa la
	 * global (`communityId IS NULL`). Devuelve `null` si no hay plantilla — el
	 * caller debe caer al HTML inline (fallback de seguridad).
	 *
	 * SECURITY: todas las variables se pasan por `escapeHtml` antes de
	 * interpolarse para prevenir XSS en clientes de correo que renderizan HTML.
	 */
	private async renderTemplate(
		type: string,
		communityId: string | null,
		vars: Record<string, string | number | null | undefined>,
	): Promise<string | null> {
		try {
			const template = await this.messageTemplateRepo
				.createQueryBuilder('t')
				.where('t.type = :type', { type })
				.andWhere('t.scope = :scope', { scope: 'community' })
				.andWhere('(t.communityId = :cid OR t.communityId IS NULL)', { cid: communityId })
				.orderBy('CASE WHEN t.communityId IS NULL THEN 1 ELSE 0 END', 'ASC')
				.getOne();
			if (!template) return null;
			let out = template.message;
			for (const [k, v] of Object.entries(vars)) {
				const safe = escapeHtml(v == null ? '' : String(v));
				out = out.split(`{{${k}}}`).join(safe);
			}
			return out;
		} catch (err) {
			console.error(`[renderTemplate] type=${type} failed:`, err);
			return null;
		}
	}

	/**
	 * Envuelve un body plain-text renderizado (de `renderTemplate`) en un
	 * shell HTML compatible con clientes de correo. Convierte saltos de línea
	 * a `<br>` y enlaces URL crudos en `<a>` clickeables.
	 */
	private wrapTemplateHtml(plainBody: string): string {
		const withBr = plainBody.replace(/\n/g, '<br>');
		const withLinks = withBr.replace(
			/(https?:\/\/[^\s<]+)/g,
			'<a href="$1" style="color:#8DAA91;">$1</a>',
		);
		return `
			<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c1917;">
				${withLinks}
			</div>
		`.trim();
	}

	// --- Community CRUD ---

	async createCommunity(data: Partial<Community>, userId: string) {
		const community = this.communityRepo.create({
			...data,
			createdBy: userId,
		});
		const savedCommunity = await this.communityRepo.save(community);

		// Automatically add creator as owner
		const admin = this.adminRepo.create({
			communityId: savedCommunity.id,
			userId,
			role: 'owner',
			status: 'active',
			acceptedAt: new Date(),
		});
		await this.adminRepo.save(admin);

		return savedCommunity;
	}

	async getCommunities(userId: string) {
		// Superadmin ve TODAS las comunidades activas. Query directa al repo de
		// UserRole para evitar la dependencia con authorizationService (singleton
		// con cache que rompe los tests aislados con AppDataSource swap).
		const isSuperadmin =
			(await AppDataSource.getRepository(UserRole)
				.createQueryBuilder('ur')
				.leftJoin('ur.role', 'role')
				.where('ur.userId = :userId', { userId })
				.andWhere('role.name = :name', { name: 'superadmin' })
				.getCount()) > 0;

		let communities: Community[];
		if (isSuperadmin) {
			communities = await this.communityRepo.find({
				where: { status: 'active' },
			});
		} else {
			const adminRecords = await this.adminRepo.find({
				where: { userId, status: 'active' },
				relations: ['community'],
			});
			communities = adminRecords
				.map((record) => record.community)
				.filter((community) => community && community.id);
		}

		// Add member count + viewerRole to each community.
		// SECURITY: el frontend usa viewerRole para ocultar acciones owner-only
		// (botón "Editar comunidad" en la lista).
		const communitiesWithCounts = await Promise.all(
			communities.map(async (community) => {
				const memberCount = await this.memberRepo.count({
					where: { communityId: community.id },
				});
				let viewerRole: 'superadmin' | 'owner' | 'admin' | null = null;
				if (isSuperadmin) {
					viewerRole = 'superadmin';
				} else {
					const adminRecord = await this.adminRepo.findOne({
						where: { communityId: community.id, userId, status: 'active' },
					});
					viewerRole = (adminRecord?.role as 'owner' | 'admin') || null;
				}
				return {
					...community,
					memberCount,
					viewerRole,
				};
			}),
		);

		return communitiesWithCounts;
	}

	async getCommunityById(id: string) {
		return this.communityRepo.findOne({
			where: { id },
			relations: ['creator'],
		});
	}

	async updateCommunity(id: string, data: Partial<Community>) {
		await this.communityRepo.update(id, data);
		return this.getCommunityById(id);
	}

	async deleteCommunity(id: string) {
		await this.communityRepo.delete(id);
	}

	// --- Member Management ---

	async getMembers(communityId: string, state?: MemberState) {
		const where: any = { communityId };
		if (state) {
			where.state = state;
		}

		const members = await this.memberRepo.find({
			where,
			relations: ['participant'],
		});

		// Calculate attendance rate for each member
		// Get all past meetings for this community (with startDate for filtering)
		const pastMeetings = await this.meetingRepo.find({
			where: { communityId },
			select: ['id', 'startDate'],
		});

		// Only calculate if there are meetings
		if (pastMeetings.length === 0) {
			return members
				.map((m) => ({
					...m,
					lastMeetingsAttendanceRate: 0,
					lastMeetingsFrequency: 'none' as const,
				}))
				.sort((a, b) => b.joinedAt.getTime() - a.joinedAt.getTime());
		}

		// Get all attendance records for these meetings
		const attendances = await this.attendanceRepo.find({
			where: { meetingId: In(pastMeetings.map((m) => m.id)) },
		});

		// Group attendance by member - store meeting IDs they attended
		const attendanceByMember: Record<string, string[]> = {};
		for (const record of attendances) {
			if (record.attended) {
				if (!attendanceByMember[record.memberId]) {
					attendanceByMember[record.memberId] = [];
				}
				attendanceByMember[record.memberId].push(record.meetingId);
			}
		}

		// Add calculated rate and frequency to each member
		// Only count meetings that occurred AFTER the member joined
		const membersWithRate = members.map((member) => {
			// Filter meetings to only include those on or after member's join date
			const meetingsSinceJoin = pastMeetings.filter((m) => m.startDate >= member.joinedAt);
			const meetingIdsSinceJoin = new Set(meetingsSinceJoin.map((m) => m.id));

			// Count only attendances to valid meetings (since member joined)
			const attendedMeetingIds = attendanceByMember[member.id] || [];
			const attendedCount = attendedMeetingIds.filter((id) => meetingIdsSinceJoin.has(id)).length;

			const totalValidMeetings = meetingsSinceJoin.length;
			const rate = totalValidMeetings > 0 ? (attendedCount / totalValidMeetings) * 100 : 0;

			// Determine frequency based on rate
			let frequency: 'high' | 'medium' | 'low' | 'none' = 'none';
			if (rate >= 75) {
				frequency = 'high';
			} else if (rate >= 25) {
				frequency = 'medium';
			} else if (rate >= 1) {
				frequency = 'low';
			} else {
				frequency = 'none';
			}

			return {
				...member,
				lastMeetingsAttendanceRate: rate,
				lastMeetingsFrequency: frequency,
			};
		});

		// Sort by attendance rate (highest first), then by join date
		return membersWithRate.sort((a, b) => {
			const rateDiff = (b.lastMeetingsAttendanceRate || 0) - (a.lastMeetingsAttendanceRate || 0);
			if (rateDiff !== 0) return rateDiff;
			return b.joinedAt.getTime() - a.joinedAt.getTime();
		});
	}

	/**
	 * SECURITY (P2): Determina qué rol tiene el viewer en una community.
	 * Usado para decidir si el response de getMembers incluye PII completa
	 * (owner/superadmin) o solo campos básicos (admin invitado).
	 */
	async getViewerRoleForCommunity(
		userId: string,
		communityId: string,
		isSuperadmin: boolean,
	): Promise<'superadmin' | 'owner' | 'admin' | null> {
		if (isSuperadmin) return 'superadmin';
		const adminRecord = await this.adminRepo.findOne({
			where: { communityId, userId, status: 'active' },
		});
		if (!adminRecord) return null;
		return adminRecord.role as 'owner' | 'admin';
	}

	/**
	 * Devuelve miembros con PII filtrada según el rol del viewer.
	 * - superadmin/owner: PII completa (lo mismo que getMembers)
	 * - admin: solo campos básicos del participant (firstName, lastName, email, cellPhone)
	 *   — campos sensibles (dirección, médico, contactos de emergencia, fecha nacimiento,
	 *   teléfonos secundarios) NO se exponen.
	 */
	async getMembersForViewer(
		communityId: string,
		viewer: { userId: string; isSuperadmin: boolean },
		state?: MemberState,
	) {
		const role = await this.getViewerRoleForCommunity(
			viewer.userId,
			communityId,
			viewer.isSuperadmin,
		);
		const members = await this.getMembers(communityId, state);
		// Owner y superadmin ven todo
		if (role === 'superadmin' || role === 'owner') return members;
		// Admin no-owner: trim PII sensible
		return members.map((m: any) => ({
			...m,
			participant: m.participant
				? {
						id: m.participant.id,
						firstName: m.participant.firstName,
						lastName: m.participant.lastName,
						email: m.participant.email,
						cellPhone: m.participant.cellPhone,
						// Marcar explícitamente como trimmed para que el frontend sepa
						_trimmed: true,
					}
				: null,
		}));
	}

	async addMember(communityId: string, participantId: string) {
		const existing = await this.memberRepo.findOne({
			where: { communityId, participantId },
		});

		if (existing) return existing;

		// Auto-link a User existente si el participant todavía no tiene userId
		// y existe un User con el mismo email (G1 del membership journey).
		await this.linkParticipantToExistingUser(participantId).catch((err) => {
			console.error('[communityService] linkParticipantToExistingUser failed:', err);
		});

		const member = this.memberRepo.create({
			communityId,
			participantId,
			state: 'active_member',
		});

		return this.memberRepo.save(member);
	}

	/**
	 * Vincula un Participant a un User existente si comparte el email.
	 * Se llama desde los flujos donde un admin crea un Member sin que el solicitante
	 * tenga cuenta. Si el user existe, el Member queda automáticamente conectado.
	 * Si el user no existe aún, el flujo se complementa en `authController.register`
	 * (busca Participants por email al crearse el user — bidireccional).
	 */
	async linkParticipantToExistingUser(participantId: string): Promise<void> {
		const participant = await this.participantRepo.findOne({ where: { id: participantId } });
		if (!participant?.email || participant.userId) return;

		const userRepo = AppDataSource.getRepository(User);
		const user = await userRepo
			.createQueryBuilder('user')
			.where('LOWER(user.email) = :email', { email: participant.email.toLowerCase().trim() })
			.getOne();
		if (!user) return;

		await this.participantRepo.update(participant.id, { userId: user.id });
	}

	async createCommunityMember(
		communityId: string,
		participantData: {
			firstName: string;
			lastName: string;
			email: string;
			cellPhone: string;
		},
	) {
		// 1. Create participant with retreatId: null and minimal required fields
		const participant = this.participantRepo.create({
			...participantData,
			email: participantData.email.toLowerCase().trim(),
			retreatId: null,
			type: 'walker', // Default type for community members
			id_on_retreat: 0, // Required field, set to 0 for community members
			birthDate: new Date(), // Default date for community members
			maritalStatus: 'O', // Default marital status (Other)
			street: 'N/A',
			houseNumber: 'N/A',
			postalCode: '00000',
			neighborhood: 'N/A',
			city: 'N/A',
			state: 'N/A',
			country: 'N/A',
			occupation: 'N/A',
			snores: false,
			hasMedication: false,
			hasDietaryRestrictions: false,
			sacraments: ['none'],
			emergencyContact1Name: 'N/A',
			emergencyContact1Relation: 'N/A',
			emergencyContact1CellPhone: participantData.cellPhone,
		});

		const savedParticipant = await this.participantRepo.save(participant);

		// G1: vincular a User existente si comparte email
		await this.linkParticipantToExistingUser(savedParticipant.id).catch((err) => {
			console.error('[communityService] linkParticipantToExistingUser failed:', err);
		});

		// 2. Add to community
		const member = this.memberRepo.create({
			communityId,
			participantId: savedParticipant.id,
			state: 'active_member',
		});

		const savedMember = await this.memberRepo.save(member);

		// 3. Return member with participant data
		return this.memberRepo.findOne({
			where: { id: savedMember.id },
			relations: ['participant'],
		});
	}

	async importFromRetreat(communityId: string, retreatId: string, participantIds: string[]) {
		const results = [];
		for (const participantId of participantIds) {
			const member = await this.addMember(communityId, participantId);
			results.push(member);
		}
		return results;
	}

	async getPotentialMembers(communityId: string, retreatId: string) {
		// Get all participant IDs that are already in this community
		const existingMembers = await this.memberRepo.find({
			where: { communityId },
			select: ['participantId'],
		});
		const existingParticipantIds = new Set(existingMembers.map((m) => m.participantId));

		// Get all participants from the retreat
		const retreatParticipants = await this.participantRepo
			.createQueryBuilder('participant')
			.where('participant.retreatId = :retreatId', { retreatId })
			.getMany();

		// Filter out participants who are already in the community and add a flag
		return retreatParticipants.map((p) => ({
			...p,
			alreadyMember: existingParticipantIds.has(p.id),
		}));
	}

	async updateMemberState(memberId: string, state: MemberState, actorUserId?: string) {
		const existing = await this.memberRepo.findOne({ where: { id: memberId } });
		if (!existing) return null;

		const previousState = existing.state;
		// G5: capturar auditoría — quién y cuándo cambió, y desde qué estado
		await this.memberRepo.update(memberId, {
			state,
			previousState,
			verifiedBy: actorUserId || null,
			verifiedAt: new Date(),
		});

		const updated = await this.memberRepo.findOne({
			where: { id: memberId },
			relations: ['participant', 'community'],
		});

		// G2: notificar al solicitante si la transición es desde pending_verification
		if (previousState === 'pending_verification' && state !== 'pending_verification' && updated) {
			this.notifyMemberStateChange(updated, previousState, state).catch((err) => {
				console.error('[communityService] notifyMemberStateChange failed:', err);
			});
		}

		return updated;
	}

	async removeMember(memberId: string) {
		await this.memberRepo.delete(memberId);
	}

	async updateMemberNotes(memberId: string, notes: string | null) {
		await this.memberRepo.update(memberId, { notes });
		return this.memberRepo.findOne({
			where: { id: memberId },
			relations: ['participant', 'community'],
		});
	}

	async getMemberTimeline(memberId: string) {
		const member = await this.memberRepo.findOne({
			where: { id: memberId },
			relations: ['participant', 'community'],
		});

		if (!member) {
			throw new Error('Member not found');
		}

		// Get all attendance records for this member
		const attendances = await this.attendanceRepo.find({
			where: { memberId },
			relations: ['meeting'],
			order: { recordedAt: 'DESC' },
		});

		// Get all meetings for this community to build timeline
		const meetings = await this.meetingRepo.find({
			where: { communityId: member.communityId },
			order: { startDate: 'DESC' },
		});

		return {
			member,
			attendances,
			meetings,
		};
	}

	// --- Meeting Management ---

	async createMeeting(communityId: string, data: Partial<CommunityMeeting>) {
		const meeting = this.meetingRepo.create({
			...data,
			communityId,
			isRecurrenceTemplate: !!data.recurrenceFrequency, // Mark as template if recurring
		});
		const saved = await this.meetingRepo.save(meeting);

		// G3: notificar a miembros si NO es una plantilla de recurrencia.
		// Las plantillas son schedules abstractos; las instancias específicas son las que importan.
		// Fire-and-forget: errores no rompen la creación.
		if (!saved.isRecurrenceTemplate) {
			this.notifyMembersOfMeeting(saved.id).catch((err) => {
				console.error('[communityService] notifyMembersOfMeeting failed:', err);
			});
		}

		return saved;
	}

	async getMeetings(communityId: string) {
		const meetings = await this.meetingRepo.find({
			where: { communityId },
			order: { startDate: 'DESC' },
		});

		// Get all members for this community (active members only)
		const allMembers = await this.memberRepo.find({
			where: { communityId, state: 'active_member' },
		});

		// Add attendance counts to each meeting
		const meetingsWithCounts = await Promise.all(
			meetings.map(async (meeting) => {
				// Get members who joined before or on the meeting date
				const eligibleMembers = allMembers.filter((m) => m.joinedAt <= meeting.startDate);

				// Get attendance records for this meeting
				const attendances = await this.attendanceRepo.find({
					where: { meetingId: meeting.id },
				});

				const attendeeCount = attendances.filter((a) => a.attended === true).length;
				// Count members with attended:false records + members without any record
				const absentCount =
					attendances.filter((a) => a.attended === false).length +
					(eligibleMembers.length - attendances.length);

				return {
					...meeting,
					attendeeCount,
					absentCount,
				};
			}),
		);

		return meetingsWithCounts;
	}

	async getMeetingById(id: string) {
		return this.meetingRepo.findOne({ where: { id } });
	}

	async updateMeeting(
		id: string,
		data: Partial<CommunityMeeting>,
		scope: 'this' | 'all' | 'all_future' = 'this',
	) {
		const meeting = await this.getMeetingById(id);

		if (!meeting) {
			throw new Error('Meeting not found');
		}

		// Update isRecurrenceTemplate based on recurrenceFrequency
		// If recurrenceFrequency is explicitly being set, update isRecurrenceTemplate accordingly
		if ('recurrenceFrequency' in data) {
			data.isRecurrenceTemplate = !!data.recurrenceFrequency;
		}

		// If not a recurrence template or scope is 'this', do simple update
		if (!meeting.isRecurrenceTemplate || scope === 'this') {
			await this.meetingRepo.update(id, data);
			return this.getMeetingById(id);
		}

		// For recurrence templates with scope 'all' or 'all_future'
		if (scope === 'all') {
			// Update the template - instances are generated on-the-fly
			await this.meetingRepo.update(id, data);
			return this.getMeetingById(id);
		}

		if (scope === 'all_future') {
			// For 'all_future', we update the template which affects all future occurrences
			// Past instances that were already created as exceptions are not affected
			await this.meetingRepo.update(id, data);
			return this.getMeetingById(id);
		}

		return this.getMeetingById(id);
	}

	async deleteMeeting(id: string, scope: 'this' | 'all' | 'all_future' = 'this') {
		const meeting = await this.getMeetingById(id);

		if (!meeting) {
			throw new Error('Meeting not found');
		}

		// If not a recurrence template or scope is 'this', do simple delete
		if (!meeting.isRecurrenceTemplate || scope === 'this') {
			await this.attendanceRepo.delete({ meetingId: id });
			await this.meetingRepo.delete(id);
			return;
		}

		// For recurrence templates
		if (scope === 'all') {
			// Delete all instances and the template
			await this.attendanceRepo.delete({ meetingId: id });
			await this.meetingRepo.delete({ parentMeetingId: id });
			await this.meetingRepo.delete(id);
			return;
		}

		if (scope === 'all_future') {
			// Remove recurrence to stop future occurrences
			// Keep the meeting as a one-time event
			await this.meetingRepo.update(id, {
				recurrenceFrequency: null,
				recurrenceInterval: null,
				recurrenceDayOfWeek: null,
				recurrenceDayOfMonth: null,
				isRecurrenceTemplate: false,
			});
			return;
		}
	}

	// --- Recurrence Instance Management ---

	async createNextMeetingInstance(meetingId: string) {
		// 1. Fetch the meeting
		const meeting = await this.getMeetingById(meetingId);

		if (!meeting) {
			throw new Error('Meeting not found');
		}

		// 2. Validate it's a recurrence template
		if (!meeting.isRecurrenceTemplate) {
			throw new Error('Meeting is not a recurrence template');
		}

		// 3. Calculate next occurrence
		const nextStartDate = calculateNextOccurrence(
			meeting.startDate,
			meeting.recurrenceFrequency,
			meeting.recurrenceInterval,
			meeting.recurrenceDayOfWeek,
			meeting.recurrenceDayOfMonth,
		);

		if (!nextStartDate) {
			throw new Error('Failed to calculate next occurrence');
		}

		// 4. Track if next date is in the past (allow but warn)
		const isPastDate = nextStartDate <= new Date();

		// 5. Check if an instance with this date already exists
		const existingInstance = await this.meetingRepo.findOne({
			where: {
				communityId: meeting.communityId,
				parentMeetingId: meetingId,
				startDate: nextStartDate,
			},
		});

		if (existingInstance) {
			throw new Error('A meeting instance for this date already exists');
		}

		// 6. Check for maximum instances (optional safety limit)
		const existingInstances = await this.meetingRepo.count({
			where: {
				communityId: meeting.communityId,
				parentMeetingId: meetingId,
			},
		});

		if (existingInstances >= 52) {
			// Max 52 instances (1 year of weekly)
			throw new Error('Maximum number of instances reached (52)');
		}

		// 7. Create the new instance with recurrence data copied
		const newMeeting = this.meetingRepo.create({
			communityId: meeting.communityId,
			title: meeting.title,
			description: meeting.description,
			startDate: nextStartDate,
			endDate: meeting.endDate
				? new Date(
						nextStartDate.getTime() + (meeting.endDate.getTime() - meeting.startDate.getTime()),
					)
				: undefined,
			durationMinutes: meeting.durationMinutes,
			isAnnouncement: meeting.isAnnouncement,
			// Copy recurrence configuration so this instance can also create further instances
			recurrenceFrequency: meeting.recurrenceFrequency,
			recurrenceInterval: meeting.recurrenceInterval,
			recurrenceDayOfWeek: meeting.recurrenceDayOfWeek,
			recurrenceDayOfMonth: meeting.recurrenceDayOfMonth,
			flyerTemplate: meeting.flyerTemplate,
			isRecurrenceTemplate: true,
			// Link to parent
			parentMeetingId: meetingId,
			instanceDate: nextStartDate,
		});

		const saved = await this.meetingRepo.save(newMeeting);
		return { meeting: saved, isPastDate };
	}

	// --- Attendance Tracking ---

	async recordAttendance(
		meetingId: string,
		records: { memberId: string; attended: boolean; notes?: string }[],
	) {
		// Clear existing attendance for this meeting to avoid duplicates
		await this.attendanceRepo.delete({ meetingId });

		const attendanceEntries = records.map((record) =>
			this.attendanceRepo.create({
				meetingId,
				memberId: record.memberId,
				attended: record.attended,
				notes: record.notes,
			}),
		);

		return this.attendanceRepo.save(attendanceEntries);
	}

	async getAttendance(meetingId: string) {
		return this.attendanceRepo.find({
			where: { meetingId },
			relations: ['member', 'member.participant'],
		});
	}

	async getPublicCommunities() {
		// Return basic info for active communities (for the public map / search / detail modal)
		return this.communityRepo.find({
			where: { status: 'active' },
			select: [
				'id',
				'name',
				'description',
				'city',
				'state',
				'zipCode',
				'address1',
				'address2',
				'country',
				'parish',
				'diocese',
				'googleMapsUrl',
				'website',
				'facebookUrl',
				'instagramUrl',
				'latitude',
				'longitude',
				'defaultMeetingDayOfWeek',
				'defaultMeetingTime',
				'defaultMeetingDurationMinutes',
				'defaultMeetingDescription',
			],
		});
	}

	async publicRegisterCommunity(data: {
		name: string;
		description?: string;
		address1: string;
		address2?: string;
		city: string;
		state: string;
		zipCode: string;
		country: string;
		latitude: number;
		longitude: number;
		googleMapsUrl?: string;
		parish?: string;
		diocese?: string;
		website?: string;
		facebookUrl?: string;
		instagramUrl?: string;
		contactName: string;
		contactEmail: string;
		contactPhone?: string;
		defaultMeetingDayOfWeek?: string;
		defaultMeetingInterval?: number;
		defaultMeetingTime?: string;
		defaultMeetingDurationMinutes?: number;
		defaultMeetingDescription?: string;
	}) {
		const community = this.communityRepo.create({
			...data,
			createdBy: null,
			status: 'pending',
			submittedAt: new Date(),
		});
		return this.communityRepo.save(community);
	}

	private getNextDayOfWeekDate(dayOfWeek: string, time: string): Date {
		const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
		const targetDay = days.indexOf(dayOfWeek.toLowerCase());
		if (targetDay < 0) return new Date();

		const [hours, minutes] = time.split(':').map(Number);
		const now = new Date();
		const result = new Date(now);
		result.setHours(hours, minutes, 0, 0);

		const currentDay = result.getDay();
		let diff = targetDay - currentDay;
		if (diff < 0 || (diff === 0 && result <= now)) {
			diff += 7;
		}
		result.setDate(result.getDate() + diff);
		return result;
	}

	private async createDefaultMeetingForCommunity(community: Community) {
		if (
			!community.defaultMeetingDayOfWeek ||
			!community.defaultMeetingTime ||
			!community.defaultMeetingInterval
		) {
			return null;
		}

		const startDate = this.getNextDayOfWeekDate(
			community.defaultMeetingDayOfWeek,
			community.defaultMeetingTime,
		);

		const durationMinutes = community.defaultMeetingDurationMinutes ?? 90;

		const meeting = this.meetingRepo.create({
			communityId: community.id,
			title: `Reunión ${community.name}`,
			description: community.defaultMeetingDescription ?? undefined,
			startDate,
			durationMinutes,
			isAnnouncement: false,
			recurrenceFrequency: 'weekly',
			recurrenceInterval: community.defaultMeetingInterval,
			recurrenceDayOfWeek: community.defaultMeetingDayOfWeek,
			isRecurrenceTemplate: true,
		});

		return this.meetingRepo.save(meeting);
	}

	async listPendingCommunities() {
		return this.communityRepo.find({
			where: { status: 'pending' },
			order: { submittedAt: 'DESC' },
		});
	}

	async approveCommunity(id: string, approverId: string) {
		const community = await this.communityRepo.findOne({ where: { id } });
		if (!community) throw new Error('Community not found');
		if (community.status === 'active') return community;

		const wasPending = community.status === 'pending';

		community.status = 'active';
		community.approvedAt = new Date();
		community.approvedBy = approverId;
		community.rejectionReason = undefined;
		const saved = await this.communityRepo.save(community);

		if (wasPending) {
			// Asignar al aprobador como owner para que pueda gestionarla
			// (invitar al responsable como admin después).
			const existingAdmin = await this.adminRepo.findOne({
				where: { communityId: saved.id, userId: approverId },
			});
			if (!existingAdmin) {
				const admin = this.adminRepo.create({
					communityId: saved.id,
					userId: approverId,
					role: 'owner',
					status: 'active',
					acceptedAt: new Date(),
				});
				await this.adminRepo.save(admin);
			}

			// Crear la reunión recurrente por defecto solo la primera vez que se aprueba
			// y si la comunidad capturó el horario al registrarse.
			const existingMeeting = await this.meetingRepo.findOne({
				where: { communityId: saved.id, isRecurrenceTemplate: true },
			});
			if (!existingMeeting) {
				await this.createDefaultMeetingForCommunity(saved);
			}

			// Si existe un User con email == contactEmail, asignarlo automáticamente
			// como admin de la comunidad recién aprobada (parte del flow híbrido).
			if (saved.contactEmail) {
				const userRepo = AppDataSource.getRepository(User);
				const contactUser = await userRepo
					.createQueryBuilder('user')
					.where('LOWER(user.email) = :email', {
						email: saved.contactEmail.toLowerCase().trim(),
					})
					.getOne();
				if (contactUser) {
					await this.linkUserToContactCommunities(contactUser);
				}
			}
		}

		return saved;
	}

	async rejectCommunity(id: string, approverId: string, reason?: string) {
		const community = await this.communityRepo.findOne({ where: { id } });
		if (!community) throw new Error('Community not found');

		community.status = 'rejected';
		community.approvedAt = new Date();
		community.approvedBy = approverId;
		community.rejectionReason = reason;
		return this.communityRepo.save(community);
	}

	async getPublicMeetings() {
		// Return upcoming public meetings (next 30 days)
		const now = new Date();
		const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

		return this.meetingRepo.find({
			where: {
				startDate: MoreThanOrEqual(now),
				isAnnouncement: false,
				// We'd ideally filter by date range but TypeORM simple find is limited.
				// Let's just get future ones and limit.
			},
			relations: ['community'],
			order: { startDate: 'ASC' },
			take: 20,
		});
	}

	async getPublicAttendanceData(communityId: string, meetingId: string) {
		// Verify community and meeting exist
		const community = await this.communityRepo.findOne({ where: { id: communityId } });
		const meeting = await this.meetingRepo.findOne({ where: { id: meetingId, communityId } });

		if (!community || !meeting) {
			return null;
		}

		// Get members with their participants. SECURITY: solo active_member en endpoint
		// público — no debe exponer PII de gente que ya no participa (pending, no_answer,
		// another_group, far_from_location). Las asistencias previas registradas para
		// miembros que cambiaron de estado se mantienen en attendance, pero el roster
		// público de la asistencia solo muestra a quienes están activos al momento.
		const members = await this.memberRepo.find({
			where: { communityId, state: 'active_member' },
			relations: ['participant'],
			order: { joinedAt: 'ASC' },
		});

		// Get existing attendance
		const attendance = await this.attendanceRepo.find({
			where: { meetingId },
		});

		// Return combined data
		return {
			communityId,
			communityName: community.name,
			meetingId,
			meetingTitle: meeting.title,
			meetingStartDate: meeting.startDate,
			members: members.map((member) => ({
				id: member.id,
				participant: {
					firstName: member.participant.firstName,
					lastName: member.participant.lastName,
					cellPhone: member.participant.cellPhone,
					homePhone: member.participant.homePhone,
					workPhone: member.participant.workPhone,
				},
				attended: attendance.find((a) => a.memberId === member.id)?.attended || false,
			})),
		};
	}

	async recordSingleAttendance(
		communityId: string,
		meetingId: string,
		memberId: string,
		attended: boolean,
	) {
		// Verify member belongs to community
		const member = await this.memberRepo.findOne({
			where: { id: memberId, communityId },
		});

		if (!member) {
			throw new Error('Member not found');
		}

		// Upsert attendance record
		const existing = await this.attendanceRepo.findOne({
			where: { meetingId, memberId },
		});

		if (existing) {
			existing.attended = attended;
			existing.recordedAt = new Date();
			return this.attendanceRepo.save(existing);
		} else {
			const attendance = this.attendanceRepo.create({
				meetingId,
				memberId,
				attended,
				recordedAt: new Date(),
			});
			return this.attendanceRepo.save(attendance);
		}
	}

	// --- Dashboard & Analytics ---

	async getDashboardStats(communityId: string) {
		const now = new Date();

		// 1. Members and Basic Counts
		const members = await this.memberRepo.find({ where: { communityId } });
		const activeMembers = members.filter((m) => m.state === 'active_member');

		// 2. Member State Distribution
		const stateDistribution = members.reduce(
			(acc, member) => {
				acc[member.state] = (acc[member.state] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		// 3. Meeting Counts
		const allMeetings = await this.meetingRepo.find({
			where: { communityId, isAnnouncement: false },
			order: { startDate: 'DESC' },
		});

		const pastMeetings = allMeetings.filter((m) => m.startDate <= now);
		const upcomingMeetings = allMeetings.filter((m) => m.startDate > now);

		// 4. Average Attendance and Recent Meetings
		let averageAttendance = 0;
		const recentMeetings = [];
		const frequencyDistribution = {
			high: 0,
			medium: 0,
			low: 0,
			none: 0,
		};

		if (allMeetings.length > 0) {
			// A meeting is "relevant" for attendance if it's in the past OR has at least one attendance record
			const relevantUpcomingWithAttendance = await Promise.all(
				upcomingMeetings.map(async (m) => {
					const count = await this.attendanceRepo.count({ where: { meetingId: m.id } });
					return count > 0 ? m : null;
				}),
			);

			const relevantMeetings = [
				...pastMeetings,
				...relevantUpcomingWithAttendance.filter((m): m is CommunityMeeting => m !== null),
			].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());

			const meetingsForAvg = relevantMeetings.slice(0, 10);
			let totalAttendanceRate = 0;
			let meetingsWithValidRate = 0;

			for (const meeting of relevantMeetings) {
				// Eligible members = joined before or on meeting date
				let eligibleMemberCount = activeMembers.filter(
					(m) => m.joinedAt <= meeting.startDate,
				).length;

				// Fallback: If no members joined yet (historical data), use current active members count
				if (eligibleMemberCount === 0) {
					eligibleMemberCount = activeMembers.length;
				}

				let rate = 0;
				if (eligibleMemberCount > 0) {
					const attendanceCount = await this.attendanceRepo.count({
						where: {
							meetingId: meeting.id,
							attended: true,
						},
					});
					rate = (attendanceCount / eligibleMemberCount) * 100;

					// Add to average if it's one of the last 10
					if (meetingsForAvg.some((m) => m.id === meeting.id)) {
						totalAttendanceRate += rate;
						meetingsWithValidRate++;
					}
				}

				// If it's one of the last 5, add to recent meetings list
				if (recentMeetings.length < 5 && meeting.startDate <= now) {
					recentMeetings.push({
						id: meeting.id,
						title: meeting.title,
						startDate: meeting.startDate,
						attendancePercent: Math.round(rate),
					});
				}
			}

			if (meetingsWithValidRate > 0) {
				averageAttendance = totalAttendanceRate / meetingsWithValidRate;
			}

			// 5. Participation Frequency (Calculated on current members over last 10 relevant meetings)
			const last10MeetingIdsForFreq = meetingsForAvg.map((m) => m.id);

			for (const member of members) {
				// A meeting is "valid" for a member if it occurred after they joined
				// OR if they have an attendance record for it (handles historical data)
				const attendances = await this.attendanceRepo.find({
					where: {
						memberId: member.id,
						meetingId: In(last10MeetingIdsForFreq),
						attended: true,
					},
				});
				const attendedMeetingIds = new Set(attendances.map((a) => a.meetingId));

				const validMeetingsForMember = meetingsForAvg.filter(
					(m) => m.startDate >= member.joinedAt || attendedMeetingIds.has(m.id),
				);

				if (validMeetingsForMember.length === 0) {
					frequencyDistribution.none++;
					continue;
				}

				const rate = attendedMeetingIds.size / validMeetingsForMember.length;
				if (rate >= 0.75) frequencyDistribution.high++;
				else if (rate >= 0.25) frequencyDistribution.medium++;
				else if (rate > 0) frequencyDistribution.low++;
				else frequencyDistribution.none++;
			}
		} else {
			frequencyDistribution.none = members.length;
		}

		return {
			memberCount: members.length,
			meetingCount: pastMeetings.length,
			upcomingMeetingsCount: upcomingMeetings.length,
			averageAttendance,
			recentMeetings,
			memberStateDistribution: Object.entries(stateDistribution).map(([state, count]) => ({
				state,
				count,
			})),
			participationFrequency: Object.entries(frequencyDistribution).map(([frequency, count]) => ({
				frequency,
				count,
			})),
		};
	}

	// --- Admin Management ---

	async inviteAdmin(communityId: string, email: string, invitedBy: string) {
		// Find user by email
		const userRepo = AppDataSource.getRepository(User);
		const normalizedEmail = email.toLowerCase().trim();
		const user = await userRepo
			.createQueryBuilder('user')
			.where('LOWER(user.email) = :email', { email: normalizedEmail })
			.getOne();

		if (!user) {
			// In a real app, we might create a pending user or send an invitation literal
			// For now, let's assume the user must exist
			throw new Error('User not found');
		}

		const invitationToken = (await import('crypto')).randomBytes(32).toString('hex');
		const invitationExpiresAt = new Date();
		invitationExpiresAt.setDate(invitationExpiresAt.getDate() + 7);

		const admin = this.adminRepo.create({
			communityId,
			userId: user.id,
			role: 'admin',
			status: 'pending',
			invitedBy,
			invitationToken,
			invitationExpiresAt,
		});

		return this.adminRepo.save(admin);
	}

	async getAdmins(communityId: string) {
		return this.adminRepo.find({
			where: { communityId },
			relations: ['user', 'inviter'],
		});
	}

	async getInvitationStatus(token: string) {
		const invitation = await this.adminRepo.findOne({
			where: { invitationToken: token, status: 'pending' },
			relations: ['community', 'user'],
		});

		if (!invitation) return null;

		if (invitation.invitationExpiresAt && invitation.invitationExpiresAt < new Date()) {
			return { valid: false, message: 'Invitation has expired' };
		}

		return {
			valid: true,
			community: invitation.community,
			user: invitation.user,
			invitationExpiresAt: invitation.invitationExpiresAt,
		};
	}

	async acceptInvitation(token: string, userId: string) {
		const invitation = await this.adminRepo.findOne({
			where: { invitationToken: token, userId, status: 'pending' },
		});

		if (!invitation) {
			throw new Error('Invalid or expired invitation');
		}

		// SECURITY (Vuln 2 hardening): enforce TTL on accept side.
		// The DB column may hold a stale expires-at from an earlier 7-day token;
		// reject if past. We compare against current time, not migration time.
		if (
			invitation.invitationExpiresAt &&
			invitation.invitationExpiresAt.getTime() < Date.now()
		) {
			const err: any = new Error('Invitation has expired');
			err.code = 'INVITATION_EXPIRED';
			throw err;
		}

		// SECURITY (Vuln 2 hardening): require email verification before honoring
		// the link request. An attacker who creates an unverified account with
		// the victim's email cannot consume a leaked/replayed token without
		// also controlling the victim's inbox (which they don't — the
		// verification email goes to that inbox).
		const user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
		if (!user) {
			const err: any = new Error('User not found');
			err.code = 'USER_NOT_FOUND';
			throw err;
		}
		if (!user.emailVerified) {
			const err: any = new Error('Email verification required');
			err.code = 'EMAIL_NOT_VERIFIED';
			throw err;
		}

		invitation.status = 'active';
		invitation.acceptedAt = new Date();
		invitation.invitationToken = undefined;

		const saved = await this.adminRepo.save(invitation);

		// Invalidate user permission cache
		const { performanceOptimizationService } = await import('./performanceOptimizationService');
		performanceOptimizationService.invalidateUserPermissionCache(userId);
		performanceOptimizationService.invalidateUserRetreatCache(userId);
		performanceOptimizationService.invalidateUserPermissionsResultCache(userId);

		return saved;
	}

	async revokeAdmin(communityId: string, userId: string) {
		const admin = await this.adminRepo.findOne({ where: { communityId, userId } });
		if (admin && admin.role !== 'owner') {
			await this.adminRepo.delete(admin.id);
		} else if (admin && admin.role === 'owner') {
			throw new Error('Cannot revoke owner');
		}
	}

	async findMemberByEmailAndCommunity(email: string, communityId: string) {
		const normalizedEmail = email.toLowerCase().trim();
		const participant = await this.participantRepo
			.createQueryBuilder('participant')
			.where('LOWER(participant.email) = :email', { email: normalizedEmail })
			.getOne();

		if (!participant) return null;

		return await this.memberRepo.findOne({
			where: { communityId, participantId: participant.id },
		});
	}

	async createPublicJoinRequest(
		communityId: string,
		participantData: {
			firstName: string;
			lastName: string;
			email: string;
			cellPhone?: string;
		},
	) {
		const normalizedEmail = participantData.email.toLowerCase().trim();

		// Todo el flujo dentro de una transacción para serializar el check+insert
		// y evitar race conditions cuando dos requests llegan con el mismo email.
		// SQLite serializa transacciones a nivel de file lock.
		const result = await AppDataSource.transaction(async (manager) => {
			const memberRepoTx = manager.getRepository(CommunityMember);
			const participantRepoTx = manager.getRepository(Participant);

			// Re-check duplicado dentro de la transacción (más confiable que el check
			// del controller que está fuera del scope transaccional).
			const existing = await memberRepoTx
				.createQueryBuilder('member')
				.innerJoin('member.participant', 'participant')
				.where('member.communityId = :communityId', { communityId })
				.andWhere('LOWER(participant.email) = :email', { email: normalizedEmail })
				.getOne();

			if (existing) {
				const err = new Error('Already a member of this community');
				(err as any).code = 'ALREADY_MEMBER';
				throw err;
			}

			// 1. Crear participant
			const participant = participantRepoTx.create({
				firstName: participantData.firstName,
				lastName: participantData.lastName,
				email: normalizedEmail,
				cellPhone: participantData.cellPhone || '',
				retreatId: null,
				type: 'walker',
				id_on_retreat: 0,
				birthDate: new Date(),
				maritalStatus: 'O',
				street: 'N/A',
				houseNumber: 'N/A',
				postalCode: '00000',
				neighborhood: 'N/A',
				city: 'N/A',
				state: 'N/A',
				country: 'N/A',
				occupation: 'N/A',
				snores: false,
				hasMedication: false,
				hasDietaryRestrictions: false,
				sacraments: ['none'],
				emergencyContact1Name: 'N/A',
				emergencyContact1Relation: 'N/A',
				emergencyContact1CellPhone: participantData.cellPhone || 'N/A',
			});
			const savedParticipant = await participantRepoTx.save(participant);

			// G1: vincular Participant a User existente con mismo email (dentro de la TX)
			const userRepoTx = manager.getRepository(User);
			const matchingUser = await userRepoTx
				.createQueryBuilder('user')
				.where('LOWER(user.email) = :email', { email: normalizedEmail })
				.getOne();
			if (matchingUser) {
				await participantRepoTx.update(savedParticipant.id, { userId: matchingUser.id });
				savedParticipant.userId = matchingUser.id;
			}

			// 2. Add to community con state='pending_verification'.
			// El UNIQUE constraint (communityId, participantId) en BD es backup
			// si el check anterior falla (defensa en profundidad).
			let savedMember;
			try {
				const member = memberRepoTx.create({
					communityId,
					participantId: savedParticipant.id,
					state: 'pending_verification',
				});
				savedMember = await memberRepoTx.save(member);
			} catch (dbErr: any) {
				if (
					dbErr?.code === 'SQLITE_CONSTRAINT' ||
					dbErr?.message?.includes('UNIQUE') ||
					dbErr?.message?.includes('unique')
				) {
					const err = new Error('Already a member of this community');
					(err as any).code = 'ALREADY_MEMBER';
					throw err;
				}
				throw dbErr;
			}

			// 3. Return member con participant
			return await memberRepoTx.findOne({
				where: { id: savedMember.id },
				relations: ['participant'],
			});
		});

		// 4. Notificar — fire-and-forget; un fallo de email NO debe romper la creación
		if (result?.participant) {
			this.notifyJoinRequest(communityId, result.participant).catch((err) => {
				console.error('[communityService] notifyJoinRequest failed:', err);
			});
		}

		return result;
	}

	/**
	 * Crea SOLICITUDES DE VINCULACIÓN pendientes con comunidades cuyo `contactEmail`
	 * coincide con `user.email`. NO otorga acceso automáticamente — el verdadero líder
	 * debe aceptar via link enviado al `contactEmail` original.
	 *
	 * SECURITY (Vuln 2 fix): el flujo previo creaba CommunityAdmin con `status='active'`
	 * y `acceptedAt=now` automáticamente al registrar el user — lo que permitía a un
	 * atacante tomar control de una comunidad ajena registrándose con el email del
	 * contacto público. Ahora se crea `status='pending'` con `invitationToken` y se
	 * envía email al `community.contactEmail` (NO al email del registro) con un link
	 * para aceptar. El user nunca obtiene acceso hasta que el verdadero líder confirme.
	 *
	 * Se invoca desde:
	 *  - `authController.register()` — cuando alguien crea cuenta con email matching.
	 *  - `approveCommunity()` — cuando se aprueba una comunidad y el User ya existe.
	 *
	 * Reglas de asignación al final del flujo (cuando se acepta el token):
	 *  - Si la comunidad NO tiene owner activo: el user es asignado como `owner`.
	 *  - Si la comunidad YA tiene otro owner activo: el user es asignado como `admin`.
	 *
	 * Devuelve el array de comunidades para las que se creó la solicitud pending.
	 */
	async linkUserToContactCommunities(user: User): Promise<Community[]> {
		if (!user?.email) return [];
		const normalizedEmail = user.email.toLowerCase().trim();

		const communities = await this.communityRepo
			.createQueryBuilder('community')
			.where('LOWER(community.contactEmail) = :email', { email: normalizedEmail })
			.andWhere('community.status IN (:...statuses)', { statuses: ['pending', 'active'] })
			.getMany();

		const linked: Community[] = [];
		for (const community of communities) {
			// Skip si ya es admin/owner (active o pending)
			const existing = await this.adminRepo.findOne({
				where: { communityId: community.id, userId: user.id },
			});
			if (existing) continue;

			// Role propuesto (se confirma al aceptar): owner si nadie activo, sino admin
			const hasOwner = await this.adminRepo.findOne({
				where: { communityId: community.id, role: 'owner', status: 'active' },
			});
			const role: 'owner' | 'admin' = hasOwner ? 'admin' : 'owner';

			// Token aleatorio de 32 bytes (256 bits) hexadecimal — no guessable
			const crypto = await import('crypto');
			const invitationToken = crypto.randomBytes(32).toString('hex');
			// 48h TTL (reducido desde 7 días como parte del hardening de Vuln 2):
			// reduce la ventana en que un atacante puede sentarse a esperar que el
			// dueño real haga click sin darse cuenta.
			const invitationExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

			const adminRecord = this.adminRepo.create({
				communityId: community.id,
				userId: user.id,
				role,
				status: 'pending', // ← cambio crítico: ya no es 'active' automáticamente
				invitedBy: hasOwner?.userId || user.id,
				invitedAt: new Date(),
				invitationToken,
				invitationExpiresAt,
				// acceptedAt queda null hasta que el verdadero líder acepte
			});
			await this.adminRepo.save(adminRecord);
			linked.push(community);
		}

		// Notificar al CONTACT EMAIL (no al user) — fire-and-forget
		// Si Mallory registra con email ajeno, el email llega al líder real, no a ella.
		if (linked.length > 0) {
			this.notifyContactEmailOfLinkRequest(user, linked).catch((err) => {
				console.error('[communityService] notifyContactEmailOfLinkRequest failed:', err);
			});
		}

		return linked;
	}

	/**
	 * SECURITY (Vuln 2 fix): envía email al `community.contactEmail` (NO al user.email)
	 * con link para aceptar la vinculación. El asunto y body son intencionalmente
	 * claros: "Alguien con tu email se registró. Si fuiste tú, acepta. Si no, ignora."
	 *
	 * El link apunta al frontend, que lleva al user al flow estándar de
	 * `POST /communities/invitations/accept` con el token.
	 */
	async notifyContactEmailOfLinkRequest(
		user: User,
		communities: Community[],
	): Promise<void> {
		const emailService = new EmailService();
		if (!emailService.isSmtpConfigured()) return;
		const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

		// Re-cargar admin records para obtener tokens
		const adminRecords = await this.adminRepo.find({
			where: {
				userId: user.id,
				communityId: In(communities.map((c) => c.id)),
				status: 'pending',
			},
		});
		const tokensByCommunity = new Map(adminRecords.map((a) => [a.communityId, a.invitationToken]));

		for (const community of communities) {
			const token = tokensByCommunity.get(community.id);
			if (!token || !community.contactEmail) continue;
			const acceptUrl = `${frontendUrl}/invitations/accept?token=${token}`;

			const tplBody = await this.renderTemplate(
				'COMMUNITY_LINK_REQUEST_CONFIRM',
				community.id,
				{
					userEmail: user.email,
					communityName: community.name,
					acceptUrl,
				},
			);
			const html = tplBody
				? this.wrapTemplateHtml(tplBody)
				: `
				<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
					<h2 style="color:#1c1917;margin-bottom:8px;">Solicitud de acceso a tu comunidad</h2>
					<p style="color:#57534e;margin:0 0 16px;">Alguien creó una cuenta en Retiros Emaús usando el correo <strong>${escapeHtml(user.email)}</strong> — el mismo correo registrado como contacto de <strong>${escapeHtml(community.name)}</strong>.</p>
					<p style="color:#57534e;margin:0 0 16px;">Si fuiste tú, haz click para tomar control de tu comunidad. Si no reconoces esta cuenta, ignora este correo: sin tu confirmación nadie obtiene acceso.</p>
					<div style="text-align:center;margin:24px 0;">
						<a href="${acceptUrl}" style="display:inline-block;padding:12px 32px;background:#1c1917;color:white;text-decoration:none;border-radius:8px;font-weight:500;">Aceptar y tomar control</a>
					</div>
					<p style="color:#a8a29e;margin:24px 0 0;font-size:12px;">Este link expira en 7 días. Si no es válido, los coordinadores de Retiros Emaús pueden ayudarte manualmente.</p>
					<p style="color:#a8a29e;margin:8px 0 0;font-size:12px;">Retiros Emaús — Seguridad</p>
				</div>
			`.trim();

			try {
				await emailService.sendEmail({
					to: community.contactEmail,
					subject: `Confirma acceso a ${community.name}`,
					html,
				});
			} catch (err) {
				console.error('[notifyContactEmailOfLinkRequest] Failed:', err);
			}

			// ALSO notificar al owner activo (si existe y es distinto al contactEmail).
			// Defense-in-depth: si el contactEmail está comprometido o desactualizado,
			// el verdadero owner se entera de que hay una solicitud pending.
			const owner = await this.adminRepo.findOne({
				where: { communityId: community.id, role: 'owner', status: 'active' },
				relations: ['user'],
			});
			if (
				owner?.user?.email &&
				owner.user.email.toLowerCase() !== (community.contactEmail || '').toLowerCase()
			) {
				const ownerHtml = `
					<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
						<h2 style="color:#1c1917;margin-bottom:8px;">Aviso: solicitud pending en tu comunidad</h2>
						<p style="color:#57534e;margin:0 0 16px;">Alguien con correo <strong>${escapeHtml(user.email)}</strong> creó una cuenta en Retiros Emaús que coincide con el contacto registrado de tu comunidad <strong>${escapeHtml(community.name)}</strong>.</p>
						<p style="color:#57534e;margin:0 0 16px;">Se envió una solicitud de acceso pendiente al correo de contacto (<strong>${escapeHtml(community.contactEmail || '')}</strong>). Si esa persona acepta el link, obtendrá rol de <strong>${owner.user.email === community.contactEmail ? 'owner' : 'admin'}</strong> en la comunidad.</p>
						<p style="color:#57534e;margin:0 0 16px;">Si no reconoces esta cuenta o sospechas un intento de toma de control, contacta a soporte para revisar la solicitud antes de que sea aceptada.</p>
						<p style="color:#a8a29e;margin:24px 0 0;font-size:12px;">Retiros Emaús — Seguridad</p>
					</div>
				`.trim();
				try {
					await emailService.sendEmail({
						to: owner.user.email,
						subject: `[Aviso] Solicitud pending en ${community.name}`,
						html: ownerHtml,
					});
				} catch (err) {
					console.error('[notifyContactEmailOfLinkRequest] owner alert failed:', err);
				}
			}
		}
	}

	/**
	 * Email de bienvenida cuando se vincula un user con sus comunidades.
	 * Fire-and-forget: errores no rompen el flujo.
	 */
	async notifyLeaderLinked(user: User, communities: Community[]): Promise<void> {
		if (!user.email || communities.length === 0) return;
		const emailService = new EmailService();
		if (!emailService.isSmtpConfigured()) return;

		const list = communities
			.map((c) => `<li><strong>${escapeHtml(c.name)}</strong>${c.status === 'pending' ? ' <em>(pendiente de aprobación)</em>' : ''}</li>`)
			.join('');

		const html = `
			<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
				<h2 style="color:#1c1917;margin-bottom:8px;">Hola ${escapeHtml(user.displayName || '')}</h2>
				<p style="color:#57534e;margin:0 0 16px;">Detectamos que tu correo coincide con el contacto registrado de las siguientes ${communities.length === 1 ? 'comunidad' : 'comunidades'}:</p>
				<ul style="color:#57534e;margin:0 0 16px;padding-left:20px;">${list}</ul>
				<p style="color:#57534e;margin:0 0 16px;">Ahora tienes acceso para gestionar${communities.length === 1 ? 'la' : 'las'} desde tu panel.</p>
				<p style="color:#a8a29e;margin:24px 0 0;font-size:12px;">Retiros Emaús</p>
			</div>
		`.trim();

		try {
			await emailService.sendEmail({
				to: user.email,
				subject: `Acceso a ${communities.length === 1 ? 'tu comunidad' : 'tus comunidades'} en Emaús`,
				html,
			});
		} catch (err) {
			console.error('[notifyLeaderLinked] Failed:', err);
		}
	}

	/**
	 * Envía dos notificaciones cuando alguien hace una public join request:
	 *  1) A los admins activos de la comunidad (owner + admin)
	 *  2) Confirmación al solicitante
	 *
	 * Implementado fire-and-forget para que un fallo de SMTP no rompa el flujo
	 * de creación del miembro. Cada email tiene su propio try/catch.
	 */
	async notifyJoinRequest(communityId: string, participant: Participant): Promise<void> {
		const community = await this.communityRepo.findOne({ where: { id: communityId } });
		if (!community) return;

		const emailService = new EmailService();
		if (!emailService.isSmtpConfigured()) {
			console.warn('[notifyJoinRequest] SMTP no configurado, omitiendo emails');
			return;
		}

		// 1) Notificar a admins activos
		const admins = await this.adminRepo.find({
			where: { communityId, status: 'active' },
			relations: ['user'],
		});

		const adminEmails = admins
			.filter((a) => a.user?.email && (a.role === 'owner' || a.role === 'admin'))
			.map((a) => ({ email: a.user.email, name: a.user.displayName || a.user.email }));

		const requesterName = `${participant.firstName} ${participant.lastName}`.trim();
		const requesterPhone = participant.cellPhone || '—';

		const adminSubject = `Nueva solicitud para unirse a ${community.name}`;
		// Try DB template; fall back to inline HTML
		const tplBody = await this.renderTemplate('COMMUNITY_JOIN_REQUEST_ADMIN', community.id, {
			communityName: community.name,
			requesterName,
			requesterEmail: participant.email || '',
			requesterPhone,
		});
		const adminHtml = tplBody
			? this.wrapTemplateHtml(tplBody)
			: `
			<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
				<h2 style="color:#1c1917;margin-bottom:8px;">Nueva solicitud de unión</h2>
				<p style="color:#57534e;margin:0 0 24px;">Alguien quiere unirse a <strong>${escapeHtml(community.name)}</strong>.</p>
				<div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:20px;margin-bottom:24px;">
					<p style="margin:0 0 8px;"><strong>Nombre:</strong> ${escapeHtml(requesterName)}</p>
					<p style="margin:0 0 8px;"><strong>Email:</strong> <a href="mailto:${escapeHtml(participant.email)}" style="color:#8DAA91;">${escapeHtml(participant.email)}</a></p>
					<p style="margin:0;"><strong>Teléfono:</strong> ${escapeHtml(requesterPhone)}</p>
				</div>
				<p style="color:#57534e;margin:0 0 16px;font-size:14px;">El nuevo miembro fue agregado con estado <em>pendiente de verificación</em>. Ingresa al panel para revisarlo y aprobarlo.</p>
				<p style="color:#a8a29e;margin:24px 0 0;font-size:12px;">Este correo se envió automáticamente desde Retiros Emaús.</p>
			</div>
		`.trim();

		for (const admin of adminEmails) {
			try {
				await emailService.sendEmail({
					to: admin.email,
					subject: adminSubject,
					html: adminHtml,
				});
			} catch (err) {
				console.error(`[notifyJoinRequest] Failed to email admin ${admin.email}:`, err);
			}
		}

		// 2) Confirmación al solicitante
		if (participant.email) {
			const requesterHtml = `
				<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
					<h2 style="color:#1c1917;margin-bottom:8px;">Gracias por tu interés, ${escapeHtml(participant.firstName)}</h2>
					<p style="color:#57534e;margin:0 0 16px;">Recibimos tu solicitud para unirte a <strong>${escapeHtml(community.name)}</strong>.</p>
					<p style="color:#57534e;margin:0 0 16px;">Los coordinadores de la comunidad fueron notificados y se pondrán en contacto contigo pronto en este correo o al teléfono que nos compartiste.</p>
					<div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:16px;margin:24px 0;">
						<p style="margin:0;color:#78716c;font-size:13px;">Si no enviaste esta solicitud, puedes ignorar este correo.</p>
					</div>
					<p style="color:#a8a29e;margin:24px 0 0;font-size:12px;">Retiros Emaús</p>
				</div>
			`.trim();
			try {
				await emailService.sendEmail({
					to: participant.email,
					subject: `Recibimos tu solicitud — ${community.name}`,
					html: requesterHtml,
				});
			} catch (err) {
				console.error('[notifyJoinRequest] Failed to email requester:', err);
			}
		}
	}

	/**
	 * G2 del community membership journey: notifica al solicitante cuando su
	 * estado cambia desde `pending_verification` a otro estado.
	 *  - active_member → email de bienvenida con datos de próxima reunión
	 *  - no_answer / another_group / far_from_location → email cordial de seguimiento
	 *
	 * Fire-and-forget: errores se loguean pero no rompen el flujo de updateMemberState.
	 */
	async notifyMemberStateChange(
		member: CommunityMember & { participant?: Participant; community?: Community },
		previousState: string,
		newState: string,
	): Promise<void> {
		const participant = member.participant;
		const community = member.community;
		if (!participant?.email || !community) return;

		const emailService = new EmailService();
		if (!emailService.isSmtpConfigured()) return;

		const recipientName = participant.firstName || '';
		let subject: string;
		let bodyHtml: string;

		if (newState === 'active_member') {
			// Buscar próxima reunión para incluirla en el email de bienvenida
			const nextMeeting = await this.meetingRepo
				.createQueryBuilder('m')
				.where('m.communityId = :cid', { cid: community.id })
				.andWhere('m.startDate >= datetime("now")')
				.andWhere('m.isRecurrenceTemplate = 0 OR m.isRecurrenceTemplate IS NULL')
				.orderBy('m.startDate', 'ASC')
				.getOne();

			const meetingBlock = nextMeeting
				? `
				<div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:16px;margin:16px 0;">
					<p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#8DAA91;">Próxima reunión</p>
					<p style="margin:0;font-weight:500;">${escapeHtml(nextMeeting.title || 'Reunión')}</p>
					<p style="margin:4px 0 0;color:#78716c;font-size:13px;">${escapeHtml(new Date(nextMeeting.startDate).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short' }))}</p>
				</div>`
				: '';

			subject = `¡Bienvenido a ${community.name}!`;
			const welcomeTpl = await this.renderTemplate(
				'COMMUNITY_MEMBER_APPROVED',
				community.id,
				{
					firstName: recipientName,
					communityName: community.name,
				},
			);
			bodyHtml = welcomeTpl
				? this.wrapTemplateHtml(welcomeTpl) + (meetingBlock ? `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:0 24px 24px;">${meetingBlock}</div>` : '')
				: `
				<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
					<h2 style="color:#1c1917;margin-bottom:8px;">¡Bienvenido, ${escapeHtml(recipientName)}!</h2>
					<p style="color:#57534e;margin:0 0 16px;">Los coordinadores de <strong>${escapeHtml(community.name)}</strong> aprobaron tu solicitud. Ya formas parte de la comunidad.</p>
					${meetingBlock}
					<p style="color:#57534e;margin:16px 0;">Te enviaremos avisos cuando haya reuniones próximas.</p>
					<p style="color:#a8a29e;margin:24px 0 0;font-size:12px;">Retiros Emaús</p>
				</div>
			`.trim();
		} else {
			// Rechazo "suave" — no_answer, another_group, far_from_location
			subject = `Tu solicitud para ${community.name}`;
			bodyHtml = `
				<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
					<h2 style="color:#1c1917;margin-bottom:8px;">Hola ${escapeHtml(recipientName)}</h2>
					<p style="color:#57534e;margin:0 0 16px;">Los coordinadores de <strong>${escapeHtml(community.name)}</strong> revisaron tu solicitud y por el momento no pueden integrarte como miembro activo.</p>
					<p style="color:#57534e;margin:0 0 16px;">Si crees que es un error o quieres más información, contacta directamente a la comunidad respondiendo a este correo.</p>
					<p style="color:#a8a29e;margin:24px 0 0;font-size:12px;">Retiros Emaús</p>
				</div>
			`.trim();
		}

		try {
			await emailService.sendEmail({
				to: participant.email,
				subject,
				html: bodyHtml,
			});
		} catch (err) {
			console.error('[notifyMemberStateChange] Failed:', err);
		}
	}

	/**
	 * G4 del community membership journey: devuelve las comunidades donde el user
	 * es `active_member` (no admin) con sus próximas reuniones reales (no plantillas).
	 *
	 * Match: `participant.userId = userId` AND `community_member.state = 'active_member'`.
	 * Por cada comunidad: hasta 3 próximas reuniones ordenadas por fecha ASC.
	 */
	async getMyCommunitiesWithMeetings(userId: string) {
		// Encontrar memberships activos del user
		const members = await this.memberRepo
			.createQueryBuilder('m')
			.innerJoinAndSelect('m.community', 'c')
			.innerJoin('m.participant', 'p')
			.where('p.userId = :userId', { userId })
			.andWhere('m.state = :state', { state: 'active_member' })
			.andWhere('c.status = :cs', { cs: 'active' })
			.getMany();

		// Para cada comunidad, próximas 3 reuniones reales (no plantillas)
		const result = [];
		for (const m of members) {
			const upcoming = await this.meetingRepo
				.createQueryBuilder('meeting')
				.where('meeting.communityId = :cid', { cid: m.community.id })
				.andWhere('meeting.startDate >= datetime("now")')
				.andWhere('(meeting.isRecurrenceTemplate IS NULL OR meeting.isRecurrenceTemplate = 0)')
				.orderBy('meeting.startDate', 'ASC')
				.limit(3)
				.getMany();

			result.push({
				community: m.community,
				memberId: m.id,
				joinedAt: m.joinedAt,
				upcomingMeetings: upcoming,
			});
		}
		return result;
	}

	/**
	 * G3 del community membership journey: notifica por email a todos los miembros
	 * activos de la comunidad cuando se crea una reunión, incluyendo link al endpoint
	 * público de asistencia para que puedan confirmar.
	 *
	 * Fire-and-forget: errores se loguean pero no rompen el flujo. Se envía un email
	 * por destinatario (no BCC) para personalización futura.
	 */
	async notifyMembersOfMeeting(meetingId: string, expectedCommunityId?: string): Promise<void> {
		const meeting = await this.meetingRepo.findOne({ where: { id: meetingId } });
		if (!meeting) return;
		// Defense-in-depth: si el caller pasó el communityId esperado, validar que
		// el meeting realmente pertenece. Cierra cross-tenant aunque el middleware falle.
		if (expectedCommunityId && meeting.communityId !== expectedCommunityId) {
			const err = new Error('Meeting does not belong to the specified community');
			(err as any).code = 'MEETING_COMMUNITY_MISMATCH';
			throw err;
		}
		const community = await this.communityRepo.findOne({ where: { id: meeting.communityId } });
		if (!community) return;

		const emailService = new EmailService();
		if (!emailService.isSmtpConfigured()) return;

		// Miembros activos con email
		const members = await this.memberRepo
			.createQueryBuilder('m')
			.innerJoinAndSelect('m.participant', 'p')
			.where('m.communityId = :cid', { cid: community.id })
			.andWhere('m.state = :state', { state: 'active_member' })
			.andWhere('p.email IS NOT NULL AND p.email != \'\'')
			.getMany();

		if (members.length === 0) return;

		const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
		const attendanceLink = `${frontendUrl}/public/attendance/${community.id}/${meeting.id}`;
		const meetingDate = new Date(meeting.startDate).toLocaleString('es-MX', {
			dateStyle: 'full',
			timeStyle: 'short',
		});

		const subject = `Próxima reunión de ${community.name}`;

		for (const member of members) {
			const p = member.participant;
			if (!p?.email) continue;

			const tplBody = await this.renderTemplate('COMMUNITY_MEETING_INVITATION', community.id, {
				firstName: p.firstName || '',
				communityName: community.name,
				meetingTitle: meeting.title || 'Reunión',
				meetingDate,
				attendanceLink,
			});
			const html = tplBody
				? this.wrapTemplateHtml(tplBody)
				: `
				<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
					<h2 style="color:#1c1917;margin-bottom:8px;">Hola ${escapeHtml(p.firstName || '')}</h2>
					<p style="color:#57534e;margin:0 0 16px;">Hay una nueva reunión programada en <strong>${escapeHtml(community.name)}</strong>:</p>
					<div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:20px;margin-bottom:24px;">
						<p style="margin:0 0 6px;font-weight:600;font-size:18px;">${escapeHtml(meeting.title || 'Reunión')}</p>
						<p style="margin:0 0 8px;color:#78716c;">${escapeHtml(meetingDate)}</p>
						${meeting.description ? `<p style="margin:8px 0 0;color:#57534e;font-size:14px;">${escapeHtml(meeting.description)}</p>` : ''}
					</div>
					<p style="margin:0 0 16px;">
						<a href="${attendanceLink}" style="display:inline-block;padding:12px 24px;background:#1c1917;color:white;text-decoration:none;border-radius:8px;font-weight:500;">Confirmar asistencia</a>
					</p>
					<p style="color:#a8a29e;margin:24px 0 0;font-size:12px;">Retiros Emaús — Comunidad ${escapeHtml(community.name)}</p>
				</div>
			`.trim();

			try {
				await emailService.sendEmail({ to: p.email, subject, html });
			} catch (err) {
				console.error(`[notifyMembersOfMeeting] Failed to email ${p.email}:`, err);
			}
		}
	}
}

// HTML-escape mínimo para campos de usuario inyectados en el template del email.
// Evita XSS en clientes de correo que renderizan HTML.
function escapeHtml(value: string | null | undefined): string {
	if (!value) return '';
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
