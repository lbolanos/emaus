import { z } from 'zod';
import { normalizeEmail } from './text';

// Base UUID schema for reuse
const idSchema = z.string().uuid();

// Correos capturados en formularios: el autocompletado del celular pega espacios
// y caracteres invisibles que hacen fallar `.email()` con el correo viéndose
// correcto en pantalla. Se sanean antes de validar y se persisten ya limpios.
const requiredEmailSchema = z.preprocess(
	(val) => (typeof val === 'string' ? normalizeEmail(val) : val),
	z.string().min(1, 'Email is required').email(),
);
const optionalEmailSchema = z.preprocess((val) => {
	if (typeof val === 'string') {
		const normalized = normalizeEmail(val);
		return normalized === '' ? undefined : normalized;
	}
	return val === null ? undefined : val;
}, z.string().email({ message: 'Invalid email address' }).optional());

// Bed Schema
export const bedSchema = z.object({
	id: idSchema.optional(),
	roomNumber: z.string(),
	bedNumber: z.string(),
	floor: z.number().int().optional(),
	type: z.enum(['normal', 'litera_abajo', 'litera_arriba', 'colchon']),
	defaultUsage: z.enum(['caminante', 'servidor']),
	floorLabel: z.string().nullable().optional(),
	houseId: idSchema.optional(),
});
export type Bed = z.infer<typeof bedSchema>;

// House Schema
export const houseSchema = z.object({
	id: idSchema,
	name: z.string(),
	address1: z.string(),
	address2: z.string().optional(),
	city: z.string(),
	state: z.string(),
	zipCode: z.string(),
	country: z.string(),
	capacity: z.number().int().positive(),
	latitude: z.number().optional(),
	longitude: z.number().optional(),
	googleMapsUrl: z.string().url().optional(),
	notes: z.string().optional(),
	timezone: z.string().min(1).default('America/Mexico_City'),
	floorLabels: z.record(z.string(), z.string()).optional(),
	beds: z.array(bedSchema).optional(),
});
export type House = z.infer<typeof houseSchema>;

// Room Schema
export const roomSchema = z.object({
	id: idSchema,
	roomNumber: z.string(),
	capacity: z.number().int().positive(),
	houseId: idSchema,
});
export type Room = z.infer<typeof roomSchema>;

// Flyer layout (v2): the body of the flyer is a set of blocks laid out in three
// managed cells. Header, banner and footer are fixed chrome, not blocks.
export const flyerBlockIdSchema = z.enum([
	'intro',
	'startTime',
	'endTime',
	'location',
	'contact',
	'payment',
	'whatToBring',
	'registrationQr',
]);
export type FlyerBlockId = z.infer<typeof flyerBlockIdSchema>;

export const flyerSlotSchema = z.enum(['left', 'right', 'wide']);
export type FlyerSlot = z.infer<typeof flyerSlotSchema>;

export const flyerBlockLayoutSchema = z.object({
	id: flyerBlockIdSchema,
	slot: flyerSlotSchema,
	/** Position within its own slot. */
	order: z.number().int().min(0),
	visible: z.boolean().default(true),
});
export type FlyerBlockLayout = z.infer<typeof flyerBlockLayoutSchema>;

/**
 * A flyer image: an app-bundled preset (`/jesus2.png`), an https URL (S3), or an
 * inline data URI (the fallback when S3 is not configured).
 *
 * SECURITY: these end up in `background-image: url(...)` and `<img :src>`, and the
 * field can be written straight through PUT /retreats/:id, skipping the upload
 * endpoint's checks. Restricting the scheme keeps `javascript:` and friends out;
 * the length cap bounds the inline case (512KB binary ≈ 700KB of base64).
 */
const flyerImageUrlSchema = z.preprocess(
	// The client clears an image by sending '', which a formatted .optional() would
	// reject with a 400 — a bug this repo has already paid for more than once.
	(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
	z
		.string()
		.max(1_000_000, { message: 'La imagen es demasiado grande' })
		.refine(
			(value) =>
				/^(\/[\w./-]*|https:\/\/[^\s"']+|data:image\/[\w+.-]+;base64,[\w+/=]+)$/.test(value),
			{ message: 'La imagen debe ser una ruta de la app, una URL https o una imagen en base64' },
		)
		.optional(),
);

/** Image URLs. Empty/absent means "use the built-in preset". */
export const flyerImagesSchema = z.object({
	bodyBackground: flyerImageUrlSchema,
	headerBackground: flyerImageUrlSchema,
	footerBackground: flyerImageUrlSchema,
	logo: flyerImageUrlSchema,
});
export type FlyerImages = z.infer<typeof flyerImagesSchema>;

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Debe ser un color en formato #rrggbb');

/**
 * How a block is painted. Every field is optional and falls back to the theme, and
 * then to the block's built-in default.
 *
 * An absent `backgroundColor` means no box at all — the text sits straight on the
 * flyer's image, which is the poster look the flyer defaults to. The "light veil" and
 * "dark veil" shortcuts in the editor are just presets writing white/black here, so
 * there is no separate mode to keep in sync.
 */
export const flyerBlockStyleSchema = z.object({
	backgroundColor: hexColorSchema.optional(),
	backgroundOpacity: z.number().int().min(0).max(100).optional(),
	textColor: hexColorSchema.optional(),
	headingColor: hexColorSchema.optional(),
	textShadow: z.boolean().optional(),
});
export type FlyerBlockStyle = z.infer<typeof flyerBlockStyleSchema>;

/** The same knobs applied to every block, plus the wash over the background image. */
export const flyerThemeSchema = flyerBlockStyleSchema.extend({
	scrim: z.enum(['none', 'dark', 'light']).optional(),
	scrimOpacity: z.number().int().min(0).max(100).optional(),
});
export type FlyerTheme = z.infer<typeof flyerThemeSchema>;

export const FLYER_LAYOUT_VERSION = 2;

/** Upper bound for the flyer's free-text overrides; they are headings and short lines. */
const FLYER_TEXT_MAX = 2000;

/** Which slot an uploaded flyer image is meant for; drives the resize bounds. */
export const flyerAssetKindSchema = z.enum([
	'bodyBackground',
	'headerBackground',
	'footerBackground',
	'logo',
]);
export type FlyerAssetKind = z.infer<typeof flyerAssetKindSchema>;

export const uploadFlyerAssetSchema = z.object({
	body: z.object({
		kind: flyerAssetKindSchema,
		// Same bound as the memory photos: ~4MB of string ≈ 3MB binary, leaving slack
		// over the imageService 2MB limit. Without it, an unvalidated string could be
		// stored and later served as if it were an image.
		dataUrl: z
			.string()
			.min(1)
			.max(4_000_000, { message: 'La imagen es demasiado grande' })
			.refine((d) => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(d), {
				message: 'Debe ser una imagen (data URI base64)',
			}),
	}),
});
export type UploadFlyerAsset = z.infer<typeof uploadFlyerAssetSchema>['body'];

// Flyer Options Schema
// NOTE: z.object() silently drops undeclared keys, so any field that must survive
// PUT /retreats/:id has to be declared here.
export const flyerOptionsSchema = z.object({
	/** 1 = legacy (no `blocks`); 2 = block layout. Resolved on read, never migrated in place. */
	layoutVersion: z.number().int().min(1).max(FLYER_LAYOUT_VERSION).optional(),
	// Capped: there are only 8 block ids, and the canvas mounts a component per entry,
	// so an unbounded array would let one coordinator freeze the flyer for everyone else.
	blocks: z.array(flyerBlockLayoutSchema).max(32).optional(),
	images: flyerImagesSchema.optional(),
	/** Palette applied to every block, and the wash over the background image. */
	theme: flyerThemeSchema.optional(),
	/** Per-block overrides on top of the theme. Zod validates the keys against the enum. */
	blockStyles: z.record(flyerBlockIdSchema, flyerBlockStyleSchema).optional(),

	titleOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	subtitleOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	cssStyles: z.record(z.string().max(FLYER_TEXT_MAX)).optional(),
	// Legacy, read-only: superseded by showQrCodesLocation/Registration below, and by
	// blocks[].visible in v2. Kept so v1 rows keep parsing.
	showQrCodes: z.boolean().default(true).optional(),
	showQrCodesLocation: z.boolean().default(true),
	showQrCodesRegistration: z.boolean().default(true),
	/** Registration form, not the flyer design. Edited in the retreat modal. */
	showPickupInfo: z.boolean().default(true),

	// Declared but unused by the views; kept so existing rows keep parsing.
	catholicRetreat: z.string().max(FLYER_TEXT_MAX).optional(),
	emausFor: z.string().max(FLYER_TEXT_MAX).optional(),
	weekendOfHope: z.string().max(FLYER_TEXT_MAX).optional(),

	catholicRetreatOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	emausForOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	weekendOfHopeOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	// hopeOverride wins over titleOverride, and weekendOfHopeOverride over subtitleOverride.
	hopeOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	hopeQuoteOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	encounterDescriptionOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	dareToLiveItOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	arrivalTimeNoteOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	whatToBringOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	registerOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	scanToRegisterOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	goToRegistrationOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	limitedCapacityOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	dontMissItOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	reservationNoteOverride: z.string().max(FLYER_TEXT_MAX).optional(),
	comeOverride: z.string().max(FLYER_TEXT_MAX).optional(),
});
export type FlyerOptions = z.infer<typeof flyerOptionsSchema>;

/**
 * Reusable flyer designs. `personal` is visible only to its author; `community` to
 * every active admin of that community. A retreat has no link to a community, so the
 * scope is chosen when saving, never derived.
 */
export const flyerTemplateScopeSchema = z.enum(['personal', 'community']);
export type FlyerTemplateScope = z.infer<typeof flyerTemplateScopeSchema>;

export const flyerTemplateSchema = z.object({
	id: idSchema,
	name: z.string().trim().min(1, 'El nombre es obligatorio').max(255),
	scope: flyerTemplateScopeSchema,
	communityId: idSchema.nullable().optional(),
	createdBy: idSchema.nullable().optional(),
	layout: flyerOptionsSchema,
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});
export type FlyerTemplate = z.infer<typeof flyerTemplateSchema>;

export const createFlyerTemplateSchema = z.object({
	// createdAt/updatedAt/createdBy are set by the server; sending them back from a
	// read DTO is the usual source of surprise 400s.
	body: flyerTemplateSchema
		.omit({ id: true, createdBy: true, createdAt: true, updatedAt: true })
		.superRefine((data, ctx) => {
			if (data.scope === 'community' && !data.communityId) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['communityId'],
					message: 'Elige la comunidad con la que se comparte',
				});
			}
		}),
});
export type CreateFlyerTemplate = z.infer<typeof createFlyerTemplateSchema>['body'];

/** Scope and community are immutable after creation: re-scoping would change who can see it. */
export const updateFlyerTemplateSchema = z.object({
	body: flyerTemplateSchema
		.omit({
			id: true,
			scope: true,
			communityId: true,
			createdBy: true,
			createdAt: true,
			updatedAt: true,
		})
		.partial(),
	params: z.object({ id: idSchema }),
});
export type UpdateFlyerTemplate = z.infer<typeof updateFlyerTemplateSchema>['body'];

// Retreat Memory Photo (read) — `url` may be an S3 https URL or a base64 data URI
// (disk/base64 storage), so it is a plain string, not a strict URL.
export const retreatMemoryPhotoSchema = z.object({
	id: idSchema,
	retreatId: idSchema,
	url: z.string(),
	isPrimary: z.boolean(),
	sortOrder: z.number().int(),
	createdAt: z.coerce.date(),
});
export type RetreatMemoryPhoto = z.infer<typeof retreatMemoryPhotoSchema>;

// Retreat Memory Song (read)
export const retreatMemorySongSchema = z.object({
	id: idSchema,
	retreatId: idSchema,
	url: z.string().url(),
	title: z.string().nullable().optional(),
	// 'manual' = agregada en el form de Recuerdos; 'mam' = importada del minuto a minuto.
	source: z.enum(['manual', 'mam']).default('manual'),
	isPrimary: z.boolean(),
	sortOrder: z.number().int(),
	createdAt: z.coerce.date(),
});
export type RetreatMemorySong = z.infer<typeof retreatMemorySongSchema>;

// Write schemas — only the fields the client actually sends. Derived/read-only
// fields (id, isPrimary, sortOrder, createdAt) are assigned server-side and must
// NOT be required in the request body (recurring 400 bug otherwise).
export const createRetreatMemoryPhotoSchema = z.object({
	// SECURITY: debe ser un data-URI de imagen y acotado en tamaño. Sin esto, en el
	// modo de almacenamiento por defecto (base64) se guardaba cualquier string sin
	// validar (DoS de almacenamiento / contenido no-imagen servido al render).
	// ~4MB de string ≈ 3MB binario, holgura sobre el límite de 2MB del imageService.
	photoData: z
		.string()
		.min(1)
		.max(4_000_000, { message: 'La imagen es demasiado grande' })
		.refine((d) => /^data:image\/(png|jpe?g|webp|gif);base64,/i.test(d), {
			message: 'Debe ser una imagen (data URI base64)',
		}),
});
export type CreateRetreatMemoryPhoto = z.infer<typeof createRetreatMemoryPhotoSchema>;

// SECURITY: `z.string().url()` acepta `javascript:`/`data:`; esas URLs se
// renderizan luego en `:href` (RetreatMemoryCard) → XSS almacenado. Restringir a
// http(s) para todo lo que termine en un enlace clickeable.
export const httpUrlSchema = z
	.string()
	.url()
	.refine((u) => /^https?:\/\//i.test(u), {
		message: 'La URL debe iniciar con http:// o https://',
	});

export const createRetreatMemorySongSchema = z.object({
	url: httpUrlSchema,
	title: z.string().trim().max(200).optional(),
});
export type CreateRetreatMemorySong = z.infer<typeof createRetreatMemorySongSchema>;

export const updateRetreatMemorySongSchema = createRetreatMemorySongSchema.partial();
export type UpdateRetreatMemorySong = z.infer<typeof updateRetreatMemorySongSchema>;

// Hora de llegada en formato HH:MM (24h). Los campos son opcionales: el cliente
// suele enviar '' cuando no se captura, así que normalizamos ''/null a undefined
// antes de validar la regex (evita el falso "Validation error" al crear el retiro).
const arrivalTimeSchema = z.preprocess(
	(v) => (v === '' || v === null ? undefined : v),
	z
		.string()
		.regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Debe tener formato HH:MM (24h)')
		.optional(),
);

// Retreat Schema
export const retreatSchema = z.object({
	id: idSchema,
	// .trim() limpia espacios al borde en cada create/update (evita nombres como
	// "… | Mexico City " que rompen la confirmación por nombre y confunden al deduplicar).
	parish: z.string().trim(),
	startDate: z.coerce.date(),
	endDate: z.coerce.date(),
	houseId: idSchema,
	openingNotes: z.string().optional(),
	closingNotes: z.string().optional(),
	thingsToBringNotes: z.string().optional(),
	contactPhones: z.string().optional(),
	cost: z.string().optional(),
	paymentInfo: z.string().optional(),
	paymentMethods: z.string().optional(),
	// Cobro del retiro para servidores + valor de una comida (paz y salvo v2).
	// El cobro del caminante es el campo `cost` existente.
	serverFeeAmount: z.number().nonnegative().nullable().optional(),
	mealCost: z.number().nonnegative().nullable().optional(),
	max_walkers: z.number().int().positive().optional(),
	max_servers: z.number().int().positive().optional(),
	retreat_type: z.enum(['men', 'women', 'couples', 'effeta']).optional(),
	retreat_number_version: z.string().optional(),
	// El slug va dentro de la URL pública del retiro y acaba interpolado en el
	// HTML del preview OG. Acotarlo aquí evita que un valor con comillas o
	// etiquetas llegue a ese HTML. Los 7 retiros existentes ya lo cumplen.
	// El preprocess de '' es obligatorio: el formulario manda cadena vacía
	// cuando el campo está en blanco, y `.regex().optional()` la rechazaría con
	// un 400 al crear el retiro (bug recurrente de este repo).
	slug: z.preprocess(
		(v) => (v === '' || v === null ? undefined : v),
		z
			.string()
			.regex(/^[a-z0-9-]+$/, 'El enlace solo admite minúsculas, números y guiones')
			.max(120)
			.optional(),
	),
	// Set when the parish runs walker registration on its own site. This value
	// is redirected to and encoded into the flyer QR, so it must be a real
	// http(s) address: `.url()` alone would accept `javascript:` and turn the
	// redirect into an XSS vector. '' maps to null so the field can be cleared;
	// undefined leaves the stored value untouched.
	externalRegistrationUrl: z.preprocess(
		(v) => (v === '' ? null : v),
		z
			.string()
			.url()
			.max(500)
			.refine(
				(v) => /^https?:\/\//i.test(v),
				'El enlace debe empezar con http:// o https://',
			)
			.nullable()
			.optional(),
	),
	isPublic: z.boolean().default(false),
	roleInvitationEnabled: z.boolean().default(true),
	walkerArrivalTime: arrivalTimeSchema,
	serverArrivalTimeFriday: arrivalTimeSchema,
	flyer_options: flyerOptionsSchema.optional(),
	memoryPhotoUrl: z.string().url().optional().or(z.literal('')),
	musicPlaylistUrl: z.string().url().optional().or(z.literal('')),
	// Read-only galleries (loaded via relations). Derived primary fields above
	// (memoryPhotoUrl/musicPlaylistUrl) mirror the item marked isPrimary.
	memoryPhotos: z.array(retreatMemoryPhotoSchema).optional(),
	memorySongs: z.array(retreatMemorySongSchema).optional(),
	notifyParticipant: z.boolean().default(true),
	notifyInviter: z.boolean().default(true),
	notifyPalanqueros: z.array(z.number().int().min(1).max(3)).transform(arr => [...new Set(arr)]).optional(),
	createdBy: z.string().uuid().optional(),
	santisimoEnabled: z.boolean().default(false).optional(),
	timezone: z.string().nullable().optional(),
	closingChurchName: z.string().nullable().optional(),
	closingChurchAddress: z.string().nullable().optional(),
	closingChurchLatitude: z.number().nullable().optional(),
	closingChurchLongitude: z.number().nullable().optional(),
});
export type Retreat = z.infer<typeof retreatSchema>;

// Table Schema
export const tableSchema = z.object({
	id: idSchema,
	name: z.string(),
	retreatId: idSchema,
});
export type Table = z.infer<typeof tableSchema>;

// Responsability Schema
export enum ResponsabilityType {
	LIDER = 'lider',
	COLIDER = 'colider',
	SERVIDOR = 'servidor',
	MUSICA = 'musica',
	ORACION = 'oracion',
	LIMPIEZA = 'limpieza',
	COCINA = 'cocina',
	CHARLISTA = 'charlista',
	OTRO = 'otro',
}

export const responsabilitySchema = z.object({
	id: idSchema,
	name: z.string(),
	description: z.string().optional(),
	responsabilityType: z.nativeEnum(ResponsabilityType).default(ResponsabilityType.OTRO),
	isLeadership: z.boolean().default(false),
	priority: z.number().int().min(0).default(0),
	isActive: z.boolean().default(true),
	retreatId: idSchema,
	participant: z.lazy(() => participantSchema).optional(),
	participantId: idSchema.optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});
export type Responsability = z.infer<typeof responsabilitySchema>;

// RetreatBed Schema
export const retreatBedSchema = z.object({
	id: idSchema,
	roomNumber: z.string(),
	bedNumber: z.string(),
	floor: z.number().int().optional(),
	type: z.enum(['normal', 'litera_abajo', 'litera_arriba', 'colchon']),
	defaultUsage: z.enum(['caminante', 'servidor']),
	floorLabel: z.string().nullable().optional(),
	isActive: z.boolean().default(true),
	retreatId: idSchema,
	participantId: idSchema.nullable().optional(),
	participant: z.any().nullable().optional(), // Use any to avoid circular reference
});
export type RetreatBed = z.infer<typeof retreatBedSchema>;

// TableMesa Schema
export const tableMesaSchema = z.object({
	id: idSchema,
	name: z.string(),
	retreatId: idSchema,
	lider: z.any().nullable().optional(),
	colider1: z.any().nullable().optional(),
	colider2: z.any().nullable().optional(),
	walkers: z.array(z.any()).optional(),
});
export type TableMesa = z.infer<typeof tableMesaSchema>;

// Tag Schema
export const tagSchema = z.object({
	id: idSchema,
	name: z.string().min(1).max(100),
	color: z
		.string()
		.regex(/^#[0-9A-F]{6}$/i)
		.optional(),
	description: z.string().optional(),
	retreatId: idSchema,
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});
export type Tag = z.infer<typeof tagSchema>;

// ParticipantTag Schema
export const participantTagSchema = z.object({
	id: idSchema,
	participantId: idSchema,
	tagId: idSchema,
	assignedAt: z.coerce.date(),
	tag: tagSchema.optional(),
});
export type ParticipantTag = z.infer<typeof participantTagSchema>;

// Participant Schema
export const participantSchema = z.object({
	id: idSchema,
	id_on_retreat: z.number().int().positive().optional(),
	type: z.enum(['walker', 'server', 'waiting', 'partial_server']),
	firstName: z.string().min(1, 'First name is required'),
	lastName: z.string().min(1, 'Last name is required'),
	nickname: z.string().min(1, 'Nickname is required'),
	birthDate: z.coerce.date(),
	registrationDate: z.coerce.date(),
	lastUpdatedDate: z.coerce.date(),
	isCancelled: z.boolean().optional(),
	// Confirmación de asistencia per-retiro (la marca el líder/coordinador).
	attendanceConfirmation: z.enum(['pending', 'confirmed', 'declined']).optional(),
	isScholarship: z.boolean().optional(),
	scholarshipAmount: z.preprocess(
		(val) => (val === '' || val === null || val === undefined ? null : Number(val)),
		z.number().nonnegative().nullable().optional(),
	),
	// Comidas per-retiro (paz y salvo v2): angelito → nº comidas; servidor → comida del viernes.
	mealCount: z.preprocess(
		(val) => (val === '' || val === null || val === undefined ? null : Number(val)),
		z.number().int().nonnegative().nullable().optional(),
	),
	takesFridayMeal: z.preprocess(
		(val) => (val === null ? undefined : val),
		z.boolean().nullable().optional(),
	),
	// Read-only: desglose de cargos y deuda total (computados en el backend).
	totalDebt: z.number().optional(),
	chargeBreakdown: z.any().optional(),
	palancasCoordinator: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().optional(),
	),
	palancasRequested: z.preprocess(
		(val) => (val === null ? undefined : val),
		z.boolean().optional(),
	),
	palancasReceived: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().optional(),
	),
	palancasNotes: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().optional(),
	),
	requestsSingleRoom: z.preprocess(
		(val) => (val === null ? undefined : val),
		z.boolean().optional(),
	),
	notes: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().optional(),
	),
	maritalStatus: z.enum(['S', 'C', 'D', 'V', 'O']),
	street: z.string().min(1, 'Street is required'),
	houseNumber: z.string().min(1, 'House number is required'),
	postalCode: z.string().min(1, 'Postal code is required'),
	neighborhood: z.string().min(1, 'Neighborhood is required'),
	city: z.string().min(1, 'City is required'),
	state: z.string().min(1, 'State is required'),
	country: z.string().min(1, 'Country is required'),
	parish: z.string().optional(),
	homePhone: z.string().optional(),
	workPhone: z.string().optional(),
	cellPhone: z.string(),
	email: requiredEmailSchema,
	occupation: z.string().min(1, 'Occupation is required'),
	snores: z.boolean(),
	hasMedication: z.boolean(),
	medicationDetails: z.string().optional(),
	medicationSchedule: z.string().optional(),
	hasDietaryRestrictions: z.boolean(),
	dietaryRestrictionsDetails: z.string().optional(),
	disabilitySupport: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().optional(),
	),
	sacraments: z.array(z.enum(['baptism', 'communion', 'confirmation', 'marriage', 'none'])),
	emergencyContact1Name: z.string().min(1, 'Emergency contact 1 name is required'),
	emergencyContact1Relation: z.string().min(1, 'Emergency contact 1 relation is required'),
	emergencyContact1HomePhone: z.string().optional(),
	emergencyContact1WorkPhone: z.string().optional(),
	emergencyContact1CellPhone: z.string().min(1, 'Emergency contact 1 cell phone is required'),
	emergencyContact1Email: optionalEmailSchema,
	emergencyContact2Name: z.string().optional(),
	emergencyContact2Relation: z.string().optional(),
	emergencyContact2HomePhone: z.string().optional(),
	emergencyContact2WorkPhone: z.string().optional(),
	emergencyContact2CellPhone: z.string().optional(),
	emergencyContact2Email: optionalEmailSchema,
	tshirtSize: z.preprocess(
		(val) => (val === '' || val === null ? undefined : val),
		z.string().optional(),
	),
	needsWhiteShirt: z.enum(['S', 'M', 'G', 'X', '2', 'null']).nullable().optional(),
	needsBlueShirt: z.enum(['S', 'M', 'G', 'X', '2', 'null']).nullable().optional(),
	needsJacket: z.enum(['S', 'M', 'G', 'X', '2', 'null']).nullable().optional(),
	shirtSizes: z
		.array(
			z.object({
				shirtTypeId: z.string(),
				size: z.string().min(1),
			}),
		)
		.optional(),
	invitedBy: z.string().optional(),
	isInvitedByEmausMember: z.boolean().nullable().optional(),
	inviterHomePhone: z.string().optional(),
	inviterWorkPhone: z.string().optional(),
	inviterCellPhone: z.string().optional(),
	inviterEmail: z.string().optional(),
	family_friend_color: z.string().nullable().optional(),
	pickupLocation: z.string().optional(),
	arrivesOnOwn: z.preprocess((val) => (val === null ? undefined : val), z.boolean().optional()),
	retreatId: idSchema.nullable().optional(),
	tableId: idSchema.nullable().optional(),
	tableMesa: tableMesaSchema.nullable().optional(),
	retreatBed: retreatBedSchema.nullable().optional(),
	tags: z.array(participantTagSchema).optional(),
	acceptedPrivacyNotice: z.boolean().optional(),
	acceptedPrivacyNoticeAt: z.coerce.date().nullable().optional(),
});
export type Participant = z.infer<typeof participantSchema>;

// --- Shirt Report (servidores + angelitos) ---

export const shirtReportShirtSchema = z.object({
	shirtTypeId: z.string(),
	shirtTypeName: z.string(),
	color: z.string().nullable(),
	sortOrder: z.number(),
	size: z.string(),
});
export type ShirtReportShirt = z.infer<typeof shirtReportShirtSchema>;

export const shirtReportParticipantSchema = z.object({
	participantId: z.string(),
	firstName: z.string(),
	lastName: z.string(),
	idOnRetreat: z.number().nullable(),
	type: z.enum(['server', 'partial_server']),
	shirts: z.array(shirtReportShirtSchema),
});
export type ShirtReportParticipant = z.infer<typeof shirtReportParticipantSchema>;

export const shirtReportShirtTypeSchema = z.object({
	id: z.string(),
	name: z.string(),
	color: z.string().nullable(),
	sortOrder: z.number(),
});
export type ShirtReportShirtType = z.infer<typeof shirtReportShirtTypeSchema>;

export const shirtReportResponseSchema = z.object({
	shirtTypes: z.array(shirtReportShirtTypeSchema),
	participants: z.array(shirtReportParticipantSchema),
});
export type ShirtReportResponse = z.infer<typeof shirtReportResponseSchema>;

// Remove duplicate declaration - already defined above

// --- API Request Schemas ---

// POST /participants/new
// Emergency contacts are required only for walkers; the controller enforces this per-type.
// Here we relax them so server/partial_server registrations pass route-level validation.
export const createParticipantSchema = z.object({
	body: participantSchema
		.omit({ id: true, lastUpdatedDate: true, registrationDate: true })
		.extend({
			emergencyContact1Name: z.string().optional(),
			emergencyContact1Relation: z.string().optional(),
			emergencyContact1CellPhone: z.string().optional(),
		})
		.refine((d) => d.acceptedPrivacyNotice === true, {
			message: 'Debes aceptar el aviso de privacidad',
			path: ['acceptedPrivacyNotice'],
		})
		.refine(
			(d) =>
				d.type !== 'walker' ||
				(typeof d.emergencyContact1Name === 'string' && d.emergencyContact1Name.length > 0),
			{ message: 'Emergency contact 1 name is required', path: ['emergencyContact1Name'] },
		)
		.refine(
			(d) =>
				d.type !== 'walker' ||
				(typeof d.emergencyContact1Relation === 'string' && d.emergencyContact1Relation.length > 0),
			{ message: 'Emergency contact 1 relation is required', path: ['emergencyContact1Relation'] },
		)
		.refine(
			(d) =>
				d.type !== 'walker' ||
				(typeof d.emergencyContact1CellPhone === 'string' &&
					d.emergencyContact1CellPhone.length > 0),
			{
				message: 'Emergency contact 1 cell phone is required',
				path: ['emergencyContact1CellPhone'],
			},
		),
});
export type CreateParticipant = z.infer<typeof createParticipantSchema.shape.body>;


export const TableSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	retreatId: z.string().uuid(),
});
export const createTableSchema = TableSchema.omit({ id: true });

// PUT /participants/:id — lenient: accepts nulls from DB/form, coerces to undefined
// Omit fields that must not be changed via the general update endpoint (retreat scoping + internal IDs).
export const updateParticipantSchema = z.object({
	body: z.preprocess(
		(val) => {
			if (val && typeof val === 'object') {
				const cleaned: Record<string, unknown> = {};
				for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
					cleaned[k] = v === null || v === '' ? undefined : v;
				}
				return cleaned;
			}
			return val;
		},
		participantSchema.omit({ retreatId: true, id_on_retreat: true }).partial(),
	),
	params: z.object({ id: idSchema }),
});
export type UpdateParticipant = z.infer<typeof updateParticipantSchema.shape.body>;

// POST /retreats — createdBy is assigned server-side from the authenticated user, never from the body.
export const createRetreatSchema = z.object({
	body: retreatSchema.omit({ id: true, createdBy: true, memoryPhotos: true, memorySongs: true }),
});
export type CreateRetreat = z.infer<typeof createRetreatSchema.shape.body>;

// PUT /retreats/:id — createdBy must not be reassignable via an update request.
export const updateRetreatSchema = z.object({
	body: retreatSchema
		.omit({ id: true, createdBy: true, memoryPhotos: true, memorySongs: true })
		.partial(),
	params: z.object({ id: idSchema }),
});
export type UpdateRetreat = z.infer<typeof updateRetreatSchema.shape.body>;

// POST /houses
export const createHouseSchema = z.object({
	body: houseSchema.omit({ id: true }),
});
export type CreateHouse = z.infer<typeof createHouseSchema.shape.body>;

// PUT /houses/:id
export const updateHouseSchema = z.object({
	body: houseSchema.partial(),
	params: z.object({ id: idSchema }),
});
export type UpdateHouse = z.infer<typeof updateHouseSchema.shape.body>;

// POST /responsibilities
export const createResponsabilitySchema = z.object({
	body: responsabilitySchema.omit({ id: true, participant: true, participantId: true }),
});
export type CreateResponsability = z.infer<typeof createResponsabilitySchema.shape.body>;

// PUT /responsibilities/:id
export const updateResponsabilitySchema = z.object({
	body: responsabilitySchema
		.omit({ id: true, retreatId: true, participant: true, participantId: true })
		.partial(),
	params: z.object({ id: idSchema }),
});
export type UpdateResponsability = z.infer<typeof updateResponsabilitySchema.shape.body>;

// User types (avoid conflicts with permissions exports)
export type {
	User,
	UserRole,
	UserRetreat,
	Permission as UserPermission,
	Role as UserRoleType,
	RolePermission,
	UserPermission as UserPermissionType,
	UserRoleDetail,
	UserProfile,
} from './user';

export * from './message-template';
export * from './segment';
export * from './sequence';
export * from './crm';
export * from './serviceTeam';
export * from './permissions';
export * from './community';
export * from './testimonial';
export * from './santisimo';
export * from './schedule';
export * from './scheduleTime';
export * from './preRetreatTask';
export * from './preRetreatTaskTime';
export * from './retreatPreparation';
export * from './availability';
export * from './phone';
export * from './text';

// Payment Schema
export const paymentSchema = z.object({
	id: idSchema,
	participantId: idSchema,
	retreatId: idSchema,
	amount: z.number().positive(),
	paymentDate: z.coerce.date(),
	paymentMethod: z.enum(['cash', 'transfer', 'check', 'card', 'other']),
	referenceNumber: z.string().optional(),
	notes: z.string().optional(),
	recordedBy: idSchema,
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	participant: z.lazy(() => participantSchema).optional(),
	retreat: z.lazy(() => retreatSchema).optional(),
	recordedByUser: z.any().optional(), // Use any to avoid circular reference
});
export type Payment = z.infer<typeof paymentSchema>;

// Payment Request Schemas
// `amount` se coacciona (el form lo envía como string); `retreatId` es opcional
// porque el controller lo infiere del participante si no viene.
export const createPaymentSchema = z.object({
	body: paymentSchema
		.omit({
			id: true,
			createdAt: true,
			updatedAt: true,
			participant: true,
			retreat: true,
			recordedByUser: true,
			recordedBy: true,
		})
		.extend({
			amount: z.coerce.number().positive(),
			retreatId: idSchema.optional(),
		}),
});
export type CreatePayment = z.infer<typeof createPaymentSchema.shape.body>;

export const updatePaymentSchema = z.object({
	body: paymentSchema
		.omit({
			id: true,
			participantId: true,
			retreatId: true,
			recordedBy: true,
			createdAt: true,
			updatedAt: true,
			participant: true,
			retreat: true,
			recordedByUser: true,
		})
		.partial()
		.extend({ amount: z.coerce.number().positive().optional() }),
	params: z.object({ id: idSchema }),
});
export type UpdatePayment = z.infer<typeof updatePaymentSchema.shape.body>;

// Participant Debt Schema (deudas manuales para servidores/angelitos)
export const participantDebtSchema = z.object({
	id: idSchema,
	participantId: idSchema,
	retreatId: idSchema,
	amount: z.number().positive(),
	description: z.string().optional(),
	recordedBy: idSchema,
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	participant: z.lazy(() => participantSchema).optional(),
	retreat: z.lazy(() => retreatSchema).optional(),
	recordedByUser: z.any().optional(), // Use any to avoid circular reference
});
export type ParticipantDebt = z.infer<typeof participantDebtSchema>;

export const createParticipantDebtSchema = z.object({
	body: participantDebtSchema
		.omit({
			id: true,
			recordedBy: true,
			createdAt: true,
			updatedAt: true,
			participant: true,
			retreat: true,
			recordedByUser: true,
		})
		.extend({
			// El concepto es obligatorio al registrar una deuda.
			description: z.string().min(1, 'El concepto es obligatorio'),
			amount: z.coerce.number().positive(),
			// El controller infiere el retiro del participante si no viene.
			retreatId: idSchema.optional(),
		}),
});
export type CreateParticipantDebt = z.infer<typeof createParticipantDebtSchema.shape.body>;

export const updateParticipantDebtSchema = z.object({
	body: participantDebtSchema
		.omit({
			id: true,
			participantId: true,
			retreatId: true,
			recordedBy: true,
			createdAt: true,
			updatedAt: true,
			participant: true,
			retreat: true,
			recordedByUser: true,
		})
		.partial()
		.extend({ amount: z.coerce.number().positive().optional() }),
	params: z.object({ id: idSchema }),
});
export type UpdateParticipantDebt = z.infer<typeof updateParticipantDebtSchema.shape.body>;

// Role management types
export type {
	RoleRequest,
	CreateRoleRequest,
	UpdateRoleRequest,
	PermissionOverride,
	CreatePermissionOverride,
} from './user';

// Retreat Participant Schema
export const retreatParticipantSchema = z.object({
	id: idSchema,
	userId: idSchema,
	participantId: idSchema.nullable(),
	retreatId: idSchema,
	roleInRetreat: z.enum(['walker', 'server', 'leader', 'coordinator', 'charlista']),
	isPrimaryRetreat: z.boolean(),
	notes: z.string().optional(),
	metadata: z.record(z.any()).optional(),
	createdAt: z.coerce.date(),
	// Relations
	retreat: z
		.object({
			id: idSchema,
			parish: z.string(),
			startDate: z.coerce.date(),
			endDate: z.coerce.date(),
			house: z
				.object({
					id: idSchema,
					name: z.string(),
				})
				.optional(),
		})
		.optional(),
	participant: z
		.object({
			id: idSchema,
			firstName: z.string(),
			lastName: z.string(),
			type: z.string(),
		})
		.optional(),
	user: z
		.object({
			id: idSchema,
			displayName: z.string(),
			email: z.string(),
			profile: z
				.object({
					bio: z.string().optional(),
					avatarUrl: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
});

export type RetreatParticipant = z.infer<typeof retreatParticipantSchema>;

export type RoleInRetreat = 'walker' | 'server' | 'leader' | 'coordinator' | 'charlista';

export const retreatShirtTypeSchema = z.object({
	id: idSchema,
	retreatId: idSchema,
	name: z.string(),
	color: z.string().nullable().optional(),
	requiredForWalkers: z.boolean(),
	optionalForServers: z.boolean(),
	sortOrder: z.number(),
	availableSizes: z.array(z.string()).nullable().optional(),
});
export type RetreatShirtType = z.infer<typeof retreatShirtTypeSchema>;

export * from './audit';
