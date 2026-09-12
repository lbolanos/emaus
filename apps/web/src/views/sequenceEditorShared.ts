/**
 * Metadatos y helpers puros compartidos por los dos editores de secuencias:
 * el de retiro (MessageSequencesView) y el de plantillas globales
 * (GlobalMessageSequencesView). Antes vivían duplicados en ambas vistas (#8):
 * una corrección de audiencia/condición hecha en uno no llegaba al otro.
 *
 * Son funciones puras (sin draft ni stores): cada vista las llama con su
 * propio estado. Lo que sí difiere por editor —la audiencia `community_roster`
 * necesita la comunidad vinculada al retiro— se parametriza con `scope`.
 */
import { getMessageTemplateAudience } from '@repo/types';

// --------------------------------------------------------------------------
// Catálogos
// --------------------------------------------------------------------------
export const TRIGGERS = ['participant_created', 'days_before_retreat', 'days_after_retreat', 'birthday'] as const;
export const CHANNELS = ['email', 'whatsapp'] as const;
export const RECIPIENT_TARGETS = [
	'participant',
	'emergencyContact1',
	'emergencyContact2',
	'inviter',
	'tableLeader',
	'responsibility',
] as const;
export type RecipientTarget = (typeof RECIPIENT_TARGETS)[number];

/** Editor de retiro: incluye el padrón de la comunidad vinculada. */
export const LOCAL_AUDIENCES = ['all', 'walker', 'server', 'table_leaders', 'responsables', 'community_roster'] as const;
/** Plantillas globales: se crean sin retiro → sin padrón de comunidad. */
export const GLOBAL_AUDIENCES = ['all', 'walker', 'server', 'table_leaders', 'responsables'] as const;

// Filtros disponibles para la condición de un paso (subconjunto de SegmentFilters).
export const CONDITION_TYPES = ['walker', 'server', 'waiting', 'partial_server'] as const;
export const CONDITION_PAYMENTS = ['paid', 'partial', 'unpaid', 'overpaid', 'scholarship'] as const;
export const CONDITION_ATTENDANCE = ['pending', 'confirmed', 'declined'] as const;

// --------------------------------------------------------------------------
// Audiencias válidas por disparador
// --------------------------------------------------------------------------

/**
 * Audiencias válidas según el disparador. "Al registrarse" solo aplica a quien
 * se registra (caminante/servidor); líderes/responsables se asignan después.
 */
export function audiencesByTrigger(scope: 'local' | 'global'): Record<string, readonly string[]> {
	const base: Record<string, readonly string[]> = {
		participant_created: ['walker', 'server'],
	};
	if (scope === 'local') {
		// El padrón de comunidad queda fuera del cumpleaños: quien nunca dio su
		// fecha lleva el centinela, y todos caerían el mismo día. El backend
		// además los salta (`isPlaceholderBirthDate` en computeScheduledFor);
		// esto es para no ofrecer una combinación que no va a hacer lo que el
		// usuario espera.
		base.birthday = ['walker', 'server', 'all'];
	}
	return base;
}

/** Lista de audiencias ofrecidas al editar, conservando la actual si salió del catálogo. */
export function availableAudiencesFor(
	trigger: string,
	audience: string,
	scope: 'local' | 'global',
): string[] {
	const all = scope === 'local' ? LOCAL_AUDIENCES : GLOBAL_AUDIENCES;
	const base = [...(audiencesByTrigger(scope)[trigger] ?? all)];
	// Incluir el valor actual si no está (no romper secuencias existentes, p.ej. 'all').
	return base.includes(audience) ? base : [audience, ...base];
}

// --------------------------------------------------------------------------
// Plantilla ↔ audiencia del destinatario
// --------------------------------------------------------------------------

/**
 * Audiencia de plantilla que corresponde al DESTINATARIO de un paso (para
 * filtrar las plantillas mostradas). Regla: el filtro sigue al "enviar a",
 * no al enrolamiento.
 */
export function recipientAudienceFor(recipientTarget: string, audience: string): string | null {
	const t = recipientTarget;
	if (t === 'inviter' || t === 'emergencyContact1' || t === 'emergencyContact2') return 'family';
	if (t === 'tableLeader') return 'table_leader';
	if (t === 'responsibility') return 'responsible';
	// participant → audiencia derivada del enrolamiento
	const byAudience: Record<string, string | null> = {
		walker: 'walker',
		server: 'server',
		table_leaders: 'table_leader',
		responsables: 'responsible',
		// El padrón se convoca a SERVIR: las plantillas que aplican son las de
		// servidor (SERVER_CONVOCATION, SERVER_WELCOME…).
		community_roster: 'server',
		all: null,
	};
	return byAudience[audience] ?? null;
}

/**
 * ¿La audiencia de una plantilla aplica a la audiencia del destinatario? Las
 * plantillas 'participant' (ambos tipos) valen para caminantes y servidores.
 */
export function audienceMatches(a: string, aud: string): boolean {
	return a === aud || a === 'general' || (a === 'participant' && (aud === 'walker' || aud === 'server'));
}

/**
 * Primera plantilla utilizable para una audiencia de destinatario — el
 * re-assignment de `onAudienceChange` cuando la plantilla del paso dejó de
 * corresponder. Preferencia: misma categoría → 'participant' (si aplica a
 * caminantes/servidores) → general.
 */
export function pickTemplateForAudience(usableTemplates: any[], aud: string): any | undefined {
	const both = aud === 'walker' || aud === 'server';
	return (
		usableTemplates.find((t: any) => getMessageTemplateAudience(t.type) === aud) ||
		(both && usableTemplates.find((t: any) => getMessageTemplateAudience(t.type) === 'participant')) ||
		usableTemplates.find((t: any) => getMessageTemplateAudience(t.type) === 'general')
	);
}

/** Plantillas mostradas para un paso: las de la audiencia del destinatario + la seleccionada. */
export function templatesForStepAudience(
	usableTemplates: any[],
	step: { recipientTarget: string; templateType: string },
	audience: string,
): any[] {
	const aud = recipientAudienceFor(step.recipientTarget, audience);
	if (!aud) return usableTemplates;
	return usableTemplates.filter(
		(tpl: any) => audienceMatches(getMessageTemplateAudience(tpl.type), aud) || tpl.type === step.templateType,
	);
}

// --------------------------------------------------------------------------
// Condición del paso
// --------------------------------------------------------------------------
export interface StepCondition {
	participantType?: string | null;
	paymentStatus?: string | null;
	attendanceFilter?: string;
}

/** Borrador de un paso en el editor. `id` presente ⇒ paso existente (local). */
export interface StepDraft {
	id?: string; // presente al editar un paso existente → conserva identidad (no re-envía)
	offsetDays: number;
	sendHour: number;
	templateType: string;
	channel: 'email' | 'whatsapp';
	recipientTarget: RecipientTarget;
	recipientResponsibility: string;
	condition: StepCondition;
	condOpen?: boolean; // solo UI: muestra/oculta el bloque de condición
}

/** ¿El paso tiene alguna condición configurada? */
export function hasCondition(c: StepCondition): boolean {
	return !!(c.participantType || c.paymentStatus || (c.attendanceFilter && c.attendanceFilter !== 'all'));
}

/** Convierte el objeto condición del editor en SegmentFilters (omitiendo vacíos). */
export function conditionToFilters(c: StepCondition): Record<string, unknown> | undefined {
	const out: Record<string, unknown> = {};
	if (c.participantType) out.participantType = c.participantType;
	if (c.paymentStatus) out.paymentStatus = c.paymentStatus;
	if (c.attendanceFilter && c.attendanceFilter !== 'all') out.attendanceFilter = c.attendanceFilter;
	return Object.keys(out).length ? out : undefined;
}

/** Inverso de conditionToFilters: normaliza la condición persistida al shape del editor. */
export function filtersToCondition(f: any): StepCondition {
	return {
		participantType: f?.participantType ?? null,
		paymentStatus: f?.paymentStatus ?? null,
		attendanceFilter: f?.attendanceFilter ?? 'all',
	};
}
