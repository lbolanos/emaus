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
import { In, MoreThanOrEqual, Not } from 'typeorm';
import { calculateNextOccurrence } from '../utils/recurrenceUtils';
import { EmailService } from './emailService';
import { MessageTemplate } from '../entities/messageTemplate.entity';
// renderTemplate (línea ~39) usa single-pass regex local en vez de los
// helpers de `@repo/utils` para prevenir placeholder-spoofing. Pero el
// resto del service sí usa `resolveMemberProfile` para resolver el overlay
// per-community sobre el Participant subyacente.
import { resolveMemberProfile } from '@repo/utils';
import { inferTimezoneFromCoords } from '../utils/date.transformer';

/**
 * Devuelve la IANA timezone donde la community vive. Fallback a CDMX si la
 * community no tiene `timezone` persistida (típicamente porque no se han
 * capturado coordenadas todavía). Sync: el lookup async de coords pasó por
 * create/update; las funciones de render deben ser baratas.
 */
export const getCommunityTimezone = (community: { timezone?: string | null } | null | undefined): string => {
	return community?.timezone || 'America/Mexico_City';
};

/**
 * Feature flag temporal — el envío automático de invitaciones de reunión está
 * apagado por default. El usuario lo pausó hasta que se valide el tono / cadencia
 * con los coordinadores. Reactivar seteando la env var
 * `MEETING_EMAIL_NOTIFICATIONS_ENABLED=true` (o cambiando el default a `true`
 * cuando se confirme).
 *
 * NOTA: solo afecta los DISPAROS AUTOMÁTICOS desde `createMeeting`,
 * `createNextMeetingInstance` y el cron `meetingInstanceGeneratorService`. El
 * endpoint manual `POST /communities/:id/meetings/:meetingId/notify` que el
 * coordinador dispara explícitamente desde la UI **sigue funcionando** sin
 * importar este flag — es decisión consciente del coordinador.
 */
export const isMeetingEmailNotificationsEnabled = (): boolean =>
	process.env.MEETING_EMAIL_NOTIFICATIONS_ENABLED === 'true';

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
	 * Renderiza una plantilla de `message_templates` para emails de comunidad.
	 * Prefiere la plantilla específica de la community; si no existe, usa la
	 * global (`communityId IS NULL`). Devuelve `null` si no hay plantilla — el
	 * caller debe caer al HTML inline (fallback de seguridad).
	 *
	 * Soporta dos sintaxis de placeholders para retro-compatibilidad:
	 *   1. `{{var}}` (mustache) — usado por las plantillas seed originales y
	 *      por overrides de comunidad creados antes de la migration de
	 *      normalización (20260518173857).
	 *   2. `{participant.firstName}` / `{community.name}` ... (canónica) —
	 *      sintaxis estándar del sistema que el variable picker del editor
	 *      conoce y expone al usuario.
	 *
	 * SECURITY:
	 *  - Todas las variables se pasan por `escapeHtml` antes de interpolarse
	 *    para prevenir XSS en clientes de correo que renderizan HTML.
	 *  - **Single-pass replacement**. La implementación anterior hacía dos
	 *    pasadas secuenciales (mustache, después canónica), lo que permitía
	 *    placeholder-spoofing: un participante con `firstName = '{community.name}'`
	 *    veía su nombre reemplazado por el nombre real de la comunidad en
	 *    el output. Ahora un único regex global matchea ambos formatos y
	 *    sustituye con valores pre-escapados; los outputs de un placeholder
	 *    NO se re-procesan.
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

			const safeVars: Record<string, string> = {};
			for (const [k, v] of Object.entries(vars)) {
				safeVars[k] = escapeHtml(v == null ? '' : String(v));
			}

			// Mapeo de flat vars → canonical keys ({scope.var}). Cada
			// `safeVars[X]` ya está escapado, así que la sustitución es segura.
			const canonical: Record<string, string> = {
				'participant.firstName': safeVars.firstName ?? '',
				'community.name': safeVars.communityName ?? '',
				'community.meetingTitle': safeVars.meetingTitle ?? '',
				'community.meetingDate': safeVars.meetingDate ?? '',
				'community.attendanceLink': safeVars.attendanceLink ?? '',
				'community.requesterName': safeVars.requesterName ?? '',
				'community.requesterEmail': safeVars.requesterEmail ?? '',
				'community.requesterPhone': safeVars.requesterPhone ?? '',
				'community.userEmail': safeVars.userEmail ?? '',
				'community.acceptUrl': safeVars.acceptUrl ?? '',
			};

			// Single-pass regex: matchea `{{key}}` o `{scope.key}`. La función
			// de reemplazo opera sobre el match del template original (NUNCA
			// sobre el output previo), eliminando el vector de placeholder
			// spoofing donde un valor de usuario simulaba un placeholder.
			const combinedRegex = /\{\{([\w]+)\}\}|\{([\w]+\.[\w]+)\}/g;
			const out = template.message.replace(combinedRegex, (match, mustacheKey, canonicalKey) => {
				if (mustacheKey && Object.prototype.hasOwnProperty.call(safeVars, mustacheKey)) {
					return safeVars[mustacheKey];
				}
				if (canonicalKey && Object.prototype.hasOwnProperty.call(canonical, canonicalKey)) {
					return canonical[canonicalKey];
				}
				// Placeholder desconocido — preservar literal (más informativo
				// para depurar plantillas mal escritas que devolver vacío).
				return match;
			});

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
		// Inferir timezone desde lat/lon si vienen pero no se pasó timezone
		// explícita. Falla silenciosa: si tz-lookup no resuelve, queda NULL
		// y el helper cae a CDMX.
		let timezone = data.timezone ?? null;
		if (!timezone && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
			timezone = await inferTimezoneFromCoords(data.latitude, data.longitude);
		}
		const community = this.communityRepo.create({
			...data,
			timezone: timezone ?? null,
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
		// Si las coordenadas cambian (y no se está pasando timezone explícita),
		// recalcular timezone. Caso típico: el admin pega un Google Maps URL
		// nuevo y la community se mudó de zona.
		const patch: Partial<Community> = { ...data };
		const coordsChanged =
			typeof patch.latitude === 'number' && typeof patch.longitude === 'number';
		if (patch.timezone === undefined && coordsChanged) {
			const inferred = await inferTimezoneFromCoords(patch.latitude, patch.longitude);
			if (inferred) patch.timezone = inferred;
		}
		await this.communityRepo.update(id, patch);
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

		// Last message sent (community scope) per participant — para que el
		// frontend pueda ordenar por "último contacto" sin un round-trip extra.
		// Usamos query agregada en vez de join lateral para evitar fan-out con
		// la tabla de attendance.
		const lastMessageRows: { participantId: string; lastSentAt: string }[] =
			await AppDataSource.query(
				`SELECT participantId, MAX(sentAt) as lastSentAt
				 FROM participant_communications
				 WHERE scope = 'community' AND communityId = ?
				 GROUP BY participantId`,
				[communityId],
			);
		const lastMessageByParticipant: Record<string, string> = {};
		for (const row of lastMessageRows) {
			if (row.participantId && row.lastSentAt) {
				// SQLite devuelve 'YYYY-MM-DD HH:MM:SS' SIN sufijo TZ. Los datos
				// son UTC (CreateDateColumn usa CURRENT_TIMESTAMP) pero el string
				// no lo dice. Si lo enviamos así, `new Date(...)` en el navegador
				// lo trata como LOCAL → la marca "hace X" sale corrida por la
				// diferencia de TZ del cliente. Normalizar a ISO UTC explícito.
				const raw = row.lastSentAt;
				const isoUtc =
					raw.endsWith('Z') || raw.includes('+')
						? raw
						: raw.replace(' ', 'T') + 'Z';
				lastMessageByParticipant[row.participantId] = isoUtc;
			}
		}

		// Calculate attendance rate for each member
		// Get all past meetings for this community (with startDate for filtering).
		// Excluir instancias canceladas: no deben contar contra la tasa de asistencia.
		const pastMeetingsRaw = await this.meetingRepo.find({
			where: { communityId },
			select: ['id', 'startDate', 'exceptionType'],
		});
		const pastMeetings = pastMeetingsRaw.filter((m) => m.exceptionType !== 'cancelled');

		// Only calculate if there are meetings
		if (pastMeetings.length === 0) {
			return members
				.map((m) => ({
					...m,
					lastMeetingsAttendanceRate: 0,
					lastMeetingsFrequency: 'none' as const,
					lastMessageSentAt: lastMessageByParticipant[m.participantId] || null,
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
				lastMessageSentAt: lastMessageByParticipant[member.participantId] || null,
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

	/**
	 * Detecta si el cellPhone dado colisiona con OTRO miembro de la misma
	 * comunidad. El cellPhone "efectivo" puede vivir en overlay (community_member.cellPhone)
	 * o en participant.cellPhone — chequea ambos. Compara por últimos 10 dígitos
	 * (ignora formato/espacios/prefijo +52). Pensado para llamarse antes de crear
	 * o actualizar miembros. Devuelve el primer miembro colisionando o null.
	 */
	private async findPhoneCollision(
		communityId: string,
		cellPhone: string | null | undefined,
		excludeMemberId?: string,
	): Promise<CommunityMember | null> {
		if (!cellPhone) return null;
		const last10 = cellPhone.replace(/\D/g, '').slice(-10);
		if (last10.length < 7) return null; // tels muy cortos no son confiables

		// Trae los miembros de la comunidad con su participant para evaluar overlay+participant.
		const qb = this.memberRepo
			.createQueryBuilder('cm')
			.leftJoinAndSelect('cm.participant', 'p')
			.where('cm.communityId = :cid', { cid: communityId });
		if (excludeMemberId) qb.andWhere('cm.id != :mid', { mid: excludeMemberId });
		const members = await qb.getMany();

		for (const m of members) {
			const effective = (m.cellPhone ?? m.participant?.cellPhone ?? '')
				.replace(/\D/g, '')
				.slice(-10);
			if (effective.length >= 7 && effective === last10) return m;
		}
		return null;
	}

	async addMember(
		communityId: string,
		participantId: string,
		state: MemberState = 'active_member',
	) {
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
			state,
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
		state: MemberState = 'active_member',
	) {
		// Bloquea tel duplicado en la misma comunidad. Si llaman desde bulkAddMembers,
		// ahí también verifico para devolver mejor mensaje, pero aquí es safety net
		// adicional (otras rutas como POST /communities/:id/members/create lo cruzan).
		if (participantData.cellPhone) {
			const collision = await this.findPhoneCollision(communityId, participantData.cellPhone);
			if (collision) {
				throw new Error('PHONE_DUPLICATE_IN_COMMUNITY');
			}
		}

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
			state,
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

	/**
	 * Actualiza el "overlay" de perfil de un miembro de comunidad: nombre,
	 * apellido, email y teléfono per-community. **NO toca el Participant
	 * global** — los cambios viven solo en `community_member.*`. Caso de uso
	 * típico: corregir datos de miembros creados por el bot/import en bulk;
	 * permitir alias/nicknames por comunidad.
	 *
	 * Resolución de lectura: `resolveMemberProfile(member)` en `@repo/utils`
	 * devuelve `member.X ?? participant.X` para mantener retro-compat.
	 *
	 * SECURITY:
	 *  - El caller (controller) DEBE validar via `requireCommunityAccess` que
	 *    el user es admin de `communityId`.
	 *  - Este método valida que el `memberId` pertenezca a `communityId`
	 *    (evita cross-tenant edit).
	 *  - **No hay riesgo de account takeover**: cambiar el overlay email NO
	 *    afecta `participants.email`, así que no participa en el auto-link
	 *    via `authService.linkParticipantToExistingUser`. Por eso ya no
	 *    necesitamos el guard `EMAIL_LOCKED_USER_LINKED` que existía cuando
	 *    el endpoint editaba `participants` directamente.
	 *  - **Duplicate prevention (scoped a la comunidad)**: rechaza si otro
	 *    miembro de **la misma comunidad** ya usa ese email (overlay o
	 *    participant). Email duplicado en otras comunidades es OK — el
	 *    overlay es per-community.
	 *
	 * Empty-string semantics: `''` en cualquier campo se interpreta como
	 * "limpiar overlay" y se persiste como `null`, no como string vacío.
	 * Así el helper de fallback puede volver a leer el participant.
	 */
	async updateMemberProfile(
		communityId: string,
		memberId: string,
		profile: {
			firstName?: string;
			lastName?: string;
			email?: string;
			cellPhone?: string;
		},
	) {
		const member = await this.memberRepo.findOne({
			where: { id: memberId, communityId },
			relations: ['participant'],
		});
		if (!member) {
			throw new Error('Member not found in this community');
		}

		// Build overlay updates. Empty-string → null (limpia overlay).
		const overlayUpdates: Partial<CommunityMember> = {};

		if (typeof profile.firstName === 'string') {
			const trimmed = profile.firstName.trim();
			if (!trimmed) throw new Error('firstName cannot be empty');
			overlayUpdates.firstName = trimmed;
		}
		if (typeof profile.lastName === 'string') {
			const trimmed = profile.lastName.trim();
			overlayUpdates.lastName = trimmed === '' ? null : trimmed;
		}
		if (typeof profile.cellPhone === 'string') {
			const trimmed = profile.cellPhone.trim();
			// Bloquea tel duplicado en la misma comunidad (otro miembro distinto).
			// Solo valida si el tel cambió respecto al efectivo actual.
			if (trimmed.length > 0) {
				const currentPhone =
					(member.cellPhone ?? member.participant?.cellPhone ?? '').replace(/\D/g, '').slice(-10);
				const newPhoneLast10 = trimmed.replace(/\D/g, '').slice(-10);
				if (currentPhone !== newPhoneLast10) {
					const collision = await this.findPhoneCollision(communityId, trimmed, memberId);
					if (collision) {
						throw new Error('PHONE_DUPLICATE_IN_COMMUNITY');
					}
				}
			}
			overlayUpdates.cellPhone = trimmed === '' ? null : trimmed;
		}
		if (typeof profile.email === 'string') {
			const newEmail = profile.email.trim();
			if (newEmail.length > 0) {
				// Resolver el email actual efectivo (overlay o participant) para
				// saber si está cambiando.
				const currentEmail =
					(member.email ?? member.participant?.email ?? '').trim().toLowerCase();
				const changingEmail = newEmail.toLowerCase() !== currentEmail;

				if (changingEmail) {
					// Colisión: otro miembro de la MISMA comunidad ya usa este
					// email (overlay propio o participant heredado).
					const collision = await this.memberRepo
						.createQueryBuilder('cm')
						.leftJoin('cm.participant', 'p')
						.where('cm.communityId = :cid', { cid: communityId })
						.andWhere('cm.id != :mid', { mid: memberId })
						.andWhere(
							'(LOWER(cm.email) = :email OR (cm.email IS NULL AND LOWER(p.email) = :email))',
							{ email: newEmail.toLowerCase() },
						)
						.getOne();
					if (collision) {
						throw new Error('EMAIL_DUPLICATE_IN_COMMUNITY');
					}
				}
			}
			overlayUpdates.email = newEmail === '' ? null : newEmail;
		}

		// Detectar si los valores ya estaban iguales al overlay actual —
		// evita audit log spurious de no-op (security review feedback).
		const changedFields: string[] = [];
		for (const [key, value] of Object.entries(overlayUpdates)) {
			if ((member as any)[key] !== value) {
				changedFields.push(key);
			}
		}

		if (changedFields.length === 0) {
			return {
				member: await this.memberRepo.findOne({
					where: { id: memberId },
					relations: ['participant', 'community'],
				}),
				changedFields,
			};
		}

		try {
			await this.memberRepo.update(memberId, overlayUpdates);
		} catch (err: any) {
			// El partial unique index `uq_community_member_overlay_email`
			// puede dispararse en una race condition entre el check de
			// colisión (arriba) y este UPDATE. SQLite reporta SQLITE_CONSTRAINT
			// con código 19; el mensaje contiene "UNIQUE constraint failed".
			if (
				typeof err?.message === 'string' &&
				err.message.toUpperCase().includes('UNIQUE')
			) {
				throw new Error('EMAIL_DUPLICATE_IN_COMMUNITY');
			}
			throw err;
		}

		return {
			member: await this.memberRepo.findOne({
				where: { id: memberId },
				relations: ['participant', 'community'],
			}),
			changedFields,
		};
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

		// Get all meetings for this community to build timeline. Excluir canceladas:
		// no deben aparecer en el timeline del miembro como reuniones que faltaron.
		const meetingsRaw = await this.meetingRepo.find({
			where: { communityId: member.communityId },
			order: { startDate: 'DESC' },
		});
		const meetings = meetingsRaw.filter((m) => m.exceptionType !== 'cancelled');

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
		// Feature flag (ver `isMeetingEmailNotificationsEnabled` arriba): apagado por
		// default. El coordinador puede notificar manualmente desde la UI.
		if (!saved.isRecurrenceTemplate && isMeetingEmailNotificationsEnabled()) {
			this.notifyMembersOfMeeting(saved.id).catch((err) => {
				console.error('[communityService] notifyMembersOfMeeting failed:', err);
			});
		}

		return saved;
	}

	async getMeetings(communityId: string) {
		// Excluir instancias canceladas del listado. exceptionType='cancelled' marca
		// ocurrencias que el coordinador anuló sin borrar (preserva attendance histórica).
		const meetingsRaw = await this.meetingRepo.find({
			where: { communityId },
			order: { startDate: 'DESC' },
		});
		const meetings = meetingsRaw.filter((m) => m.exceptionType !== 'cancelled');

		// Roster para conteo de asistencia: matching el filtro del endpoint público
		// (active + pending). El conteo "X de Y asistieron" debe usar la misma base que
		// el roster que ve el coordinador en el papel/UI de asistencia.
		const allMembers = await this.memberRepo.find({
			where: { communityId, state: In(['active_member', 'pending_verification']) },
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

	/**
	 * Campos que se propagan a instancias materializadas cuando se edita el template
	 * con scope 'all' o 'all_future'. Excluye startDate/endDate/recurrence*: cambiar
	 * la hora de una instancia ya materializada requiere recálculo y rompería
	 * asistencias capturadas. Para cambiar el horario de la serie, el coordinador
	 * debe borrar las futuras y dejar que el cron las regenere con el nuevo schedule.
	 */
	private pickPropagableFields(data: Partial<CommunityMeeting>): Partial<CommunityMeeting> {
		const out: Partial<CommunityMeeting> = {};
		if (data.title !== undefined) out.title = data.title;
		if (data.description !== undefined) out.description = data.description;
		if (data.durationMinutes !== undefined) out.durationMinutes = data.durationMinutes;
		if (data.flyerTemplate !== undefined) out.flyerTemplate = data.flyerTemplate;
		if (data.isAnnouncement !== undefined) out.isAnnouncement = data.isAnnouncement;
		return out;
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

		// Resolver el template raíz de la serie. Una instancia generada tiene
		// parentMeetingId apuntando al meeting padre; si la actual no lo tiene, ella
		// misma es la raíz. Operar contra el rootId garantiza que cambios desde
		// cualquier instancia se apliquen al schedule de la serie.
		const rootId = meeting.parentMeetingId ?? meeting.id;
		const propagable = this.pickPropagableFields(data);
		const propagableEntries = Object.keys(propagable).length > 0;

		if (scope === 'all') {
			// Actualizar template raíz (rige futuras generaciones) Y propagar non-date
			// fields a TODAS las instancias materializadas (pasadas y futuras).
			await this.meetingRepo.update(rootId, data);
			if (propagableEntries) {
				await this.meetingRepo
					.createQueryBuilder()
					.update()
					.set(propagable)
					.where('parentMeetingId = :rootId', { rootId })
					.execute();
			}
			return this.getMeetingById(id);
		}

		if (scope === 'all_future') {
			// "Esta y futuras": actualizar template raíz (afecta el schedule generado por
			// el cron a partir de aquí) y propagar non-date fields SOLO a instancias con
			// startDate >= esta ocurrencia. Pasadas conservan sus datos originales.
			const cutoff = meeting.startDate;
			await this.meetingRepo.update(rootId, data);
			if (propagableEntries) {
				await this.meetingRepo
					.createQueryBuilder()
					.update()
					.set(propagable)
					.where('(id = :rootId OR parentMeetingId = :rootId)', { rootId })
					.andWhere('startDate >= :cutoff', { cutoff })
					.execute();
			}
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

		const rootId = meeting.parentMeetingId ?? meeting.id;

		// For recurrence templates
		if (scope === 'all') {
			// Borrar template raíz + todas las instancias materializadas (pasadas y futuras).
			const instances = await this.meetingRepo.find({
				where: { parentMeetingId: rootId },
				select: ['id'],
			});
			const allIds = [rootId, ...instances.map((i) => i.id)];
			await this.attendanceRepo.delete({ meetingId: In(allIds) });
			await this.meetingRepo.delete(allIds);
			return;
		}

		if (scope === 'all_future') {
			// "Esta y futuras": borrar instancias con startDate >= esta ocurrencia + cortar
			// recurrencia del template raíz para que el cron no genere más. Las pasadas se
			// conservan con su attendance histórica intacta.
			const cutoff = meeting.startDate;
			const futureInstances = await this.meetingRepo
				.createQueryBuilder('m')
				.where('(m.id = :rootId OR m.parentMeetingId = :rootId)', { rootId })
				.andWhere('m.startDate >= :cutoff', { cutoff })
				.getMany();

			const futureIds = futureInstances.map((m) => m.id);
			if (futureIds.length > 0) {
				await this.attendanceRepo.delete({ meetingId: In(futureIds) });
				await this.meetingRepo.delete(futureIds);
			}

			// Si el template raíz no fue borrado (porque está en el pasado), cortarle la
			// recurrencia. Si fue borrado, no hay nada que cortar.
			const rootStillExists = await this.meetingRepo.findOne({ where: { id: rootId } });
			if (rootStillExists) {
				await this.meetingRepo.update(rootId, {
					recurrenceFrequency: null,
					recurrenceInterval: null,
					recurrenceDayOfWeek: null,
					recurrenceDayOfMonth: null,
					isRecurrenceTemplate: false,
				});
			}
			return;
		}
	}

	// --- Recurrence Instance Management ---

	async createNextMeetingInstance(meetingId: string, options?: { notify?: boolean }) {
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

		// Si la serie tiene fecha tope, no generar instancias más allá.
		if (meeting.recurrenceEndDate) {
			const endDate = new Date(meeting.recurrenceEndDate);
			if (nextStartDate > endDate) {
				throw new Error('Recurrence end date reached');
			}
		}

		// 4. Track if next date is in the past (allow but warn)
		const isPastDate = nextStartDate <= new Date();

		// Resolver el template raíz para que TODAS las instancias de la serie
		// apunten al mismo parent. Antes de este cambio había chains (instance →
		// instance → instance), lo que complicaba queries de scope.
		const rootId = meeting.parentMeetingId ?? meeting.id;

		// 5. Check if an instance with this date already exists (anywhere en la serie)
		const existingInstance = await this.meetingRepo.findOne({
			where: {
				communityId: meeting.communityId,
				parentMeetingId: rootId,
				startDate: nextStartDate,
			},
		});

		if (existingInstance) {
			throw new Error('A meeting instance for this date already exists');
		}

		// 6. Check for maximum instances (optional safety limit) — contra la serie completa.
		const existingInstances = await this.meetingRepo.count({
			where: {
				communityId: meeting.communityId,
				parentMeetingId: rootId,
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
			recurrenceEndDate: meeting.recurrenceEndDate,
			flyerTemplate: meeting.flyerTemplate,
			isRecurrenceTemplate: true,
			// Link to root parent (no chains)
			parentMeetingId: rootId,
			instanceDate: nextStartDate,
		});

		const saved = await this.meetingRepo.save(newMeeting);

		// Notificar a los miembros sobre la nueva instancia (default true). Bug histórico:
		// la generación bajo demanda nunca disparaba el correo, así que los miembros se
		// enteraban solo de la primera reunión de la serie. El caller puede pasar
		// notify:false para suprimir (e.g. backfill silencioso).
		// Fire-and-forget: errores de SMTP no rompen la creación de la instancia.
		// Feature flag (ver `isMeetingEmailNotificationsEnabled` arriba): apagado por
		// default. Aplica también a este path. El coordinador puede notificar a mano.
		const shouldNotify =
			options?.notify !== false && !isPastDate && isMeetingEmailNotificationsEnabled();
		if (shouldNotify) {
			this.notifyMembersOfMeeting(saved.id).catch((err) => {
				console.error('[communityService] notifyMembersOfMeeting (instance) failed:', err);
			});
		}

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
		// Return upcoming public meetings (next 30 days). Excluir canceladas para no
		// publicar ocurrencias que el coordinador anuló.
		const now = new Date();
		const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

		const raw = await this.meetingRepo.find({
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
		return raw.filter((m) => m.exceptionType !== 'cancelled');
	}

	async getPublicAttendanceData(communityId: string, meetingId: string) {
		// Verify community and meeting exist
		const community = await this.communityRepo.findOne({ where: { id: communityId } });
		const meeting = await this.meetingRepo.findOne({ where: { id: meetingId, communityId } });

		if (!community || !meeting) {
			return null;
		}

		// Si la ocurrencia fue cancelada, no exponer el flujo público de asistencia.
		// Caller mapea null → 404.
		if (meeting.exceptionType === 'cancelled') {
			return null;
		}

		// Roster del retiro: incluye a todos los miembros que pueden asistir,
		// incluyendo los que aún no fueron contactados (pending_verification).
		// `state` es un MARCADOR DE SEGUIMIENTO, no de permiso para asistir:
		//   - active_member: confirmado asistiendo, no requiere follow-up.
		//   - pending_verification: aún no contactado / por invitar.
		// Todos los demás estados (no_answer, another_group, far_from_location,
		// wrong_contact_info, no_time, paused, not_interested, do_not_contact)
		// son declinaciones explícitas o canales rotos — fuera del roster.
		const members = await this.memberRepo.find({
			where: { communityId, state: In(['active_member', 'pending_verification']) },
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
			// TZ de la comunidad para que la vista pública renderice la fecha en hora
			// local correcta (e.g. 19:00 MX en lugar de 01:00 UTC al día siguiente).
			communityTimezone: getCommunityTimezone(community),
			meetingId,
			meetingTitle: meeting.title,
			meetingStartDate: meeting.startDate,
			members: members.map((member) => {
				const profile = resolveMemberProfile(member);
				return {
					id: member.id,
					state: member.state,
					participant: {
						firstName: profile.firstName,
						lastName: profile.lastName,
						cellPhone: profile.cellPhone,
						// homePhone/workPhone no tienen overlay — siguen del participant
						homePhone: member.participant.homePhone,
						workPhone: member.participant.workPhone,
					},
					attended: attendance.find((a) => a.memberId === member.id)?.attended || false,
				};
			}),
		};
	}

	/**
	 * Registra asistencia para múltiples miembros en una reunión a partir de una
	 * lista de identificadores flexibles (memberId / email / cellPhone / name).
	 *
	 * - Hace `upsert` por (meetingId, memberId): no borra ni pisa marcas previas.
	 *   Llamadas sucesivas son acumulativas.
	 * - Resuelve cada attendee solo entre miembros de `communityId` (no busca en
	 *   la BD global): evita marcar a alguien que no pertenece a la comunidad.
	 * - Reporta `marked`, `notFound` (sin match), `ambiguous` (varios matches)
	 *   para que el caller (típicamente el bot) pida desambiguación.
	 */
	async bulkRecordAttendance(
		communityId: string,
		meetingId: string,
		attendees: Array<{
			memberId?: string;
			name?: string;
			email?: string;
			cellPhone?: string;
		}>,
		attended: boolean = true,
	): Promise<{
		marked: Array<{ memberId: string; name: string }>;
		notFound: Array<{ query: any; reason: string }>;
		ambiguous: Array<{ query: any; matches: Array<{ memberId: string; name: string }> }>;
	}> {
		// Pre-cargar todos los miembros de la comunidad con sus participants una sola
		// vez para resolver matches en memoria. Más rápido y permite búsqueda flexible
		// por nombre completo (que SQL puro hace torpe).
		const members = await this.memberRepo.find({
			where: { communityId },
			relations: ['participant'],
		});

		const normalize = (s: string) =>
			s
				.toLowerCase()
				.trim()
				.normalize('NFD')
				.replace(/[̀-ͯ]/g, '');
		const normPhone = (s: string) => s.replace(/[\s()\-+]/g, '');

		const marked: Array<{ memberId: string; name: string }> = [];
		const notFound: Array<{ query: any; reason: string }> = [];
		const ambiguous: Array<{
			query: any;
			matches: Array<{ memberId: string; name: string }>;
		}> = [];

		for (const attendee of attendees) {
			let matches = members;

			if (attendee.memberId) {
				matches = members.filter((m) => m.id === attendee.memberId);
			} else if (attendee.email) {
				// Match contra overlay OR participant email (overlay > participant
				// es el perfil efectivo).
				const e = attendee.email.toLowerCase().trim();
				matches = members.filter((m) => {
					const eff = resolveMemberProfile(m).email.toLowerCase().trim();
					return eff === e;
				});
			} else if (attendee.cellPhone) {
				const suffix = normPhone(attendee.cellPhone).slice(-10);
				if (suffix.length < 7) {
					notFound.push({ query: attendee, reason: 'phone_too_short' });
					continue;
				}
				matches = members.filter((m) => {
					const eff = resolveMemberProfile(m).cellPhone;
					return normPhone(eff).endsWith(suffix);
				});
			} else if (attendee.name) {
				const tokens = normalize(attendee.name).split(/\s+/).filter(Boolean);
				if (tokens.length === 0) {
					notFound.push({ query: attendee, reason: 'empty_name' });
					continue;
				}
				matches = members.filter((m) => {
					const full = normalize(resolveMemberProfile(m).fullName);
					return tokens.every((t) => full.includes(t));
				});
			} else {
				notFound.push({ query: attendee, reason: 'no_identifier' });
				continue;
			}

			if (matches.length === 0) {
				notFound.push({ query: attendee, reason: 'not_a_member' });
				continue;
			}

			if (matches.length > 1) {
				ambiguous.push({
					query: attendee,
					matches: matches.map((m) => ({
						memberId: m.id,
						name: resolveMemberProfile(m).fullName,
					})),
				});
				continue;
			}

			const member = matches[0];
			await this.recordSingleAttendance(communityId, meetingId, member.id, attended);
			marked.push({
				memberId: member.id,
				name: resolveMemberProfile(member).fullName,
			});
		}

		return { marked, notFound, ambiguous };
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

		// 3. Meeting Counts. Excluir canceladas: no contribuyen a stats ni a "10 últimas".
		const allMeetingsRaw = await this.meetingRepo.find({
			where: { communityId, isAnnouncement: false },
			order: { startDate: 'DESC' },
		});
		const allMeetings = allMeetingsRaw.filter((m) => m.exceptionType !== 'cancelled');

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

	/**
	 * Otorga acceso de admin de forma directa e inmediata (status='active'), sin
	 * link de invitación ni aceptación. Espejo de la "Asignación Rápida" de roles
	 * del retiro: el owner elige un usuario YA registrado de una lista y le da
	 * acceso con un clic. La ruta es owner-only.
	 *
	 * Idempotente: si ya existe un CommunityAdmin para ese usuario (pending/revoked)
	 * lo reactiva en vez de duplicar; nunca degrada/toca a un 'owner'.
	 */
	async addAdminDirect(communityId: string, userId: string, addedBy: string) {
		const userRepo = AppDataSource.getRepository(User);
		const user = await userRepo.findOne({ where: { id: userId } });
		if (!user) {
			throw new Error('User not found');
		}

		const existing = await this.adminRepo.findOne({ where: { communityId, userId } });

		if (existing && existing.role === 'owner') {
			// No tocar al owner; ya tiene acceso total.
			return this.adminRepo.findOne({
				where: { id: existing.id },
				relations: ['user', 'inviter'],
			});
		}

		let saved: CommunityAdmin;
		if (existing) {
			existing.status = 'active';
			existing.acceptedAt = new Date();
			existing.invitationToken = undefined;
			existing.invitationExpiresAt = undefined;
			existing.invitedBy = addedBy;
			saved = await this.adminRepo.save(existing);
		} else {
			const admin = this.adminRepo.create({
				communityId,
				userId,
				role: 'admin',
				status: 'active',
				invitedBy: addedBy,
				acceptedAt: new Date(),
			});
			saved = await this.adminRepo.save(admin);
		}

		// Invalidar caches de permisos para que el acceso aplique de inmediato.
		const { performanceOptimizationService } = await import('./performanceOptimizationService');
		performanceOptimizationService.invalidateUserPermissionCache(userId);
		performanceOptimizationService.invalidateUserRetreatCache(userId);
		performanceOptimizationService.invalidateUserPermissionsResultCache(userId);

		return this.adminRepo.findOne({
			where: { id: saved.id },
			relations: ['user', 'inviter'],
		});
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

	/**
	 * Busca un Participant existente en la BD global por email o teléfono. Útil para
	 * deduplicar al agregar miembros a una comunidad sin duplicar identidades.
	 *
	 * - Email: comparación case-insensitive sobre el valor trimmed.
	 * - Teléfono: comparación best-effort — se quitan espacios, paréntesis, guiones
	 *   y signo `+` de ambos lados antes de comparar (un número guardado como
	 *   `+52 55 1234 5678` matchea con `5512345678`).
	 *
	 * Si `email` coincide, gana sobre `phone`. Si solo se pasa phone, busca por phone.
	 */
	async findParticipantByEmailOrPhone(
		email?: string | null,
		phone?: string | null,
	): Promise<Participant | null> {
		const normalizedEmail = email?.toLowerCase().trim();
		const normalizedPhone = phone?.replace(/[\s()\-+]/g, '');

		if (normalizedEmail) {
			const byEmail = await this.participantRepo
				.createQueryBuilder('participant')
				.where('LOWER(participant.email) = :email', { email: normalizedEmail })
				.getOne();
			if (byEmail) return byEmail;
		}

		if (normalizedPhone && normalizedPhone.length >= 7) {
			// Match best-effort por sufijo: comparamos los últimos 10 dígitos del
			// número normalizado. Eso permite que `+52 55 8765 4321` y `5587654321`
			// se consideren la misma persona (el +52 internacional se ignora).
			const suffix = normalizedPhone.slice(-10);
			const byPhone = await this.participantRepo
				.createQueryBuilder('participant')
				.where(
					"REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(participant.cellPhone, ' ', ''), '(', ''), ')', ''), '-', ''), '+', '') LIKE :phone",
					{ phone: `%${suffix}` },
				)
				.getOne();
			if (byPhone) return byPhone;
		}

		return null;
	}

	/**
	 * Agrega múltiples miembros a una comunidad a partir de una lista parseada.
	 * Lógica por entrada:
	 *   - Validar nombre (firstName + lastName) y al menos email O teléfono. Si falta → `rejected`.
	 *   - Buscar Participant existente por email o teléfono (`findParticipantByEmailOrPhone`).
	 *   - Si existe y ya es miembro de esta comunidad → `skipped` (motivo: already_member).
	 *   - Si existe y NO es miembro → `addMember` (vincula sin duplicar Participant) → `linked`.
	 *   - Si no existe → `createCommunityMember` → `added`.
	 *
	 * Trata duplicados DENTRO del mismo lote (si la primera entrada crea/vincula,
	 * la segunda con el mismo email/phone caerá en `skipped` por el lookup).
	 */
	async bulkAddMembers(
		communityId: string,
		entries: Array<{
			firstName?: string;
			lastName?: string;
			email?: string;
			cellPhone?: string;
			notes?: string;
		}>,
		state: MemberState = 'pending_verification',
	): Promise<{
		added: Array<{ name: string; email?: string; cellPhone?: string; memberId: string }>;
		linked: Array<{ name: string; email?: string; cellPhone?: string; memberId: string }>;
		skipped: Array<{ name: string; reason: string }>;
		rejected: Array<{ rawInput: any; missingFields: string[]; reason: string }>;
	}> {
		const added: any[] = [];
		const linked: any[] = [];
		const skipped: any[] = [];
		const rejected: any[] = [];

		for (const entry of entries) {
			const firstName = entry.firstName?.trim() || '';
			const lastName = entry.lastName?.trim() || '';
			const email = entry.email?.trim() || '';
			const cellPhone = entry.cellPhone?.trim() || '';

			const missing: string[] = [];
			if (!firstName) missing.push('firstName');
			if (!lastName) missing.push('lastName');
			if (!email && !cellPhone) missing.push('email_or_cellPhone');

			if (missing.length > 0) {
				rejected.push({
					rawInput: entry,
					missingFields: missing,
					reason: 'missing_required_fields',
				});
				continue;
			}

			const displayName = `${firstName} ${lastName}`.trim();

			try {
				const existingParticipant = await this.findParticipantByEmailOrPhone(email, cellPhone);

				if (existingParticipant) {
					// ¿Ya es miembro de esta comunidad?
					const existingMember = await this.memberRepo.findOne({
						where: { communityId, participantId: existingParticipant.id },
					});

					if (existingMember) {
						skipped.push({ name: displayName, reason: 'already_member' });
						continue;
					}

					// El participant existe globalmente pero NO es miembro de esta comunidad
					// todavía. Antes de vincular, valida que su tel no colisione con OTRO
					// miembro de esta comunidad (distinto al participant que vamos a vincular).
					if (cellPhone) {
						const collision = await this.findPhoneCollision(communityId, cellPhone);
						if (collision && collision.participantId !== existingParticipant.id) {
							skipped.push({ name: displayName, reason: 'phone_duplicate_in_community' });
							continue;
						}
					}

					const newMember = await this.addMember(communityId, existingParticipant.id, state);

					// Overlay: si el input difiere del Participant existente,
					// guardar como overlay per-community. Resuelve el bug donde
					// "Juan" capturado por el bot quedaba sobrescrito por
					// "Joseph" del Participant. Solo se persiste lo que difiere.
					const overlay: Partial<CommunityMember> = {};
					if (firstName && firstName !== (existingParticipant.firstName || '')) {
						overlay.firstName = firstName;
					}
					if (lastName && lastName !== (existingParticipant.lastName || '')) {
						overlay.lastName = lastName;
					}
					if (
						email &&
						email.toLowerCase() !== (existingParticipant.email || '').toLowerCase()
					) {
						overlay.email = email;
					}
					// Para teléfono comparamos crudo; la dedupe de findParticipantByEmailOrPhone
					// ya hace match por sufijo, pero el coordinador puede haber tipeado el
					// formato con espacios distintos — preservar el input solo si difiere.
					if (cellPhone && cellPhone !== (existingParticipant.cellPhone || '')) {
						overlay.cellPhone = cellPhone;
					}
					if (Object.keys(overlay).length > 0) {
						await this.memberRepo.update(newMember.id, overlay);
					}

					linked.push({
						name: displayName,
						email: overlay.email ?? existingParticipant.email ?? undefined,
						cellPhone: overlay.cellPhone ?? existingParticipant.cellPhone ?? undefined,
						memberId: newMember.id,
					});
				} else {
					// Si solo tenemos teléfono, generamos un email placeholder determinístico
					// basado en el teléfono normalizado. Eso permite que un re-add posterior
					// (mismo teléfono, con o sin email) deduplique vía el lookup por phone.
					const normalizedPhoneForPlaceholder = cellPhone.replace(/[\s()\-+]/g, '');
					const effectiveEmail =
						email ||
						`phone-${normalizedPhoneForPlaceholder}@placeholder.local`;
					const created = await this.createCommunityMember(
						communityId,
						{
							firstName,
							lastName,
							email: effectiveEmail,
							cellPhone: cellPhone || '',
						},
						state,
					);
					if (created) {
						added.push({
							name: displayName,
							email: created.participant?.email || undefined,
							cellPhone: created.participant?.cellPhone || undefined,
							memberId: created.id,
						});
					}
				}
			} catch (err: any) {
				// PHONE_DUPLICATE_IN_COMMUNITY puede salir de createCommunityMember
				// cuando el participant es totalmente nuevo pero su tel ya pertenece
				// a otro miembro de la comunidad. Lo movemos a skipped (no rejected)
				// para consistencia con el caso detectado antes.
				if (err?.message === 'PHONE_DUPLICATE_IN_COMMUNITY') {
					skipped.push({ name: displayName, reason: 'phone_duplicate_in_community' });
					continue;
				}
				rejected.push({
					rawInput: entry,
					missingFields: [],
					reason: err?.message || 'error',
				});
			}
		}

		return { added, linked, skipped, rejected };
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
	 *  - no_answer / another_group / far_from_location / no_time / not_interested
	 *    → email cordial de seguimiento (informativo, no agresivo)
	 *  - wrong_contact_info / do_not_contact / paused → NO enviar email
	 *    (canal roto, lista negra, o pausa interna no debe notificarse)
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
		// Resolver el perfil efectivo (overlay > participant). El miembro
		// puede tener un nombre/email distinto al Participant en esta
		// comunidad — usar el del overlay para personalizar el email.
		const profile = resolveMemberProfile(member);
		const recipientEmail = profile.email;
		if (!recipientEmail || !community) return;

		// Estados donde el canal está roto o el contacto está explícitamente
		// vetado: no mandamos email aunque haya recipientEmail (puede estar mal).
		const SILENT_STATES = new Set(['wrong_contact_info', 'do_not_contact', 'paused']);
		if (SILENT_STATES.has(newState)) return;

		const emailService = new EmailService();
		if (!emailService.isSmtpConfigured()) return;

		const recipientName = profile.firstName;
		let subject: string;
		let bodyHtml: string;

		if (newState === 'active_member') {
			// Buscar próxima reunión para incluirla en el email de bienvenida
			const nextMeeting = await this.meetingRepo
				.createQueryBuilder('m')
				.where('m.communityId = :cid', { cid: community.id })
				.andWhere('m.startDate >= datetime("now")')
				.andWhere('(m.isRecurrenceTemplate = 0 OR m.isRecurrenceTemplate IS NULL)')
				.andWhere('(m.exceptionType IS NULL OR m.exceptionType != :cancelled)', {
					cancelled: 'cancelled',
				})
				.orderBy('m.startDate', 'ASC')
				.getOne();

			const meetingBlock = nextMeeting
				? `
				<div style="background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:16px;margin:16px 0;">
					<p style="margin:0 0 4px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#8DAA91;">Próxima reunión</p>
					<p style="margin:0;font-weight:500;">${escapeHtml(nextMeeting.title || 'Reunión')}</p>
					<p style="margin:4px 0 0;color:#78716c;font-size:13px;">${escapeHtml(new Date(nextMeeting.startDate).toLocaleString('es-MX', { dateStyle: 'full', timeStyle: 'short', timeZone: getCommunityTimezone(community) }))}</p>
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
				to: recipientEmail,
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

		// Para cada comunidad, próximas 3 reuniones (mezcla físicas + templates
		// expandidas a su próxima ocurrencia computada).
		const now = new Date();
		const result = [];
		for (const m of members) {
			const physical = await this.meetingRepo
				.createQueryBuilder('meeting')
				.where('meeting.communityId = :cid', { cid: m.community.id })
				.andWhere('meeting.startDate >= datetime("now")')
				.andWhere('(meeting.isRecurrenceTemplate IS NULL OR meeting.isRecurrenceTemplate = 0)')
				.andWhere('(meeting.exceptionType IS NULL OR meeting.exceptionType != :cancelled)', {
					cancelled: 'cancelled',
				})
				.orderBy('meeting.startDate', 'ASC')
				.getMany();

			const templates = await this.meetingRepo
				.createQueryBuilder('meeting')
				.where('meeting.communityId = :cid', { cid: m.community.id })
				.andWhere('meeting.isRecurrenceTemplate = 1')
				.andWhere('meeting.recurrenceFrequency IS NOT NULL')
				.getMany();

			// Computar próxima ocurrencia de cada template (skip si quedó en el pasado).
			const virtualInstances = templates
				.map((t) => {
					// Si el template tiene startDate >= now, usá ese como próxima ocurrencia.
					// Si está en el pasado, computá hacia adelante hasta encontrar una futura.
					let candidate = new Date(t.startDate);
					let safety = 365; // máx 1 año de saltos
					while (candidate < now && safety-- > 0) {
						const next = calculateNextOccurrence(
							candidate,
							(t.recurrenceFrequency || null) as 'daily' | 'weekly' | 'monthly' | null,
							t.recurrenceInterval ?? 1,
							t.recurrenceDayOfWeek ?? null,
							t.recurrenceDayOfMonth ?? null,
						);
						if (!next) break;
						candidate = next;
					}
					if (candidate < now) return null;
					return {
						id: t.id,
						title: t.title,
						description: t.description,
						startDate: candidate.toISOString(),
						endDate: null,
						isRecurrenceTemplate: true,
						isVirtualInstance: true,
						recurrenceFrequency: t.recurrenceFrequency,
					};
				})
				.filter(Boolean);

			const merged = [...physical, ...(virtualInstances as any[])].sort(
				(a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
			);

			result.push({
				community: m.community,
				memberId: m.id,
				joinedAt: m.joinedAt,
				upcomingMeetings: merged.slice(0, 3),
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
		// No notificar si la ocurrencia fue cancelada — el correo mentiría sobre algo
		// que ya no va a pasar.
		if (meeting.exceptionType === 'cancelled') return;
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

		// Miembros que pueden asistir. Incluye pending_verification:
		// el correo de invitación a la reunión también sirve para reactivarlos.
		// Excluye no_answer/another_group/far_from_location (ya declinaron).
		// Filtramos por email NO null (sea en overlay o en participant) en SQL,
		// y por estado activo. El resolveMemberProfile en JS hace el coalesce final.
		const members = await this.memberRepo
			.createQueryBuilder('m')
			.innerJoinAndSelect('m.participant', 'p')
			.where('m.communityId = :cid', { cid: community.id })
			.andWhere('m.state IN (:...states)', { states: ['active_member', 'pending_verification'] })
			.andWhere(
				'((m.email IS NOT NULL AND m.email != \'\') OR (p.email IS NOT NULL AND p.email != \'\'))',
			)
			.getMany();

		if (members.length === 0) return;

		const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
		const attendanceLink = `${frontendUrl}/public/attendance/${community.id}/${meeting.id}`;
		const meetingDate = new Date(meeting.startDate).toLocaleString('es-MX', {
			dateStyle: 'full',
			timeStyle: 'short',
			timeZone: getCommunityTimezone(community),
		});

		const subject = `Próxima reunión de ${community.name}`;

		for (const member of members) {
			// Resolver perfil efectivo (overlay > participant) para personalizar el email.
			const profile = resolveMemberProfile(member);
			if (!profile.email) continue;

			const tplBody = await this.renderTemplate('COMMUNITY_MEETING_INVITATION', community.id, {
				firstName: profile.firstName,
				communityName: community.name,
				meetingTitle: meeting.title || 'Reunión',
				meetingDate,
				attendanceLink,
			});
			const html = tplBody
				? this.wrapTemplateHtml(tplBody)
				: `
				<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
					<h2 style="color:#1c1917;margin-bottom:8px;">Hola ${escapeHtml(profile.firstName)}</h2>
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
				await emailService.sendEmail({ to: profile.email, subject, html });
			} catch (err) {
				console.error(`[notifyMembersOfMeeting] Failed to email ${profile.email}:`, err);
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
