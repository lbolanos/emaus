import { z } from 'zod';

// Member state enum.
//
// El `state` es marker de seguimiento del coordinador, NO de permiso para
// asistir. Para roster/asistencia/notificaciones se filtran los estados
// "activos" (active_member + pending_verification); todos los demás se
// consideran declinaciones (explícitas o por canal roto) y se excluyen de
// notificaciones masivas. Ver `.ruler/skills/community-state-semantics`.
export const MemberStateEnum = z.enum([
	'far_from_location', // Se mudó o tiene problemas de ubicación
	'no_answer', // No responde a comunicaciones
	'another_group', // Se unió a otro grupo
	'active_member', // Miembro activo
	'pending_verification', // Pendiente de verificación por administrador
	// Nuevos (2026-05-19):
	'wrong_contact_info', // Correo/teléfono inválido — no se puede contactar hasta que se corrija
	'no_time', // No tiene tiempo en este momento — declinación blanda, puerta abierta
	'paused', // Pausa temporal (viaje, enfermedad, luto) — re-evaluar luego
	'not_interested', // No interesado — definitivo distinto de no_answer
	'do_not_contact', // Lista negra explícita — no contactar bajo ninguna circunstancia
]);
export type MemberState = z.infer<typeof MemberStateEnum>;

// Meeting type catalog.
//
// Clasifica la reunión para poder medir asistencia por tipo (p. ej. sólo las
// preparaciones del equipo servidor, sin diluirlas con las reuniones
// generales). Es un catálogo cerrado a propósito: los porcentajes tienen que
// ser comparables entre comunidades y traducibles. `isAnnouncement` sigue
// siendo una dimensión aparte — un anuncio no participa en asistencia.
export const MeetingTypeEnum = z.enum([
	'general', // Reunión ordinaria de la comunidad
	'preparation', // Preparación del equipo servidor previa a un retiro
	'formation', // Formación / catequesis
	'service', // Reunión de servicio (logística, tareas)
	'fellowship', // Convivencia
	'other',
]);
export type MeetingType = z.infer<typeof MeetingTypeEnum>;

// Recurrence frequency enum for meetings
export const RecurrenceFrequencyEnum = z.enum(['daily', 'weekly', 'monthly']);
export type RecurrenceFrequency = z.infer<typeof RecurrenceFrequencyEnum>;

// Participation frequency enum (calculated)
export const ParticipationFrequencyEnum = z.enum([
	'high', // ≥75% attendance
	'medium', // 25-74%
	'low', // 1-24%
	'none', // 0%
]);
export type ParticipationFrequency = z.infer<typeof ParticipationFrequencyEnum>;

// Community status enum
export const CommunityStatusEnum = z.enum(['pending', 'active', 'rejected']);
export type CommunityStatus = z.infer<typeof CommunityStatusEnum>;

// Community schema
export const communitySchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(200),
	description: z.string().optional(),
	address1: z.string().min(1),
	address2: z.string().optional(),
	city: z.string().min(1),
	state: z.string().min(1),
	zipCode: z.string().min(1),
	country: z.string().min(1),
	latitude: z.number().optional(),
	longitude: z.number().optional(),
	googleMapsUrl: z.string().optional(),
	createdBy: z.string().uuid().nullable().optional(),
	status: CommunityStatusEnum.default('active'),
	parish: z.string().optional().nullable(),
	diocese: z.string().optional().nullable(),
	website: z.string().optional().nullable(),
	facebookUrl: z.string().optional().nullable(),
	instagramUrl: z.string().optional().nullable(),
	contactName: z.string().optional().nullable(),
	contactEmail: z.string().optional().nullable(),
	contactPhone: z.string().optional().nullable(),
	submittedAt: z.coerce.date().optional().nullable(),
	approvedAt: z.coerce.date().optional().nullable(),
	approvedBy: z.string().uuid().optional().nullable(),
	rejectionReason: z.string().optional().nullable(),
	defaultMeetingDayOfWeek: z.string().optional().nullable(),
	defaultMeetingInterval: z.number().int().positive().optional().nullable(),
	defaultMeetingTime: z.string().optional().nullable(),
	defaultMeetingDurationMinutes: z.number().int().positive().optional().nullable(),
	defaultMeetingDescription: z.string().optional().nullable(),
	// IANA TZ inferido de lat/lon o seteado a mano. NULL = fallback en consumidores.
	timezone: z.string().optional().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	// Calculated fields
	memberCount: z.number().optional(),
	meetingCount: z.number().optional(),
	stats: z.any().optional(),
});
export type Community = z.infer<typeof communitySchema>;

export const DayOfWeekEnum = z.enum([
	'monday',
	'tuesday',
	'wednesday',
	'thursday',
	'friday',
	'saturday',
	'sunday',
]);
export type DayOfWeek = z.infer<typeof DayOfWeekEnum>;

// CommunityMember schema
export const communityMemberSchema = z.object({
	id: z.string().uuid(),
	communityId: z.string().uuid(),
	participantId: z.string().uuid(),
	state: MemberStateEnum.default('active_member'),
	joinedAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	notes: z.string().nullable().optional(),
	// Profile overlay (NULL → fallback al Participant subyacente). Resolución
	// vía `resolveMemberProfile(member)` en @repo/utils.
	firstName: z.string().nullable().optional(),
	lastName: z.string().nullable().optional(),
	email: z.string().nullable().optional(),
	cellPhone: z.string().nullable().optional(),
	// Cumpleaños capturado por la comunidad: 'YYYY-MM-DD' o 'MM-DD' (año
	// desconocido). NULL no significa "no tiene" — la resolución cae al
	// participant si su fecha es creíble. No leer esta columna directamente:
	// usar los derivados de abajo, que el backend ya calculó y filtró por rol.
	birthDate: z.string().nullable().optional(),
	// Derivados de solo lectura que devuelve el API:
	//  - birthdayMonthDay: 'MM-DD' del cumpleaños efectivo. Visible a todo admin.
	//  - birthdayYear: año de nacimiento. Solo llega si el viewer es owner.
	birthdayMonthDay: z.string().nullable().optional(),
	birthdayYear: z.number().nullable().optional(),
	// Foto de rostro. Al leerla, el API devuelve una URL firmada de S3 que
	// caduca en una hora (o un data-URI en modo local). La key S3 nunca viaja
	// al cliente: solo la usa el servidor para borrar el objeto.
	photoUrl: z.string().nullable().optional(),
	// Join relations (not always present)
	participant: z.any().optional(),
	// Calculated fields
	lastMeetingsAttendanceRate: z.number().optional(),
	lastMeetingsFrequency: ParticipationFrequencyEnum.optional(),
	// Conteo que respalda el porcentaje (asistidas / total que le cuentan).
	lastMeetingsAttended: z.number().optional(),
	lastMeetingsTotal: z.number().optional(),
	// ISO timestamp del último `participant_communications` scope=community
	// para este (communityId, participantId). NULL si nunca recibió mensaje
	// en esta comunidad. Lo usa el frontend para ordenar por "último contacto".
	lastMessageSentAt: z.string().nullable().optional(),
});
export type CommunityMember = z.infer<typeof communityMemberSchema>;

// CommunityMeeting schema
export const communityMeetingSchema = z.object({
	id: z.string().uuid(),
	communityId: z.string().uuid(),
	title: z.string().min(1).max(200),
	description: z.string().optional(),
	flyerTemplate: z.string().optional(),
	// Foto única (banner/portada) de la reunión. Read-only desde la perspectiva
	// del cliente: se gestiona vía el endpoint dedicado de foto, no en el PUT
	// genérico de la reunión (ver updateCommunityMeetingSchema más abajo).
	photoUrl: z.string().nullable().optional(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date().optional(),
	durationMinutes: z.number().int().positive(),
	isAnnouncement: z.boolean().default(false),
	meetingType: MeetingTypeEnum.default('general'),
	// Recurrence fields
	recurrenceFrequency: RecurrenceFrequencyEnum.nullable(),
	recurrenceInterval: z.number().int().positive().nullable(),
	recurrenceDayOfWeek: z.string().nullable(),
	recurrenceDayOfMonth: z.number().int().positive().max(31).nullable(),
	recurrenceEndDate: z.coerce.date().nullable().optional(),
	isRecurrenceTemplate: z.boolean().default(false),
	parentMeetingId: z.string().uuid().nullable(),
	instanceDate: z.coerce.date().nullable(),
	exceptionType: z.enum(['modified', 'cancelled']).nullable(),
	createdAt: z.coerce.date(),
});
export type CommunityMeeting = z.infer<typeof communityMeetingSchema>;

// CommunityAdmin schema
export const communityAdminSchema = z.object({
	id: z.string().uuid(),
	communityId: z.string().uuid(),
	userId: z.string().uuid(),
	role: z.enum(['owner', 'admin']),
	invitedBy: z.string().uuid().optional(),
	invitedAt: z.coerce.date().optional(),
	acceptedAt: z.coerce.date().optional(),
	status: z.enum(['pending', 'active', 'revoked']).default('pending'),
	invitationToken: z.string().optional(),
	invitationExpiresAt: z.coerce.date().optional(),
	// Join relations
	user: z.any().optional(),
	inviter: z.any().optional(),
});
export type CommunityAdmin = z.infer<typeof communityAdminSchema>;

// CommunityAttendance schema
export const communityAttendanceSchema = z.object({
	id: z.string().uuid(),
	meetingId: z.string().uuid(),
	memberId: z.string().uuid(),
	attended: z.boolean(),
	notes: z.string().optional(),
	recordedAt: z.coerce.date(),
});
export type CommunityAttendance = z.infer<typeof communityAttendanceSchema>;

// --- API Request Schemas ---

export const createCommunitySchema = z.object({
	body: communitySchema.omit({
		id: true,
		createdBy: true,
		createdAt: true,
		updatedAt: true,
	}),
});

export const updateCommunitySchema = z.object({
	body: communitySchema
		.omit({
			id: true,
			createdBy: true,
			createdAt: true,
			updatedAt: true,
		})
		.partial(),
	params: z.object({ id: z.string().uuid() }),
});

export const createCommunityMeetingSchema = z.object({
	body: z.object({
		title: z.string().min(1).max(200),
		description: z.string().optional(),
		flyerTemplate: z.string().optional(),
		startDate: z.coerce.date(),
		endDate: z.coerce.date().optional(),
		durationMinutes: z.number().int().positive().optional(),
		isAnnouncement: z.boolean().default(false),
		meetingType: MeetingTypeEnum.optional(),
		// Recurrence fields - use optional() to allow undefined, nullable() to allow null
		recurrenceFrequency: RecurrenceFrequencyEnum.optional(),
		recurrenceInterval: z.number().int().positive().optional(),
		recurrenceDayOfWeek: z.string().optional(),
		recurrenceDayOfMonth: z.number().int().positive().max(31).nullable().optional(),
		recurrenceEndDate: z.coerce.date().nullable().optional(),
	}),
	params: z.object({
		id: z.string().uuid(),
	}),
});

export const updateCommunityMeetingSchema = z.object({
	body: communityMeetingSchema
		.omit({
			id: true,
			communityId: true,
			createdAt: true,
			// photoUrl se gestiona vía el endpoint dedicado de foto, no en el PUT
			// genérico — evita que el cliente setee URLs arbitrarias sin procesar.
			photoUrl: true,
		})
		.partial(),
	params: z.object({ id: z.string().uuid() }),
});

// Subida de la foto única de una reunión: data-URI base64 de imagen.
// El tamaño/formato real se valida en imageService (magic bytes + 2MB).
export const setCommunityMeetingPhotoSchema = z.object({
	body: z.object({
		photoData: z
			.string()
			.min(1)
			.regex(/^data:image\/(jpeg|jpg|png|gif|webp);base64,/, {
				message: 'photoData debe ser un data-URI de imagen válido',
			}),
	}),
	params: z.object({ id: z.string().uuid() }),
});

/**
 * Foto de rostro de un miembro. Mismo contrato que la foto de reunión: data-URI
 * base64. El tamaño real y el formato los verifica `imageService` en el
 * servidor (magic bytes + límite de 2 MB); aquí solo se acota la forma para
 * rechazar temprano lo que ni siquiera es una imagen.
 */
export const setCommunityMemberPhotoSchema = z.object({
	body: z.object({
		photoData: z
			.string()
			.min(1)
			.regex(/^data:image\/(jpeg|jpg|png|gif|webp);base64,/, {
				message: 'photoData debe ser un data-URI de imagen válido',
			}),
	}),
	params: z.object({
		id: z.string().uuid(),
		memberId: z.string().uuid(),
	}),
});

/**
 * PATCH del cumpleaños. Endpoint aparte del perfil a propósito: el perfil es
 * owner-only porque un co-admin podría rerutear notificaciones cambiando el
 * correo, y un cumpleaños no redirige nada. Separarlo permite que cualquier
 * coordinador ayude a capturar las fechas, que es trabajo de varios.
 */
export const updateMemberBirthdaySchema = z.object({
	body: z.object({
		// '' limpia el dato, igual que en el resto de campos del overlay.
		birthDate: z
			.string()
			.trim()
			.max(10)
			.refine((v) => v === '' || /^(?:\d{4}-)?\d{2}-\d{2}$/.test(v), {
				message: 'birthDate debe ser YYYY-MM-DD o MM-DD',
			}),
	}),
	params: z.object({
		id: z.string().uuid(),
		memberId: z.string().uuid(),
	}),
});

/** DELETE de la foto: no lleva cuerpo, pero los ids se validan igual que en el POST. */
export const deleteCommunityMemberPhotoSchema = z.object({
	params: z.object({
		id: z.string().uuid(),
		memberId: z.string().uuid(),
	}),
});

export const importMembersSchema = z.object({
	body: z.object({
		retreatId: z.string().uuid(),
		participantIds: z.array(z.string().uuid()),
	}),
});

export const updateMemberStateSchema = z.object({
	body: z.object({
		state: MemberStateEnum,
	}),
	params: z.object({
		id: z.string().uuid(),
		memberId: z.string().uuid(),
	}),
});

/**
 * Schema para PATCH /communities/:id/members/:memberId/profile.
 * Solo permite tocar 4 campos overlay del CommunityMember. Todos optional
 * para soportar partial updates. Límites de longitud para evitar abuse
 * (blob storage, DoS).
 *
 * **Asimetría intencional** entre `firstName` y los demás campos:
 *  - `firstName`: `min(1)` — no se permite empty string. Razón: la UI
 *    siempre muestra `fullName` (`firstName + lastName`) para identificar
 *    al miembro; si `firstName` queda vacío, el miembro pierde identidad
 *    visual. El service también valida con `'firstName cannot be empty'`.
 *  - `lastName`, `email`, `cellPhone`: empty string permitido. El service
 *    lo interpreta como "limpiar overlay" → persiste como `null` y el
 *    helper `resolveMemberProfile` vuelve a leer el Participant subyacente.
 *    Útil para revertir un override accidental.
 */
export const updateMemberProfileSchema = z.object({
	body: z
		.object({
			firstName: z.string().trim().min(1).max(100).optional(),
			lastName: z.string().trim().max(100).optional(),
			email: z
				.string()
				.trim()
				.max(254)
				.refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
					message: 'Invalid email format',
				})
				.optional(),
			cellPhone: z.string().trim().max(30).optional(),
			// Cumpleaños del miembro. Dos formatos válidos: 'YYYY-MM-DD' cuando se
			// conoce el año y 'MM-DD' cuando no (mucha gente da día y mes nada más).
			// Empty string = limpiar, igual que los demás campos.
			//
			// El `.refine()` acepta '' explícitamente en vez de encadenar un
			// `.regex().optional()`: esa combinación rechaza el string vacío que el
			// cliente manda al limpiar un campo y devuelve un 400 desconcertante.
			//
			// Aquí solo se valida la FORMA. Que la fecha exista en el calendario
			// (mes 13, 31 de febrero, 29 de febrero de un año no bisiesto) lo
			// verifica el service con `normalizeBirthdayValue` de `@repo/utils`;
			// este paquete no depende de utils.
			birthDate: z
				.string()
				.trim()
				.max(10)
				.refine((v) => v === '' || /^(?:\d{4}-)?\d{2}-\d{2}$/.test(v), {
					message: 'birthDate debe ser YYYY-MM-DD o MM-DD',
				})
				.optional(),
			// Fecha de ingreso a la comunidad. NO es overlay de perfil, pero se
			// edita desde el mismo diálogo. Determina desde cuándo cuentan las
			// reuniones para la tasa de asistencia del miembro.
			joinedAt: z.coerce.date().optional(),
		})
		.refine((data) => Object.keys(data).length > 0, {
			message: 'At least one field must be provided',
		}),
	params: z.object({
		id: z.string().uuid(),
		memberId: z.string().uuid(),
	}),
});

export const recordAttendanceSchema = z.object({
	body: z.array(
		z.object({
			memberId: z.string().uuid(),
			attended: z.boolean(),
			notes: z.string().optional(),
		}),
	),
});

// Asistencia de UN miembro en VARIAS reuniones (una llamada). Usado por el
// diálogo "Registrar asistencia" de la lista de miembros.
export const bulkMemberAttendanceSchema = z.object({
	body: z.object({
		records: z.array(
			z.object({
				meetingId: z.string().uuid(),
				attended: z.boolean(),
			}),
		),
	}),
	params: z.object({
		id: z.string().uuid(),
		memberId: z.string().uuid(),
	}),
});

// --- Estadísticas de asistencia por tipo de reunión ---

// Filtros del reporte. Todos opcionales: sin filtros devuelve todas las
// reuniones consideradas de la comunidad.
// `from`/`to` son date-only (YYYY-MM-DD) y se interpretan como día completo;
// nunca `Date` en el transporte — skill `timezone-handling`.
const dateOnly = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe venir como YYYY-MM-DD');

export const attendanceStatsFiltersSchema = z.object({
	meetingType: MeetingTypeEnum.optional(),
	seriesId: z.string().uuid().optional(),
	from: dateOnly.optional(),
	to: dateOnly.optional(),
	// Acota el ranking al equipo servidor de este retiro (que debe estar
	// vinculado a la comunidad). No recorta las reuniones: el % de una reunión
	// se mide contra su padrón, no contra el equipo de un retiro.
	retreatId: z.string().uuid().optional(),
});
export type AttendanceStatsFilters = z.infer<typeof attendanceStatsFiltersSchema>;

// El cliente manda cadena vacía cuando limpia un filtro; `.optional()` sobre un
// enum o un regex la rechazaría con 400 (bug recurrente de este repo). El
// preprocess la normaliza a undefined antes de validar.
// Un `?meetingType=a&meetingType=b` llega como array desde Express. Se queda con
// el primero en vez de reventar con un 400: el enlace repetido es un error del
// cliente, no algo que deba tumbar el reporte. Sin esto el array llegaba al enum
// y el `validateRequest` cortaba antes de que el controlador pudiera normalizarlo.
const emptyToUndefined = (schema: z.ZodTypeAny) =>
	z.preprocess((v) => {
		const first: unknown = Array.isArray(v) ? (v as unknown[])[0] : v;
		return first === '' || first === null ? undefined : first;
	}, schema);

export const communityAttendanceStatsQuerySchema = z.object({
	query: z.object({
		meetingType: emptyToUndefined(MeetingTypeEnum.optional()),
		seriesId: emptyToUndefined(z.string().uuid().optional()),
		from: emptyToUndefined(dateOnly.optional()),
		to: emptyToUndefined(dateOnly.optional()),
		retreatId: emptyToUndefined(z.string().uuid().optional()),
	}),
	params: z.object({ id: z.string().uuid() }),
});

// La asistencia del equipo servidor mide las preparaciones DEL RETIRO, así que
// no lleva filtros: el conjunto ya está delimitado por su calendario.
export const serverAttendanceQuerySchema = z.object({
	params: z.object({
		id: z.string().uuid(),
		retreatId: z.string().uuid(),
	}),
});

// Una reunión del conjunto considerado, con su porcentaje.
// `eligible` = miembros del roster canónico que ya se habían unido a la fecha
// de la reunión. Puede ser 0 en datos históricos; entonces `ratePercent` es 0.
export const attendanceStatsMeetingRowSchema = z.object({
	id: z.string().uuid(),
	title: z.string(),
	startDate: z.coerce.date(),
	meetingType: MeetingTypeEnum,
	attended: z.number().int().nonnegative(),
	eligible: z.number().int().nonnegative(),
	ratePercent: z.number(),
});
export type AttendanceStatsMeetingRow = z.infer<typeof attendanceStatsMeetingRowSchema>;

// Un miembro del padrón con su tasa dentro del conjunto filtrado.
// `total` es el denominador que le cuenta a ESE miembro (respeta su joinedAt),
// así que dos miembros pueden tener denominadores distintos.
export const attendanceStatsMemberRowSchema = z.object({
	memberId: z.string().uuid(),
	participantId: z.string().uuid(),
	firstName: z.string(),
	lastName: z.string(),
	state: MemberStateEnum,
	attended: z.number().int().nonnegative(),
	total: z.number().int().nonnegative(),
	ratePercent: z.number(),
	frequency: ParticipationFrequencyEnum,
	// Retiros DE ESTA COMUNIDAD en los que ha servido. Mide el compromiso en
	// retiros, no sólo en reuniones.
	retreatsServed: z.number().int().nonnegative(),
});
export type AttendanceStatsMemberRow = z.infer<typeof attendanceStatsMemberRowSchema>;

export const communityAttendanceStatsSchema = z.object({
	filters: attendanceStatsFiltersSchema,
	meetings: z.array(attendanceStatsMeetingRowSchema),
	members: z.array(attendanceStatsMemberRowSchema),
	totals: z.object({
		meetingCount: z.number().int().nonnegative(),
		memberCount: z.number().int().nonnegative(),
		averageRatePercent: z.number(),
	}),
	// Tipos que la comunidad realmente usa, para poblar el filtro sin ofrecer
	// opciones vacías. Cuenta TODAS las reuniones del tipo (no sólo las
	// consideradas), para que el coordinador vea que el tipo existe aunque su
	// única reunión sea futura.
	availableTypes: z.array(
		z.object({ meetingType: MeetingTypeEnum, count: z.number().int().positive() }),
	),
	// Retiros de la comunidad, para el filtro por retiro.
	retreats: z.array(
		z.object({ id: z.string().uuid(), label: z.string(), startDate: z.coerce.date() }),
	),
	// Preparaciones del retiro filtrado que están sincronizadas. 0 con un retiro
	// elegido = "sin sincronizar", que es distinto de "sin asistencia".
	retreatLinkedMeetingCount: z.number().int().nonnegative(),
});
export type CommunityAttendanceStats = z.infer<typeof communityAttendanceStatsSchema>;

// Proyección de la tasa sobre el equipo servidor de un retiro.
// Un servidor que NO está en el padrón de la comunidad no aparece en `entries`:
// "no está en el padrón" no es "no asistió", y devolverlo como 0% mentiría.
export const serverAttendanceEntrySchema = z.object({
	participantId: z.string().uuid(),
	memberId: z.string().uuid(),
	attended: z.number().int().nonnegative(),
	total: z.number().int().nonnegative(),
	ratePercent: z.number(),
	frequency: ParticipationFrequencyEnum,
});
export type ServerAttendanceEntry = z.infer<typeof serverAttendanceEntrySchema>;

export const retreatServerAttendanceSchema = z.object({
	communityId: z.string().uuid(),
	retreatId: z.string().uuid(),
	meetingCount: z.number().int().nonnegative(),
	serverCount: z.number().int().nonnegative(),
	matchedCount: z.number().int().nonnegative(),
	unmatchedCount: z.number().int().nonnegative(),
	// 0 = el calendario del retiro no está sincronizado como reuniones.
	retreatLinkedMeetingCount: z.number().int().nonnegative(),
	entries: z.array(serverAttendanceEntrySchema),
});
export type RetreatServerAttendance = z.infer<typeof retreatServerAttendanceSchema>;

// --- Fusión de participantes duplicados ---
//
// La misma persona puede existir dos veces: inscrita en un retiro y dada de alta
// aparte en el padrón. Nada se fusiona solo: el preview enumera lo que se movería
// y lo que BLOQUEA, y la fusión se niega si hay bloqueos.

export const mergeParticipantsSchema = z.object({
	body: z.object({
		/** Ficha que sobrevive y absorbe. */
		keepId: z.string().uuid(),
		/** Ficha absorbida: queda como lápida, no se borra. */
		mergeId: z.string().uuid(),
	}),
	params: z.object({ id: z.string().uuid() }),
});

/**
 * Los dos ids del preview, que viajan como query params (`GET .../preview`).
 * Aparte de `mergeParticipantsSchema`, que valida el POST y por eso está envuelto
 * en `{ body, params }`: reusar ese aquí hacía que el parse fallara siempre.
 */
export const mergePreviewQuerySchema = z.object({
	keepId: z.string().uuid(),
	mergeId: z.string().uuid(),
});

export const duplicateCandidateSchema = z.object({
	matchedBy: z.enum(['name', 'phone', 'email']),
	participants: z.array(
		z.object({
			id: z.string().uuid(),
			firstName: z.string(),
			lastName: z.string(),
			email: z.string().nullable(),
			cellPhone: z.string().nullable(),
			references: z.number().int().nonnegative(),
			hasUser: z.boolean(),
			isCommunityMember: z.boolean(),
		}),
	),
});
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>;

export const mergePreviewSchema = z.object({
	keepId: z.string().uuid(),
	mergeId: z.string().uuid(),
	keepLabel: z.string(),
	mergeLabel: z.string(),
	moves: z.array(
		z.object({
			table: z.string(),
			column: z.string(),
			rows: z.number().int().nonnegative(),
			discarded: z.number().int().nonnegative(),
		}),
	),
	blockers: z.array(z.object({ table: z.string(), column: z.string(), reason: z.string() })),
	attendanceMoved: z.number().int().nonnegative(),
	attendanceMerged: z.number().int().nonnegative(),
	merged: z.boolean().optional(),
});
export type MergePreview = z.infer<typeof mergePreviewSchema>;

export const inviteCommunityAdminSchema = z.object({
	body: z.object({
		email: z.string().email(),
	}),
});

export const addCommunityAdminSchema = z.object({
	body: z.object({
		userId: z.string().uuid(),
	}),
});

export const publicJoinRequestSchema = z.object({
	body: z.object({
		firstName: z.string().min(1),
		lastName: z.string().min(1),
		email: z.string().email(),
		cellPhone: z.string().optional(),
		// Cumpleaños opcional. Mismo formato dual que el resto: 'YYYY-MM-DD' o
		// 'MM-DD'. El `.refine()` acepta '' porque el formulario lo manda vacío
		// cuando la persona no lo llena.
		birthDate: z
			.string()
			.trim()
			.max(10)
			.refine((v) => v === '' || /^(?:\d{4}-)?\d{2}-\d{2}$/.test(v), {
				message: 'birthDate debe ser YYYY-MM-DD o MM-DD',
			})
			.optional(),
	}),
	params: z.object({
		id: z.string().uuid(),
	}),
});

const optionalUrl = z
	.string()
	.trim()
	.url()
	.optional()
	.or(z.literal('').transform(() => undefined));

export const publicRegisterCommunitySchema = z.object({
	body: z.object({
		name: z.string().trim().min(1).max(200),
		description: z.string().trim().max(2000).optional(),
		address1: z.string().trim().min(1).max(255),
		address2: z.string().trim().max(255).optional(),
		city: z.string().trim().min(1).max(255),
		state: z.string().trim().min(1).max(255),
		zipCode: z.string().trim().min(1).max(20),
		country: z.string().trim().min(1).max(255),
		latitude: z.number().min(-90).max(90),
		longitude: z.number().min(-180).max(180),
		googleMapsUrl: optionalUrl,
		parish: z.string().trim().max(255).optional(),
		diocese: z.string().trim().max(255).optional(),
		website: optionalUrl,
		facebookUrl: optionalUrl,
		instagramUrl: optionalUrl,
		contactName: z.string().trim().min(1).max(255),
		contactEmail: z.string().trim().toLowerCase().email(),
		contactPhone: z.string().trim().max(50).optional(),
		// Horario por defecto (opcional). Si se llenan, al aprobar se crea una reunión recurrente.
		defaultMeetingDayOfWeek: DayOfWeekEnum.optional(),
		defaultMeetingInterval: z.number().int().min(1).max(12).optional(),
		defaultMeetingTime: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora inválida (formato HH:mm)')
			.optional(),
		defaultMeetingDurationMinutes: z.number().int().min(15).max(600).optional(),
		defaultMeetingDescription: z.string().trim().max(1000).optional(),
		recaptchaToken: z.string().min(1),
	}),
});
export type PublicRegisterCommunityInput = z.infer<
	typeof publicRegisterCommunitySchema
>['body'];

export const approveCommunitySchema = z.object({
	params: z.object({ id: z.string().uuid() }),
});

export const rejectCommunitySchema = z.object({
	params: z.object({ id: z.string().uuid() }),
	body: z.object({
		rejectionReason: z.string().trim().max(2000).optional(),
	}),
});
