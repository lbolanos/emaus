/**
 * Shared utility functions for message template variable replacement
 * Used by both API and web applications to avoid code duplication
 */

/**
 * Shape mínima requerida por `resolveMemberProfile`. Acepta tanto un
 * `CommunityMember` completo (con `participant` cargado) como un objeto
 * literal con los campos overlay y la relación participant opcional.
 */
export interface MemberOverlayLike {
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
	cellPhone?: string | null;
	participant?: {
		firstName?: string | null;
		lastName?: string | null;
		email?: string | null;
		cellPhone?: string | null;
	} | null;
}

/**
 * Resuelve el perfil efectivo de un `CommunityMember` aplicando el overlay
 * por-comunidad si está set, sino haciendo fallback al `Participant` global.
 *
 * Regla de overlay:
 *  - `null` o `undefined` o `''` → usar el valor del participant.
 *  - Cualquier otro string → ese gana sobre el participant.
 *
 * Devuelve siempre strings (vacíos si ambos lados son null). Incluye
 * `fullName` precomputado para display.
 *
 * Convención del proyecto: empty-string en overlay equivale a "limpiar"
 * — el caller (service `updateMemberProfile`) debe convertir `''` a `null`
 * antes de persistir para no quedarse con strings vacíos en la DB.
 */
export function resolveMemberProfile(m: MemberOverlayLike): {
	firstName: string;
	lastName: string;
	email: string;
	cellPhone: string;
	fullName: string;
} {
	const p = m.participant ?? {};
	const pick = (a: string | null | undefined, b: string | null | undefined): string =>
		a != null && a !== '' ? a : b ?? '';
	const firstName = pick(m.firstName, p.firstName);
	const lastName = pick(m.lastName, p.lastName);
	return {
		firstName,
		lastName,
		email: pick(m.email, p.email),
		cellPhone: pick(m.cellPhone, p.cellPhone),
		fullName: `${firstName} ${lastName}`.trim(),
	};
}

/**
 * Interface for participant data structure
 */
export interface ParticipantData {
	firstName?: string;
	lastName?: string;
	nickname?: string;
	type?: string;
	birthDate?: string;
	maritalStatus?: string;
	street?: string;
	houseNumber?: string;
	postalCode?: string;
	neighborhood?: string;
	city?: string;
	state?: string;
	country?: string;
	parish?: string;
	homePhone?: string;
	workPhone?: string;
	cellPhone?: string;
	email?: string;
	occupation?: string;
	snores?: boolean;
	hasMedication?: boolean;
	medicationDetails?: string;
	medicationSchedule?: string;
	hasDietaryRestrictions?: boolean;
	dietaryRestrictionsDetails?: string;
	sacraments?: string[];
	emergencyContact1Name?: string;
	emergencyContact1Relation?: string;
	emergencyContact1HomePhone?: string;
	emergencyContact1WorkPhone?: string;
	emergencyContact1CellPhone?: string;
	emergencyContact1Email?: string;
	emergencyContact2Name?: string;
	emergencyContact2Relation?: string;
	emergencyContact2HomePhone?: string;
	emergencyContact2WorkPhone?: string;
	emergencyContact2CellPhone?: string;
	emergencyContact2Email?: string;
	tshirtSize?: string;
	invitedBy?: string;
	isInvitedByEmausMember?: boolean;
	inviterHomePhone?: string;
	inviterWorkPhone?: string;
	inviterCellPhone?: string;
	inviterEmail?: string;
	family_friend_color?: string;
	pickupLocation?: string;
	arrivesOnOwn?: boolean;
	paymentDate?: string;
	paymentAmount?: number;
	isScholarship?: boolean;
	palancasCoordinator?: string;
	palancasRequested?: boolean;
	palancasReceived?: string;
	palancasNotes?: string;
	requestsSingleRoom?: boolean;
	isCancelled?: boolean;
	notes?: string;
	registrationDate?: string;
	lastUpdatedDate?: string;
	tableMesa?: { name: string };
	retreatBed?: { roomNumber: string; bedNumber: string };
	palanquero?: { name?: string; email?: string; cellPhone?: string };
	dataDeleteToken?: string | null;
}

/**
 * Variables specific to community-scoped templates (community emails,
 * meeting invitations, join-request notifications, etc.). These templates
 * are seeded as "Global" rows in message_templates and are rendered both
 * server-side (CommunityService) and in the UI editor preview.
 */
export interface CommunityData {
	name?: string;
	parish?: string;
	meetingTitle?: string;
	meetingDate?: string;
	attendanceLink?: string;
	requesterName?: string;
	requesterEmail?: string;
	requesterPhone?: string;
	userEmail?: string;
	acceptUrl?: string;
}

/**
 * Interface for retreat data structure
 */
export interface RetreatData {
	parish?: string;
	startDate?: string | Date;
	endDate?: string | Date;
	openingNotes?: string;
	closingNotes?: string;
	thingsToBringNotes?: string;
	cost?: string;
	paymentInfo?: string;
	paymentMethods?: string;
	max_walkers?: number;
	max_servers?: number;
	walkerArrivalTime?: string;
	serverArrivalTimeFriday?: string;
	retreat_type?: string;
	retreat_number_version?: string;
	closingChurchName?: string | null;
	closingChurchAddress?: string | null;
	closingChurchLatitude?: number | null;
	closingChurchLongitude?: number | null;
	/**
	 * Próxima reunión de comunidad pre-resuelta por el caller (típicamente
	 * MessageDialog vía `GET /api/participants/:id/next-meeting`). String
	 * humano-legible en español ("lunes, 1 de junio de 2026, 19:00") o vacío
	 * si el participante no tiene reuniones próximas en sus comunidades.
	 */
	nextMeetingDate?: string;
}

/**
 * Datos de un caminante para el roster de mesa (scope `table.*`). Solo se
 * usan los campos necesarios para que un líder pueda contactarlo: teléfonos
 * propios y de ambos contactos de emergencia.
 */
export interface TableWalkerData {
	firstName?: string;
	lastName?: string;
	nickname?: string;
	cellPhone?: string;
	homePhone?: string;
	workPhone?: string;
	emergencyContact1Name?: string;
	emergencyContact1Relation?: string;
	emergencyContact1CellPhone?: string;
	emergencyContact1HomePhone?: string;
	emergencyContact1WorkPhone?: string;
	emergencyContact2Name?: string;
	emergencyContact2Relation?: string;
	emergencyContact2CellPhone?: string;
	emergencyContact2HomePhone?: string;
	emergencyContact2WorkPhone?: string;
}

/**
 * Variables del scope `table.*`: datos de una mesa de retiro armada, para
 * enviar al líder/colíder el roster de caminantes con sus teléfonos y los de
 * sus contactos de emergencia. Se arma client-side en `TableCard` (no hay un
 * "table" en el contexto retreat normal, por eso es opcional en
 * `replaceAllVariables`).
 */
export interface TableData {
	name?: string;
	liderName?: string;
	colider1Name?: string;
	colider2Name?: string;
	walkers?: TableWalkerData[];
}

/**
 * URL universal de Google Maps construida desde lat/lng. Funciona en
 * cualquier app de escaneo, cliente de email o WhatsApp; en mobile abre la
 * app de mapas instalada (Google Maps / Apple Maps), en desktop abre la web.
 * Devuelve cadena vacía si faltan coordenadas, para no romper plantillas.
 */
export const buildClosingChurchMapsUrl = (
	lat?: number | null,
	lng?: number | null,
): string =>
	lat != null && lng != null
		? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
		: '';

/**
 * URL universal de Waze construida desde lat/lng. Abre la app si está
 * instalada, sino la web.
 */
export const buildClosingChurchWazeUrl = (
	lat?: number | null,
	lng?: number | null,
): string =>
	lat != null && lng != null ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` : '';

/**
 * Format date options interface
 */
export interface FormatDateOptions {
	locale?: string;
	format?: 'short' | 'long' | 'full' | 'datetime';
}

/** TZ por defecto cuando una comunidad/house no tiene el campo seteado. */
export const DEFAULT_TIMEZONE = 'America/Mexico_City';

/**
 * Resuelve el IANA timezone de una comunidad. Espejo del helper homónimo en el
 * backend (`apps/api/src/services/communityService.ts:28`).
 */
export const getCommunityTimezone = (
	community: { timezone?: string | null } | null | undefined,
): string => community?.timezone || DEFAULT_TIMEZONE;

export interface FormatInTimezoneOptions {
	/** Locale para `Intl.DateTimeFormat`. Default `'es-MX'`. */
	locale?: string;
	/**
	 * Preset rápido. Si se pasan `dateStyle`/`timeStyle` directamente, se ignora.
	 * - 'datetime-short': `dd/mm/yy hh:mm` (default)
	 * - 'datetime-long': `lunes, 15 de junio de 2026, 19:00`
	 * - 'date-long': `lunes, 15 de junio de 2026`
	 * - 'date-short': `15/06/26`
	 * - 'time': `19:00`
	 */
	preset?: 'datetime-short' | 'datetime-long' | 'date-long' | 'date-short' | 'time';
	dateStyle?: 'full' | 'long' | 'medium' | 'short';
	timeStyle?: 'full' | 'long' | 'medium' | 'short';
}

/**
 * Formatea una fecha (Date u ISO string) usando el timezone de una comunidad.
 *
 * Centraliza el patrón `new Date(x).toLocaleString('es-MX', { timeZone, ... })`
 * para que todas las vistas comunitarias rendericen la misma hora local
 * independientemente del TZ del navegador del coordinador. Sin esto, un
 * coordinador en EU veía una hora distinta a la que vieron los miembros en MX.
 */
export function formatDateInCommunityTimezone(
	date: Date | string | null | undefined,
	community: { timezone?: string | null } | null | undefined,
	options: FormatInTimezoneOptions = {},
): string {
	if (!date) return '';
	const d = typeof date === 'string' ? new Date(date) : date;
	if (isNaN(d.getTime())) return '';

	const tz = getCommunityTimezone(community);
	const locale = options.locale ?? 'es-MX';

	const presetMap: Record<NonNullable<FormatInTimezoneOptions['preset']>, Intl.DateTimeFormatOptions> = {
		'datetime-short': { dateStyle: 'short', timeStyle: 'short' },
		'datetime-long': { dateStyle: 'full', timeStyle: 'short' },
		'date-long': { dateStyle: 'full' },
		'date-short': { dateStyle: 'short' },
		time: { timeStyle: 'short' },
	};

	const presetOpts = options.preset ? presetMap[options.preset] : presetMap['datetime-short'];
	const dateStyle = options.dateStyle ?? presetOpts.dateStyle;
	const timeStyle = options.timeStyle ?? presetOpts.timeStyle;

	const opts: Intl.DateTimeFormatOptions = { timeZone: tz };
	if (dateStyle) opts.dateStyle = dateStyle;
	if (timeStyle) opts.timeStyle = timeStyle;

	return d.toLocaleString(locale, opts);
}

/**
 * Format date avoiding timezone shifts caused by UTC to local conversion
 * Handles ISO datetime strings (e.g., 2025-12-26T00:00:00.000Z) and YYYY-MM-DD formats
 *
 * @param date - Date to format (Date object or ISO string)
 * @param options - Formatting options
 * @returns Formatted date string
 */
export function formatDate(date: Date | string, options: FormatDateOptions = {}): string {
	const { locale = 'es-ES', format = 'short' } = options;

	// For datetime format we need the actual instant (with time) converted to the
	// user's local timezone — do NOT strip to UTC date parts, that would lose the hour.
	if (format === 'datetime') {
		const dateObj = typeof date === 'string' ? new Date(date) : date;
		return dateObj.toLocaleString(locale, {
			day: '2-digit',
			month: '2-digit',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
	}

	// For date-only formats, extract date parts to avoid timezone shifts
	// (e.g. a birth date stored as 2025-12-26T00:00:00.000Z should not become Dec 25 in UTC-6)
	let dateObj: Date;
	if (typeof date === 'string') {
		const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
		if (match) {
			const [year, month, day] = match[1].split('-').map(Number);
			dateObj = new Date(year, month - 1, day);
		} else {
			const d = new Date(date);
			dateObj = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
		}
	} else {
		dateObj = date;
	}

	switch (format) {
		case 'long':
			return dateObj.toLocaleDateString(locale, {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			});
		case 'full':
			return dateObj.toLocaleDateString(locale, {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric',
			});
		case 'short':
		default:
			return dateObj.toLocaleDateString(locale);
	}
}

/**
 * Default mock participant data used as a fallback for preview/editor when
 * no real participant is available. Exported for reuse in tests.
 */
const getMockParticipant = (): ParticipantData => {
	return {
		firstName: 'Juan',
		lastName: 'Pérez',
		nickname: 'Juancho',
		type: 'WALKER',
		birthDate: '1990-05-15',
		maritalStatus: 'Soltero',
		street: 'Calle Principal',
		houseNumber: '123',
		postalCode: '12345',
		neighborhood: 'Centro',
		city: 'Ciudad de México',
		state: 'Ciudad de México',
		country: 'México',
		parish: 'San Judas Tadeo',
		homePhone: '555-123-4567',
		workPhone: '555-987-6543',
		cellPhone: '555-555-5555',
		email: 'juan.perez@email.com',
		occupation: 'Ingeniero',
		snores: false,
		hasMedication: false,
		medicationDetails: '',
		medicationSchedule: '',
		hasDietaryRestrictions: false,
		dietaryRestrictionsDetails: '',
		sacraments: ['Bautismo', 'Primera Comunión', 'Confirmación'],
		emergencyContact1Name: 'María García',
		emergencyContact1Relation: 'Esposa',
		emergencyContact1HomePhone: '555-111-2222',
		emergencyContact1WorkPhone: '555-222-3333',
		emergencyContact1CellPhone: '555-333-4444',
		emergencyContact1Email: 'maria.garcia@email.com',
		emergencyContact2Name: 'Carlos López',
		emergencyContact2Relation: 'Hermano',
		emergencyContact2HomePhone: '555-444-5555',
		emergencyContact2WorkPhone: '555-555-6666',
		emergencyContact2CellPhone: '555-666-7777',
		emergencyContact2Email: 'carlos.lopez@email.com',
		tshirtSize: 'M',
		invitedBy: 'Pedro Martínez',
		isInvitedByEmausMember: true,
		inviterHomePhone: '555-777-8888',
		inviterWorkPhone: '555-888-9999',
		inviterCellPhone: '555-999-0000',
		inviterEmail: 'pedro.martinez@email.com',
		family_friend_color: 'Azul',
		pickupLocation: 'Iglesia San Judas Tadeo',
		arrivesOnOwn: false,
		paymentDate: '2024-01-15',
		paymentAmount: 1500,
		isScholarship: false,
		palancasCoordinator: 'Palanquero 1',
		palanquero: {
			name: 'Ana Rodríguez',
			email: 'ana.rodriguez@email.com',
			cellPhone: '555-101-2020',
		},
		palancasRequested: true,
		palancasReceived: '3 de 5',
		palancasNotes: 'Necesita palancas de apoyo emocional',
		requestsSingleRoom: false,
		isCancelled: false,
		notes: 'Participante entusiasta y comprometido',
		registrationDate: '2024-01-01',
		lastUpdatedDate: '2024-01-10',
		tableMesa: { name: '01' },
		retreatBed: { roomNumber: '101', bedNumber: '1' },
	};
};

/**
 * Builds the participant variable replacement map from real data (no mock
 * fallback). Used by replaceParticipantVariables and findEmptyVariables.
 */
const buildParticipantReplacements = (
	participantData: ParticipantData,
	selectedContactKey?: string,
): Record<string, string> => {
	// Determine which emergency contact to use for the generic
	// {participant.emergencyContact*} variables. The selection is based on
	// the contact key chosen in the message sending form. If the chosen key
	// references emergency contact 2, use EC2; otherwise default to EC1.
	const useEmergencyContact2 =
		!!selectedContactKey && selectedContactKey.startsWith('emergencyContact2');
	const ecName = useEmergencyContact2
		? participantData.emergencyContact2Name
		: participantData.emergencyContact1Name;
	const ecRelation = useEmergencyContact2
		? participantData.emergencyContact2Relation
		: participantData.emergencyContact1Relation;
	const ecHomePhone = useEmergencyContact2
		? participantData.emergencyContact2HomePhone
		: participantData.emergencyContact1HomePhone;
	const ecWorkPhone = useEmergencyContact2
		? participantData.emergencyContact2WorkPhone
		: participantData.emergencyContact1WorkPhone;
	const ecCellPhone = useEmergencyContact2
		? participantData.emergencyContact2CellPhone
		: participantData.emergencyContact1CellPhone;
	const ecEmail = useEmergencyContact2
		? participantData.emergencyContact2Email
		: participantData.emergencyContact1Email;

	// Nombre del DESTINATARIO real según el contacto elegido en el formulario de
	// envío: contacto de emergencia 1/2, invitador, o el propio participante.
	// Permite que UNA plantilla salude a quien sea el destinatario con
	// {participant.recipientName} / {participant.recipientFirstName}, sin tener
	// que escribir condicionales por tipo de contacto.
	const recipientName = selectedContactKey?.startsWith('emergencyContact1')
		? participantData.emergencyContact1Name || ''
		: selectedContactKey?.startsWith('emergencyContact2')
			? participantData.emergencyContact2Name || ''
			: selectedContactKey?.startsWith('inviter')
				? participantData.invitedBy || ''
				: `${participantData.firstName || ''} ${participantData.lastName || ''}`.trim();
	const recipientFirstName = recipientName.split(' ')[0] || '';

	return {
		'participant.firstName': participantData.firstName || '',
		'participant.lastName': participantData.lastName || '',
		// Si no hay apodo, usar un nombre corto (el primer nombre de pila) en vez de
		// dejar el saludo en blanco. Muchas plantillas saludan con {participant.nickname}.
		'participant.nickname':
			participantData.nickname || (participantData.firstName || '').trim().split(/\s+/)[0] || '',
		'participant.type': participantData.type || '',
		'participant.birthDate': participantData.birthDate || '',
		'participant.maritalStatus': participantData.maritalStatus || '',
		'participant.street': participantData.street || '',
		'participant.houseNumber': participantData.houseNumber || '',
		'participant.postalCode': participantData.postalCode || '',
		'participant.neighborhood': participantData.neighborhood || '',
		'participant.city': participantData.city || '',
		'participant.state': participantData.state || '',
		'participant.country': participantData.country || '',
		'participant.parish': participantData.parish || '',
		'participant.homePhone': participantData.homePhone || '',
		'participant.workPhone': participantData.workPhone || '',
		'participant.cellPhone': participantData.cellPhone || '',
		'participant.email': participantData.email || '',
		'participant.occupation': participantData.occupation || '',
		'participant.snores': participantData.snores ? 'Sí' : 'No',
		'participant.hasMedication': participantData.hasMedication ? 'Sí' : 'No',
		'participant.medicationDetails': participantData.medicationDetails || '',
		'participant.medicationSchedule': participantData.medicationSchedule || '',
		'participant.hasDietaryRestrictions': participantData.hasDietaryRestrictions ? 'Sí' : 'No',
		'participant.dietaryRestrictionsDetails': participantData.dietaryRestrictionsDetails || '',
		'participant.sacraments': Array.isArray(participantData.sacraments)
			? participantData.sacraments.join(', ')
			: '',
		'participant.emergencyContact1Name': participantData.emergencyContact1Name || '',
		'participant.emergencyContact1Relation': participantData.emergencyContact1Relation || '',
		'participant.emergencyContact1HomePhone': participantData.emergencyContact1HomePhone || '',
		'participant.emergencyContact1WorkPhone': participantData.emergencyContact1WorkPhone || '',
		'participant.emergencyContact1CellPhone': participantData.emergencyContact1CellPhone || '',
		'participant.emergencyContact1Email': participantData.emergencyContact1Email || '',
		'participant.emergencyContact2Name': participantData.emergencyContact2Name || '',
		'participant.emergencyContact2Relation': participantData.emergencyContact2Relation || '',
		'participant.emergencyContact2HomePhone': participantData.emergencyContact2HomePhone || '',
		'participant.emergencyContact2WorkPhone': participantData.emergencyContact2WorkPhone || '',
		'participant.emergencyContact2CellPhone': participantData.emergencyContact2CellPhone || '',
		'participant.emergencyContact2Email': participantData.emergencyContact2Email || '',
		// Generic emergency contact variables — resolve to EC1 or EC2
		// based on the contact selected in the message sending form.
		'participant.recipientName': recipientName,
		'participant.recipientFirstName': recipientFirstName,
		'participant.emergencyContactName': ecName || '',
		'participant.emergencyContactRelation': ecRelation || '',
		'participant.emergencyContactHomePhone': ecHomePhone || '',
		'participant.emergencyContactWorkPhone': ecWorkPhone || '',
		'participant.emergencyContactCellPhone': ecCellPhone || '',
		'participant.emergencyContactEmail': ecEmail || '',
		'participant.tshirtSize': participantData.tshirtSize || '',
		'participant.invitedBy': participantData.invitedBy || '',
		'participant.isInvitedByEmausMember': participantData.isInvitedByEmausMember ? 'Sí' : 'No',
		'participant.inviterHomePhone': participantData.inviterHomePhone || '',
		'participant.inviterWorkPhone': participantData.inviterWorkPhone || '',
		'participant.inviterCellPhone': participantData.inviterCellPhone || '',
		'participant.inviterEmail': participantData.inviterEmail || '',
		'participant.family_friend_color': participantData.family_friend_color || '',
		'participant.pickupLocation': participantData.pickupLocation || '',
		'participant.arrivesOnOwn': participantData.arrivesOnOwn ? 'Sí' : 'No',
		'participant.paymentDate': participantData.paymentDate || '',
		'participant.paymentAmount': participantData.paymentAmount?.toString() || '',
		'participant.isScholarship': participantData.isScholarship ? 'Sí' : 'No',
		'participant.palancasCoordinator': participantData.palancasCoordinator || '',
		'participant.palanqueroName': participantData.palanquero?.name || '',
		'participant.palanqueroEmail': participantData.palanquero?.email || '',
		'participant.palanqueroCellPhone': participantData.palanquero?.cellPhone || '',
		'participant.palancasRequested': participantData.palancasRequested ? 'Sí' : 'No',
		'participant.palancasReceived': participantData.palancasReceived || '',
		'participant.palancasNotes': participantData.palancasNotes || '',
		'participant.requestsSingleRoom': participantData.requestsSingleRoom ? 'Sí' : 'No',
		'participant.isCancelled': participantData.isCancelled ? 'Sí' : 'No',
		'participant.notes': participantData.notes || '',
		'participant.registrationDate': participantData.registrationDate || '',
		'participant.lastUpdatedDate': participantData.lastUpdatedDate || '',
		'participant.table': participantData.tableMesa?.name || '',
		'participant.roomNumber': participantData.retreatBed?.roomNumber || '',
		'participant.bedNumber': participantData.retreatBed?.bedNumber || '',
		'participant.dataDeleteUrl': participantData.dataDeleteToken
			? `${getPublicWebUrl()}/eliminar-datos/${participantData.dataDeleteToken}`
			: '',
	};
};

declare const process: { env: Record<string, string | undefined> } | undefined;

const getPublicWebUrl = (): string => {
	if (typeof process !== 'undefined' && process?.env) {
		return (
			process.env.PUBLIC_WEB_URL ||
			process.env.FRONTEND_URL ||
			'http://localhost:5173'
		);
	}
	return 'http://localhost:5173';
};

/**
 * Replaces all participant variables in a message template with actual participant data
 * Uses mock data if participant is undefined or null
 */
export const replaceParticipantVariables = (
	message: string,
	participant: ParticipantData | null | undefined,
	selectedContactKey?: string,
): string => {
	const participantData = participant || getMockParticipant();
	const participantReplacements = buildParticipantReplacements(participantData, selectedContactKey);

	let processedMessage = message;
	Object.entries(participantReplacements).forEach(([key, value]) => {
		processedMessage = processedMessage.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
	});

	return processedMessage;
};

const getMockRetreat = (): RetreatData => {
	return {
		parish: 'Parroquia San José',
		startDate: '2024-03-15',
		endDate: '2024-03-17',
		openingNotes: 'Bienvenidos al retiro de Emaús',
		closingNotes: 'Gracias por participar en este retiro',
		thingsToBringNotes: 'Ropa cómoda, Biblia, cuaderno, botella de agua',
		cost: '50',
		paymentInfo: 'Transferencia bancaria: ES00 2100 1234 5678 9012 3456',
		paymentMethods: 'Transferencia, efectivo',
		max_walkers: 30,
		max_servers: 15,
		walkerArrivalTime: '18:00',
		serverArrivalTimeFriday: '16:00',
		retreat_type: 'men',
		retreat_number_version: 'I',
		closingChurchName: 'Parroquia San Judas Tadeo',
		closingChurchAddress: 'Av. Insurgentes Sur 1234, Del Valle, CDMX',
		closingChurchLatitude: 19.3776,
		closingChurchLongitude: -99.1726,
		nextMeetingDate: 'lunes, 1 de junio de 2026, 19:00',
	};
};

const buildRetreatReplacements = (retreatData: RetreatData): Record<string, string> => {
	return {
		'retreat.parish': retreatData.parish || '',
		'retreat.startDate': retreatData.startDate
			? formatDate(retreatData.startDate, { format: 'long' })
			: '',
		'retreat.endDate': retreatData.endDate
			? formatDate(retreatData.endDate, { format: 'long' })
			: '',
		'retreat.openingNotes': retreatData.openingNotes || '',
		'retreat.closingNotes': retreatData.closingNotes || '',
		'retreat.thingsToBringNotes': retreatData.thingsToBringNotes || '',
		'retreat.cost': retreatData.cost || '',
		'retreat.paymentInfo': retreatData.paymentInfo || '',
		'retreat.paymentMethods': retreatData.paymentMethods || '',
		'retreat.maxWalkers': retreatData.max_walkers?.toString() || '',
		'retreat.maxServers': retreatData.max_servers?.toString() || '',
		'retreat.walkerArrivalTime': retreatData.walkerArrivalTime || '',
		'retreat.serverArrivalTimeFriday': retreatData.serverArrivalTimeFriday || '',
		'retreat.type': retreatData.retreat_type || '',
		'retreat.number': retreatData.retreat_number_version || '',
		'retreat.closingChurchName': retreatData.closingChurchName || '',
		'retreat.closingChurchAddress': retreatData.closingChurchAddress || '',
		'retreat.closingChurchMapsUrl': buildClosingChurchMapsUrl(
			retreatData.closingChurchLatitude,
			retreatData.closingChurchLongitude,
		),
		'retreat.closingChurchWazeUrl': buildClosingChurchWazeUrl(
			retreatData.closingChurchLatitude,
			retreatData.closingChurchLongitude,
		),
		'retreat.next_meeting_date': retreatData.nextMeetingDate || '',
	};
};

/**
 * Replaces all retreat variables in a message template with actual retreat data
 * Uses mock data if retreat is undefined or null
 */
export const replaceRetreatVariables = (
	message: string,
	retreat: RetreatData | null | undefined,
): string => {
	const retreatData = retreat || getMockRetreat();
	const retreatReplacements = buildRetreatReplacements(retreatData);

	let processedMessage = message;
	Object.entries(retreatReplacements).forEach(([key, value]) => {
		processedMessage = processedMessage.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
	});

	return processedMessage;
};

/**
 * Default mock community data used as a fallback when previewing community
 * templates without real data.
 */
const getMockCommunity = (): CommunityData => ({
	name: 'Comunidad Emaús Demo',
	parish: 'Parroquia San José',
	meetingTitle: 'Reunión mensual',
	meetingDate: '15/06/2026 19:00',
	attendanceLink: 'https://emaus.example/asistencia/123',
	requesterName: 'María García',
	requesterEmail: 'maria.garcia@example.com',
	requesterPhone: '555-111-2222',
	userEmail: 'usuario@example.com',
	acceptUrl: 'https://emaus.example/aceptar/abc',
});

const buildCommunityReplacements = (data: CommunityData): Record<string, string> => ({
	'community.name': data.name || '',
	'community.parish': data.parish || '',
	'community.meetingTitle': data.meetingTitle || '',
	'community.meetingDate': data.meetingDate || '',
	'community.attendanceLink': data.attendanceLink || '',
	'community.requesterName': data.requesterName || '',
	'community.requesterEmail': data.requesterEmail || '',
	'community.requesterPhone': data.requesterPhone || '',
	'community.userEmail': data.userEmail || '',
	'community.acceptUrl': data.acceptUrl || '',
});

/**
 * Replaces community-scoped variables in a message template. Falls back to
 * mock data when `community` is null/undefined so the UI preview shows
 * placeholder values.
 */
export const replaceCommunityVariables = (
	message: string,
	community: CommunityData | null | undefined,
): string => {
	const data = community || getMockCommunity();
	const replacements = buildCommunityReplacements(data);
	let out = message;
	for (const [k, v] of Object.entries(replacements)) {
		out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
	}
	return out;
};

/** True si el valor tiene al menos un dígito (evita imprimir "-" o vacíos). */
const hasDigits = (v?: string | null): v is string => !!v && /\d/.test(v);

/**
 * Arma una línea de teléfonos presente para un caminante/contacto.
 * Ej: "Cel: 555-1, Casa: 555-2". Devuelve '' si no hay ninguno.
 */
const formatPhones = (
	cell?: string,
	home?: string,
	work?: string,
): string => {
	const parts: string[] = [];
	if (hasDigits(cell)) parts.push(`Cel: ${cell}`);
	if (hasDigits(home)) parts.push(`Casa: ${home}`);
	if (hasDigits(work)) parts.push(`Trabajo: ${work}`);
	return parts.join(', ');
};

/**
 * Construye el bloque HTML del roster de caminantes (líneas separadas por
 * <br>). Cada caminante: nombre + teléfonos + ambos contactos de emergencia.
 */
const buildWalkersRoster = (walkers: TableWalkerData[]): string => {
	if (!walkers.length) return '';
	return walkers
		.map((w, i) => {
			const fullName = [w.firstName, w.lastName].filter(Boolean).join(' ').trim();
			const lines: string[] = [`${i + 1}. <strong>${fullName || 'Sin nombre'}</strong>`];
			const ownPhones = formatPhones(w.cellPhone, w.homePhone, w.workPhone);
			if (ownPhones) lines.push(`   Tel: ${ownPhones}`);
			const ec1Phones = formatPhones(
				w.emergencyContact1CellPhone,
				w.emergencyContact1HomePhone,
				w.emergencyContact1WorkPhone,
			);
			if (w.emergencyContact1Name || ec1Phones) {
				const rel = w.emergencyContact1Relation ? ` (${w.emergencyContact1Relation})` : '';
				lines.push(
					`   Emergencia 1: ${w.emergencyContact1Name || ''}${rel}${ec1Phones ? ` — ${ec1Phones}` : ''}`.trimEnd(),
				);
			}
			const ec2Phones = formatPhones(
				w.emergencyContact2CellPhone,
				w.emergencyContact2HomePhone,
				w.emergencyContact2WorkPhone,
			);
			if (w.emergencyContact2Name || ec2Phones) {
				const rel = w.emergencyContact2Relation ? ` (${w.emergencyContact2Relation})` : '';
				lines.push(
					`   Emergencia 2: ${w.emergencyContact2Name || ''}${rel}${ec2Phones ? ` — ${ec2Phones}` : ''}`.trimEnd(),
				);
			}
			return lines.join('<br>');
		})
		.join('<br><br>');
};

const buildTableReplacements = (tableData: TableData): Record<string, string> => {
	const walkers = tableData.walkers ?? [];
	return {
		'table.name': tableData.name || '',
		'table.liderName': tableData.liderName || '',
		'table.colider1Name': tableData.colider1Name || '',
		'table.colider2Name': tableData.colider2Name || '',
		'table.walkersCount': walkers.length.toString(),
		'table.walkersNames': walkers
			.map((w) => [w.firstName, w.lastName].filter(Boolean).join(' ').trim())
			.filter(Boolean)
			.join(', '),
		'table.walkersRoster': buildWalkersRoster(walkers),
	};
};

/**
 * Default mock table used for previews in the template editor.
 */
const getMockTable = (): TableData => ({
	name: 'Mesa 01',
	liderName: 'Juan Pérez',
	colider1Name: 'María López',
	colider2Name: '',
	walkers: [
		{
			firstName: 'Pedro',
			lastName: 'Ramírez',
			cellPhone: '555-100-2000',
			emergencyContact1Name: 'Ana Ramírez',
			emergencyContact1Relation: 'Esposa',
			emergencyContact1CellPhone: '555-100-2001',
			emergencyContact2Name: 'Luis Ramírez',
			emergencyContact2Relation: 'Hermano',
			emergencyContact2CellPhone: '555-100-2002',
		},
		{
			firstName: 'Carlos',
			lastName: 'Gómez',
			cellPhone: '555-300-4000',
			emergencyContact1Name: 'Rosa Gómez',
			emergencyContact1Relation: 'Madre',
			emergencyContact1CellPhone: '555-300-4001',
		},
	],
});

/**
 * Replaces table-scoped variables in a message template. Falls back to mock
 * data when `table` is null/undefined so the UI preview shows placeholders.
 */
export const replaceTableVariables = (
	message: string,
	table: TableData | null | undefined,
): string => {
	const data = table || getMockTable();
	const replacements = buildTableReplacements(data);
	let out = message;
	for (const [k, v] of Object.entries(replacements)) {
		out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
	}
	return out;
};

/**
 * Finds all known template variables in a message whose resolved value is
 * an empty string. Unlike replaceAllVariables, this function does NOT fall
 * back to mock data — if participant/retreat is null, all known variables
 * present in the message are reported as empty.
 *
 * Unknown placeholders (e.g. {custom_message}, {user.name}) are ignored.
 */
export const findEmptyVariables = (
	message: string,
	participant: ParticipantData | null | undefined,
	retreat: RetreatData | null | undefined,
	selectedContactKey?: string,
	community?: CommunityData | null,
	table?: TableData | null,
): string[] => {
	const participantReplacements = buildParticipantReplacements(
		participant ?? ({} as ParticipantData),
		selectedContactKey,
	);
	const retreatReplacements = buildRetreatReplacements(retreat ?? ({} as RetreatData));
	const communityReplacements = buildCommunityReplacements(community ?? ({} as CommunityData));
	// Las variables {table.*} son contextuales: solo se llenan vía el flujo de
	// briefing de mesa (que siempre pasa un TableData completo). Cuando NO hay
	// contexto de mesa no las incluimos en el chequeo de "vacías", para no
	// advertir `{table.name}`/`{table.walkersRoster}` con un consejo ("revisa los
	// datos del caminante o del retiro") que no aplica a este scope.
	const tableReplacements = table ? buildTableReplacements(table) : {};
	const combined: Record<string, string> = {
		...participantReplacements,
		...retreatReplacements,
		...communityReplacements,
		...tableReplacements,
	};

	// Extract all unique placeholders from the message.
	const placeholderRegex = /\{([^{}\s]+)\}/g;
	const found = new Set<string>();
	let match: RegExpExecArray | null;
	while ((match = placeholderRegex.exec(message)) !== null) {
		found.add(match[1]);
	}

	const empty: string[] = [];
	for (const key of found) {
		if (key in combined && combined[key] === '') {
			empty.push(key);
		}
	}
	return empty.sort();
};

/**
 * Replaces all variables (participant and retreat) in a message template
 * Uses mock data if participant or retreat is undefined or null
 */
export const replaceAllVariables = (
	message: string,
	participant: ParticipantData | null | undefined,
	retreat: RetreatData | null | undefined,
	selectedContactKey?: string,
	community?: CommunityData | null,
	table?: TableData | null,
): string => {
	let processedMessage = message;

	// Replace participant variables
	processedMessage = replaceParticipantVariables(processedMessage, participant, selectedContactKey);

	// Replace retreat variables
	processedMessage = replaceRetreatVariables(processedMessage, retreat);

	// Replace community variables when provided. We do NOT fall back to mock
	// data here because most retreat-scoped callers don't deal with community
	// context — the {community.*} placeholders simply stay unresolved.
	if (community !== undefined) {
		processedMessage = replaceCommunityVariables(processedMessage, community);
	}

	// Replace table variables when provided. Same rationale as community: most
	// callers don't have a table context, so {table.*} stays unresolved unless
	// a TableData is explicitly passed (table briefing flow).
	if (table !== undefined) {
		processedMessage = replaceTableVariables(processedMessage, table);
	}

	return processedMessage;
};

/**
 * Converts HTML content to email-compatible format with inline CSS and JavaScript support
 */
export const convertHtmlToEmail = (
	html: string,
	options: {
		format?: 'basic' | 'enhanced' | 'outlook';
		skipTemplate?: boolean;
	} = {},
): string => {
	const { format = 'enhanced', skipTemplate = false } = options;

	// Create email template based on format
	const emailTemplate = createEmailTemplate(html, {
		format,
		skipTemplate,
		//javascript: includeJavaScript ? javascript : undefined
	});

	return emailTemplate;
};

/**
 * Creates email template with proper structure and fallbacks
 */
const createEmailTemplate = (
	content: string,
	options: {
		format: 'basic' | 'enhanced' | 'outlook';
		javascript?: string;
		skipTemplate?: boolean;
	},
): string => {
	const { format, javascript, skipTemplate = false } = options;

	// Check if content already contains template wrapper
	const hasTemplateWrapper =
		content.includes('class="email-container"') ||
		content.includes('email-header') ||
		content.includes('Generated by Email System');

	// If content already has template or skipTemplate is true, return content as-is
	if (skipTemplate || hasTemplateWrapper) {
		return content;
	}

	// Fallback content for non-HTML email clients
	const textFallback = `
    <!-- Fallback content for text-only email clients -->
    <div style="display:none;font-size:0;color:#ffffff;line-height:0;mso-hide:all">
      ${content
				.replace(/<[^>]*>/g, ' ')
				.replace(/\s+/g, ' ')
				.trim()}
    </div>
  `;

	const baseStyles = `
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      -webkit-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
    }
    blockquote {
      border-left: 3px solid hsl(var(--border));
      padding-left: 12px;
      margin: 8px 0;
      color: hsl(var(--muted-foreground));
      background-color: hsl(var(--muted) / 0.5);
    }
    .email-container {
      max-width: 650px;
      margin: 40px auto;
      background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%);
      border-radius: 20px;
      box-shadow:
        0 20px 40px rgba(0,0,0,0.1),
        0 0 0 1px rgba(255,255,255,0.1),
        inset 0 1px 0 rgba(255,255,255,0.6);
      overflow: hidden;
    }
    .email-header {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: white;
      text-align: center;
      padding: 35px 30px;
      position: relative;
      overflow: hidden;
    }
    .email-header::before {
      content: '';
      position: absolute;
      top: -50%;
      right: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
      animation: shimmer 3s infinite;
    }
    .email-body {
      padding: 40px 0px;
      background: white;
      position: relative;
    }
    .email-body::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #4f46e5, #7c3aed, #4f46e5);
      background-size: 200% 100%;
      animation: gradient 3s ease infinite;
    }
    .message-box {
      background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%);
      border: 2px solid #e2e8f0;
      border-radius: 16px;
      padding: 30px;
      margin: 25px 0;
      position: relative;
      box-shadow:
        0 10px 25px rgba(0,0,0,0.05),
        inset 0 1px 0 rgba(255,255,255,0.8);
    }
    .message-box::before {
      content: '';
      position: absolute;
      top: -2px;
      left: -2px;
      right: -2px;
      bottom: -2px;
      background: linear-gradient(45deg, #4f46e5, #7c3aed, #06b6d4, #4f46e5);
      border-radius: 16px;
      z-index: -1;
      opacity: 0.7;
    }
    .email-footer {
      background: linear-gradient(145deg, #f8fafc 0%, #e2e8f0 100%);
      color: #64748b;
      font-size: 13px;
      text-align: center;
      padding: 25px 30px;
      border-top: 1px solid rgba(226, 232, 240, 0.5);
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 20px 0;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    }
    td, th {
      border: 1px solid #e2e8f0;
      padding: 12px 15px;
      text-align: left;
    }
    th {
      background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
      color: white;
      font-weight: 600;
    }
    td {
      background-color: #ffffff;
    }
    tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    @keyframes shimmer {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes gradient {
      0% { background-position: 0% 50%; }
      50% { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    p {
        margin: 0 0 16px 0;
    }
  `;

	const outlookStyles = `
    <!--[if mso]>
    <style>
      table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      .email-container { width: 600px; }
      .email-body { font-family: Arial, sans-serif; }
    </style>
    <![endif]-->
  `;

	const enhancedStyles = `
    <style>
      ${baseStyles}
      @media only screen and (max-width: 600px) {
        .email-container {
          width: 100% !important;
          padding: 20px !important;
          margin: 0 !important;
        }
        body {
          padding: 10px !important;
        }
        table {
          width: 100% !important;
        }
        img {
          max-width: 100% !important;
          height: auto !important;
        }
      }
      @media screen and (max-device-width: 480px) {
        .email-container {
          padding: 15px !important;
        }
      }
    </style>
  `;

	const javascriptContent = javascript
		? `
    <script>
      // Simple JavaScript for email clients that support it
      ${javascript}

      // Fallback for email clients that don't support JS
      document.addEventListener('DOMContentLoaded', function() {
        if (window.location.href.indexOf('no-js=true') > -1) {
          document.body.innerHTML = '<div style="padding: 20px; font-family: Arial, sans-serif;">' +
            '<h2>Email View</h2><p>This email contains interactive elements that require JavaScript support.</p>' +
            '<p>Please view this email in a modern email client or web browser.</p></div>';
        }
      });
    </script>
  `
		: '';

	// Client compatibility note
	const compatibilityNote = `
    <div style="font-size: 11px; color: #999; margin-top: 20px; padding: 10px; background: #f9f9f9; border-left: 3px solid #ddd;">
      <strong>Nota de compatibilidad:</strong> Este email está optimizado para ${format === 'outlook' ? 'Outlook' : format === 'basic' ? 'clientes básicos' : 'clientes modernos'}.
      Si no se ve correctamente, por favor abre este email en un navegador web.
    </div>
  `;

	switch (format) {
		case 'basic':
			return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Email Message</title>
          <style>
            ${baseStyles}
          </style>
        </head>
        <body>
          ${textFallback}
          <div class="email-container">
            ${
							skipTemplate
								? ''
								: `
            <div class="email-header">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1); position: relative; z-index: 1;">
                Mensaje de Emaús
              </h1>
              <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; position: relative; z-index: 1;">
                Mensaje personalizado para ti
              </p>
            </div>
            `
						}
            <div class="email-body">
              <div class="message-box">
                ${content}
              </div>
            </div>
            <div class="email-footer">
              Generated by Email System
            </div>
            ${compatibilityNote}
          </div>
          ${javascriptContent}
        </body>
        </html>
      `;

		case 'enhanced':
			return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Email Message</title>
          ${enhancedStyles}
        </head>
        <body>
          ${textFallback}
          <div class="email-container">
            ${
							skipTemplate
								? ''
								: `
            <div class="email-header">
              <h1 style="margin: 0; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1); position: relative; z-index: 1;">
                Mensaje de Emaús
              </h1>
              <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; position: relative; z-index: 1;">
                Mensaje personalizado para ti
              </p>
            </div>
            `
						}
            <div class="email-body">
              <div class="message-box">
                ${content}
              </div>
            </div>
            <div class="email-footer">
              Generated by Email System
            </div>
            ${compatibilityNote}
          </div>
          ${javascriptContent}
        </body>
        </html>
      `;

		case 'outlook':
			return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Email Message</title>
          ${outlookStyles}
          <style>
            ${baseStyles}
          </style>
        </head>
        <body>
          ${textFallback}
          <table class="email-container" align="center" border="0" cellpadding="0" cellspacing="0" width="600">
            ${
							skipTemplate
								? ''
								: `
            <tr>
              <td class="email-header" style="background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: white; text-align: center; padding: 35px 30px; position: relative;">
                <h1 style="margin: 0; font-size: 28px; font-weight: 700; text-shadow: 0 2px 4px rgba(0,0,0,0.1); position: relative; z-index: 1;">
                  Mensaje de Emaús
                </h1>
                <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; position: relative; z-index: 1;">
                  Mensaje personalizado para ti
                </p>
              </td>
            </tr>
            `
						}
            <tr>
              <td class="email-body">
                <div class="message-box">
                  ${content}
                </div>
                ${compatibilityNote}
              </td>
            </tr>
            <tr>
              <td class="email-footer">
                Generated by Email System
              </td>
            </tr>
          </table>
          ${javascriptContent}
        </body>
        </html>
      `;

		default:
			return content;
	}
};

/**
 * Detects email client and suggests appropriate format (server-safe version)
 */
export const detectEmailClient = (): string => {
	// Server-safe version - always return enhanced as default
	// In a real implementation, this could be enhanced with email domain detection
	return 'enhanced';
};
