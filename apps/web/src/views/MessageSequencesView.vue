<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast, Button, Input } from '@repo/ui';
import { Plus, Trash2, X, Play, Pencil, Send, Clock, AlertTriangle, Globe, RefreshCw, MoreVertical, CalendarDays, MessageCircle, Power, Copy, ChevronDown } from 'lucide-vue-next';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useMessageSequenceStore } from '@/stores/messageSequenceStore';
import { useGlobalMessageSequenceStore } from '@/stores/globalMessageSequenceStore';
import { useMessageTemplateStore } from '@/stores/messageTemplateStore';
import { useResponsabilityStore } from '@/stores/responsabilityStore';
import { useAuthStore } from '@/stores/authStore';
import { convertHtmlToWhatsApp, replaceAllVariables } from '@/utils/message';
import type { ParticipantData, RetreatData } from '@/utils/message';
import { sanitizePhoneForWhatsapp } from '@/utils/phone';
import { clampStepRanges } from '@/utils/sequenceStepInput';
import { getMessageTemplateAudience } from '@repo/types';
// #8: catálogos y helpers del editor compartidos con la vista global de
// plantillas — antes vivían duplicados en ambas vistas.
import {
	TRIGGERS,
	CHANNELS,
	LOCAL_AUDIENCES,
	CONDITION_TYPES,
	CONDITION_PAYMENTS,
	CONDITION_ATTENDANCE,
	audiencesByTrigger,
	availableAudiencesFor,
	recipientAudienceFor,
	audienceMatches,
	pickTemplateForAudience,
	templatesForStepAudience,
	hasCondition,
	conditionToFilters,
	filtersToCondition,
	type StepDraft,
} from './sequenceEditorShared';
import type { SequenceStepPreview } from '@repo/types';
import { previewSequenceStep, previewSequenceSchedule } from '@/services/api';
import { useModalA11y } from '@/composables/useModalA11y';

const { t } = useI18n();
const { toast } = useToast();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const sequenceStore = useMessageSequenceStore();
const globalSequenceStore = useGlobalMessageSequenceStore();
const templateStore = useMessageTemplateStore();
const responsabilityStore = useResponsabilityStore();
const authStore = useAuthStore();
const myUserId = computed(() => (authStore.user as any)?.id || null);

// Nombres de responsabilidades del retiro (únicos) para el destinatario 'responsibility'.
const responsibilityNames = computed(() => {
	const names = (responsabilityStore.responsibilities || []).map((r: any) => r.name).filter(Boolean);
	return Array.from(new Set(names)) as string[];
});

const { sequences, queue, stats, issues, issuesTotal, detail, detailLoading } = storeToRefs(sequenceStore);
const {
	scheduled, scheduledTotal, scheduledTotalPages, scheduledTimezone, scheduledLoading,
} = storeToRefs(sequenceStore);

const { templates } = storeToRefs(templateStore);

// Plantillas relevantes para una secuencia: del retiro, excluyendo system (SYS_).
const usableTemplates = computed(() =>
	(templates.value || []).filter((tpl: any) => !String(tpl.type || '').startsWith('SYS_')),
);

// Participante de ejemplo para el preview del mensaje (el primero del retiro).
const sampleParticipant = computed(() => participantStore.participants?.[0] || null);

function statusCount(seqId: string, status: string): number {
	return stats.value?.[seqId]?.[status] || 0;
}

// Traduce el motivo crudo de un mensaje con problema a una guía accionable
// («cómo corregir»). Devuelve '' cuando no hay nada que hacer (omitidos esperados).
function remediationFor(it: { error?: string | null; status?: string }): string {
	const e = (it.error || '').toLowerCase();
	if (!e) return '';
	if (e.includes('no-contacto') || e.includes('no contacto'))
		return t('sequences.remediation.noContact');
	if (e.includes('cancelado')) return t('sequences.remediation.cancelled');
	if (e.includes('vencido')) return t('sequences.remediation.overdue');
	if (e.includes('declinó') || e.includes('declino'))
		return t('sequences.remediation.declined');
	if (e.includes('condición') || e.includes('condicion'))
		return t('sequences.remediation.condition');
	if (e.includes('sin plantilla')) return t('sequences.remediation.noTemplate');
	if (e.includes('sin teléfono') || e.includes('sin telefono'))
		return t('sequences.remediation.noPhone');
	if (e.includes('sin email') || e.includes('sin correo'))
		return t('sequences.remediation.noEmail');
	if (e.includes('disabled outside production'))
		return t('sequences.remediation.emailDisabledDev');
	if (e.includes('smtp')) return t('sequences.remediation.smtp');
	if (e.includes('omitido manualmente')) return t('sequences.remediation.manual');
	// Fallback: solo sugerimos corregir+reintentar en los fallidos.
	return it.status === 'failed' ? t('sequences.remediation.generic') : '';
}

// Color del badge del estado de seguimiento del participante (bandeja WhatsApp).
function followUpBadgeClass(status: string): string {
	return (
		{
			pending: 'bg-gray-200 text-gray-700',
			contacted: 'bg-blue-100 text-blue-700',
			confirmed: 'bg-green-100 text-green-700',
			no_answer: 'bg-amber-100 text-amber-700',
			declined: 'bg-red-100 text-red-700',
		}[status] || 'bg-gray-100 text-gray-600'
	);
}

const retreatId = computed(() => retreatStore.selectedRetreatId || '');

// Editor LOCAL (con retiro): mismas reglas que el editor global, más la
// audiencia community_roster y el disparador birthday. Catálogos y reglas
// puras en ./sequenceEditorShared.ts (#8).
const availableAudiences = computed<string[]>(() =>
	availableAudiencesFor(draft.value.trigger, draft.value.audience, 'local'),
);
// Al cambiar audiencia: si la plantilla de un paso ya no corresponde a la
// categoría del destinatario, reasignarla a la primera válida (evita que quede
// "Bienvenida Caminante" al pasar a Servidores).
function onAudienceChange() {
	for (const step of draft.value.steps) {
		const aud = recipientAudienceFor(step.recipientTarget, draft.value.audience);
		if (!aud) continue;
		if (audienceMatches(getMessageTemplateAudience(step.templateType), aud)) continue;
		const first = pickTemplateForAudience(usableTemplates.value, aud);
		if (first) step.templateType = first.type;
	}
}
// Al cambiar el disparador (acción del usuario), corrige la audiencia si quedó
// inválida y revalida las plantillas.
function onTriggerChange() {
	const base = audiencesByTrigger('local')[draft.value.trigger] ?? LOCAL_AUDIENCES;
	if (!base.includes(draft.value.audience)) draft.value.audience = base[0] as any;
	onAudienceChange();
}

// "Enviar a" ordenado por relevancia según el enrolamiento (más usados primero),
// pero la lista es completa (flexible): cualquier destinatario sigue disponible.
const recipientOptions = computed<string[]>(() => {
	const aud = draft.value.audience;
	if (aud === 'walker' || aud === 'all') {
		return ['participant', 'inviter', 'emergencyContact1', 'emergencyContact2', 'tableLeader', 'responsibility'];
	}
	// El padrón de la comunidad son personas que aún NO están inscritas en el
	// retiro: no tienen contacto de emergencia capturado, ni invitador, ni mesa.
	// Ofrecer esos destinatarios daría mensajes que se omiten por falta de dato.
	if (aud === 'community_roster') return ['participant'];
	// server / table_leaders / responsables → primero participante, líder y responsable
	return ['participant', 'tableLeader', 'responsibility', 'inviter', 'emergencyContact1', 'emergencyContact2'];
});

// Plantillas mostradas para un paso: las de la audiencia del destinatario + general
// + la actualmente seleccionada (para no perderla al editar). 'all' (null) = todas.
function templatesForStep(step: { recipientTarget: string; templateType: string }) {
	return templatesForStepAudience(usableTemplates.value, step, draft.value.audience);
}

interface SequenceDraft {
	id?: string;
	name: string;
	description: string;
	trigger: (typeof TRIGGERS)[number];
	audience: (typeof LOCAL_AUDIENCES)[number];
	isActive: boolean;
	maxOverdueDays: number | null;
	steps: StepDraft[];
}

const isEditorOpen = ref(false);
const editorModalRef = ref<HTMLElement | null>(null);
useModalA11y(isEditorOpen, () => { isEditorOpen.value = false; }, editorModalRef);
const draft = ref<SequenceDraft>(emptyDraft());

function emptyDraft(): SequenceDraft {
	return {
		name: '',
		description: '',
		trigger: 'days_before_retreat',
		audience: 'all',
		isActive: true,
		maxOverdueDays: null,
		steps: [],
	};
}

// Bandeja en vivo (websocket): la suscripción vive mientras la vista está
// montada y se renueva al cambiar de retiro.
let unsubRealtime: (() => void) | null = null;

async function load() {
	if (!retreatId.value) return;
	participantStore.filters.retreatId = retreatId.value;
	unsubRealtime?.();
	unsubRealtime = sequenceStore.subscribeRealtime(retreatId.value);
	await Promise.all([
		sequenceStore.fetchSequences(retreatId.value),
		sequenceStore.fetchQueue(retreatId.value),
		sequenceStore.fetchStats(retreatId.value),
		// Pestaña Programados: primera página lista al abrirla y, de paso, la TZ
		// del retiro (fallback para pintar fechas de bandeja/detalle).
		sequenceStore.fetchScheduled(retreatId.value),
		templateStore.fetchTemplates(retreatId.value),
		participantStore.fetchParticipants().catch(() => {}),
		responsabilityStore.fetchResponsibilities(retreatId.value, { silent: true }).catch(() => {}),
	]);
}

onMounted(load);
watch(retreatId, load);
onUnmounted(() => {
	unsubRealtime?.();
	unsubRealtime = null;
});

function openCreate() {
	draft.value = emptyDraft();
	isEditorOpen.value = true;
}

function openEdit(seq: any) {
	draft.value = {
		id: seq.id,
		name: seq.name,
		description: seq.description || '',
		trigger: seq.trigger,
		audience: seq.audience,
		isActive: seq.isActive,
		maxOverdueDays: seq.maxOverdueDays ?? null,
		steps: (seq.steps || []).map((s: any) => ({
			id: s.id,
			offsetDays: s.offsetDays,
			sendHour: s.sendHour,
			templateType: s.templateType,
			channel: s.channel,
			recipientTarget: s.recipientTarget || 'participant',
			recipientResponsibility: s.recipientResponsibility || '',
			condition: filtersToCondition(s.condition),
			condOpen: hasCondition(filtersToCondition(s.condition)),
		})),
	};
	isEditorOpen.value = true;
}

function addStep() {
	draft.value.steps.push({
		offsetDays: 0,
		sendHour: 9,
		templateType: usableTemplates.value[0]?.type || '',
		channel: 'whatsapp',
		recipientTarget: 'participant',
		recipientResponsibility: '',
		condition: { participantType: null, paymentStatus: null, attendanceFilter: 'all' },
		condOpen: false,
	});
}

// Pasos cuyo tipo de plantilla no existe en el retiro (aviso al guardar).
const stepsWithMissingTemplate = computed(() =>
	draft.value.steps.filter(
		(s) => !usableTemplates.value.some((tpl: any) => tpl.type === s.templateType),
	),
);

// Vista previa POR PASO, resuelta en el servidor.
//
// No se puede calcular en el cliente: el destinatario indirecto
// (`inviter`/`tableLeader`/`responsibility`) se resuelve con consultas, y el
// contexto `{table.*}` necesita el roster. El preview anterior pasaba
// `recipientTarget` como contactKey a secas y saludaba a la persona equivocada.
const previewParticipantId = ref<string>('');
const previewStepIndex = ref<number | null>(null);
const previewResult = ref<SequenceStepPreview | null>(null);
const previewLoading = ref(false);
const previewError = ref<string | null>(null);

// Participante de muestra: el elegido, o el primero del retiro.
const previewParticipant = computed(
	() =>
		participantStore.participants?.find((p: any) => p.id === previewParticipantId.value) ||
		sampleParticipant.value,
);

async function openStepPreview(index: number) {
	const step = draft.value.steps[index];
	const participant = previewParticipant.value;
	if (!step || !participant || !retreatId.value) return;
	previewStepIndex.value = index;
	previewResult.value = null;
	previewError.value = null;
	previewLoading.value = true;
	try {
		previewResult.value = await previewSequenceStep({
			retreatId: retreatId.value,
			participantId: participant.id,
			templateType: step.templateType,
			channel: step.channel,
			recipientTarget: step.recipientTarget,
			recipientResponsibility: step.recipientResponsibility || null,
		});
	} catch (e: any) {
		previewError.value = e?.message || t('sequences.previewError');
	} finally {
		previewLoading.value = false;
	}
}

/**
 * Las plantillas se guardan en HTML. En el preview hay que aplanarlo: si no, el
 * coordinador lee `<p>Hola…</p>` y parece que el mensaje va a salir roto.
 */
const previewPlainText = computed(() =>
	previewResult.value?.content ? convertHtmlToWhatsApp(previewResult.value.content) : '',
);

function closeStepPreview() {
	previewStepIndex.value = null;
	previewResult.value = null;
	previewError.value = null;
}

// Al cambiar de participante, refrescar el paso que esté abierto.
watch(previewParticipantId, () => {
	if (previewStepIndex.value !== null) openStepPreview(previewStepIndex.value);
});

// --------------------------------------------------------------------------
// A4 timeline del editor: fecha que TENDRÍA cada paso para el participante de
// muestra, resuelta por el servidor con `computeScheduledFor` (misma función
// del enrolamiento → el preview y lo materializado nunca divergen). Se
// recomputa al abrir el editor, al cambiar trigger/offsets/horas y al cambiar
// el participante de muestra, con debounce para no spamear el endpoint.
// --------------------------------------------------------------------------
const stepDates = ref<Array<string | null>>([]);
const stepDatesLoading = ref(false);

const stepsSignature = computed(() =>
	JSON.stringify({
		trigger: draft.value.trigger,
		steps: draft.value.steps.map((s) => [s.offsetDays, s.sendHour]),
	}),
);

async function refreshStepDates() {
	// Sin participante no hay fechas; el template muestra sólo el paso.
	if (!isEditorOpen.value || !retreatId.value || !previewParticipant.value) {
		stepDates.value = [];
		return;
	}
	stepDatesLoading.value = true;
	try {
		const res = await previewSequenceSchedule(
			retreatId.value,
			previewParticipant.value.id,
			draft.value.trigger,
			draft.value.steps.map((s) => ({ offsetDays: s.offsetDays, sendHour: s.sendHour })),
		);
		stepDates.value = res.dates;
	} catch {
		stepDates.value = []; // el header muestra la fecha vacía, no rompe el editor
	} finally {
		stepDatesLoading.value = false;
	}
}

let stepDatesTimer: number | undefined;
watch([isEditorOpen, stepsSignature, previewParticipantId], () => {
	window.clearTimeout(stepDatesTimer);
	stepDatesTimer = window.setTimeout(refreshStepDates, 400);
});

function removeStep(i: number) {
	draft.value.steps.splice(i, 1);
}

async function saveDraft() {
	if (!draft.value.name.trim() || !retreatId.value) return;
	// #4: normalizar horas/días fuera de rango antes de enviar (el input
	// numérico no enforcement lo tecleado a mano).
	const fixedSteps = clampStepRanges(draft.value.steps);
	if (fixedSteps) toast({ title: t('sequences.stepRangeFixed', { n: fixedSteps }) });
	const payload = {
		name: draft.value.name.trim(),
		description: draft.value.description || undefined,
		retreatId: retreatId.value,
		trigger: draft.value.trigger,
		audience: draft.value.audience,
		isActive: draft.value.isActive,
		maxOverdueDays: draft.value.maxOverdueDays ?? null,
		steps: draft.value.steps.map((s, i) => ({
			id: s.id,
			stepOrder: i,
			offsetDays: s.offsetDays,
			sendHour: s.sendHour,
			templateType: s.templateType,
			channel: s.channel,
			recipientTarget: s.recipientTarget,
			recipientResponsibility:
				s.recipientTarget === 'responsibility' ? s.recipientResponsibility || null : null,
			condition: conditionToFilters(s.condition) ?? null,
		})),
	};
	try {
		// M5: el PUT devuelve lo que el edit le hizo a las filas materializadas
		// (el POST de create no lleva counts — no hay filas previas que mover).
		let counts: { cancelledPendingCount?: number; archivedStepCount?: number; archivedPendingCount?: number } = {};
		if (draft.value.id) {
			counts = await sequenceStore.update(draft.value.id, payload);
		} else {
			await sequenceStore.create(payload);
		}
		toast({ title: t('sequences.saved') });
		// Cambió el disparador/audiencia → las pending se re-materializaron con
		// las fechas nuevas; pasos quitados → sus pendientes quedaron cancelados.
		// Avisar (no confirmar: el editor ya es un diálogo deliberado) y refrescar.
		if (counts.cancelledPendingCount) {
			toast({ title: t('sequences.reenrolled', { n: counts.cancelledPendingCount }) });
		}
		if (counts.archivedStepCount) {
			toast({ title: t('sequences.archivedStepsDone', { n: counts.archivedPendingCount }) });
		}
		if (counts.cancelledPendingCount || counts.archivedStepCount) {
			await sequenceStore.fetchStats(retreatId.value);
			await loadScheduled();
		}
		isEditorOpen.value = false;
	} catch {
		toast({ title: t('sequences.saveError'), variant: 'destructive' });
	}
}

// Confirmación antes de eliminar (un clic ya no borra directo).
const seqToDelete = ref<any>(null);
const deleteModalOpen = computed(() => !!seqToDelete.value);
const deleteModalRef = ref<HTMLElement | null>(null);
useModalA11y(deleteModalOpen, () => { seqToDelete.value = null; }, deleteModalRef);
function askDelete(seq: any) {
	seqToDelete.value = seq;
}
async function confirmDelete() {
	const seq = seqToDelete.value;
	seqToDelete.value = null;
	if (!seq) return;
	try {
		await sequenceStore.remove(seq.id);
		toast({ title: t('sequences.deleted') });
	} catch {
		toast({ title: t('sequences.deleteError'), variant: 'destructive' });
	}
}

// M6-D2: activar/desactivar sin abrir el editor (mismo patrón que la vista global).
async function toggleActive(seq: any) {
	try {
		await sequenceStore.update(seq.id, { isActive: !seq.isActive });
	} catch {
		toast({ title: t('sequences.toggleError'), variant: 'destructive' });
	}
}

// M6-D1: duplicar como copia INACTIVA con pasos nuevos (sin id) — no reenvía
// nada hasta que se revise y se active a propósito.
async function duplicateSequence(seq: any) {
	if (!retreatId.value) return;
	try {
		await sequenceStore.create({
			name: `${seq.name} (copia)`,
			description: seq.description || undefined,
			retreatId: retreatId.value,
			trigger: seq.trigger,
			audience: seq.audience,
			isActive: false,
			maxOverdueDays: seq.maxOverdueDays ?? null,
			steps: (seq.steps || []).map((s: any, i: number) => ({
				// Sin id: steps nuevos — la copia parte de cero filas materializadas.
				stepOrder: i,
				offsetDays: s.offsetDays,
				sendHour: s.sendHour,
				templateType: s.templateType,
				channel: s.channel,
				recipientTarget: s.recipientTarget || 'participant',
				recipientResponsibility: s.recipientResponsibility || null,
				condition: s.condition ?? null,
			})),
		});
		toast({ title: t('sequences.duplicated', { name: seq.name }) });
	} catch {
		toast({ title: t('sequences.duplicateError'), variant: 'destructive' });
	}
}

// M6-D5: omitir pide confirmación — un tap accidental en móvil no debe omitir
// sin retorno (mismo mecanismo que las acciones masivas).
async function skipItem(item: any) {
	if (!window.confirm(t('sequences.skipConfirm'))) return;
	try {
		await sequenceStore.skip(item.id);
		toast({ title: t('sequences.skipDone') });
	} catch {
		toast({ title: t('sequences.skipError'), variant: 'destructive' });
	}
}

async function runNow() {
	if (!retreatId.value) return;
	try {
		const res = await sequenceStore.run(retreatId.value);
		toast({
			title: t('sequences.runDone', { enrolled: res.enrolled, processed: res.processed }),
		});
	} catch {
		toast({ title: t('sequences.runError'), variant: 'destructive' });
	}
}

// Preferencia: al abrir WhatsApp, marcar enviado automáticamente (salta el paso
// manual "Ya lo envié"). Se recuerda por navegador.
const autoConfirmSend = ref(localStorage.getItem('seq.autoConfirmSend') === '1');
watch(autoConfirmSend, (v) => localStorage.setItem('seq.autoConfirmSend', v ? '1' : '0'));

const regenerating = ref(false);

// Tabs de la página (secuencias / programados / pendientes / problemas).
const activeTab = ref<'sequences' | 'scheduled' | 'pending' | 'issues'>('sequences');
// Teclado del tablist (patrón WAI-ARIA): flechas/Home/End mueven el tab
// activo y llevan el foco con él. Sin roving tabindex — los 4 tabs siguen
// alcanzables por Tab para no dejar ninguno fuera del orden del documento.
const TAB_KEYS = ['sequences', 'scheduled', 'pending', 'issues'] as const;
function switchTab(key: (typeof TAB_KEYS)[number]) {
	activeTab.value = key;
	document.getElementById(`seq-tab-${key}`)?.focus();
}
function onTablistKeydown(e: KeyboardEvent) {
	const idx = TAB_KEYS.indexOf(activeTab.value);
	let next: number | null = null;
	if (e.key === 'ArrowRight') next = (idx + 1) % TAB_KEYS.length;
	else if (e.key === 'ArrowLeft') next = (idx - 1 + TAB_KEYS.length) % TAB_KEYS.length;
	else if (e.key === 'Home') next = 0;
	else if (e.key === 'End') next = TAB_KEYS.length - 1;
	if (next === null) return;
	e.preventDefault();
	switchTab(TAB_KEYS[next]);
}
const QUEUE_PAGE_SIZE = 10;
const queuePage = ref(1);
const queueSort = ref<'scheduled' | 'name' | 'template' | 'recent'>('scheduled');
const queueSearch = ref('');
const queueAssignFilter = ref<'all' | 'mine' | 'unassigned'>('all');
const queueMenuOpen = ref(false); // menú de acciones (solo móvil) en Pendientes
const issuesMenuOpen = ref(false); // menú de acciones masivas (solo móvil) en Problemas

const sortedQueue = computed(() => {
	const items = [...queue.value];
	const name = (q: any) => `${q.participant?.lastName || ''} ${q.participant?.firstName || ''}`.trim();
	const time = (q: any) => new Date(q.scheduledFor as any).getTime() || 0;
	if (queueSort.value === 'name') return items.sort((a, b) => name(a).localeCompare(name(b), 'es'));
	if (queueSort.value === 'template')
		return items.sort((a, b) => (a.templateType || '').localeCompare(b.templateType || ''));
	if (queueSort.value === 'recent') return items.sort((a, b) => time(b) - time(a));
	return items.sort((a, b) => time(a) - time(b)); // 'scheduled': por fecha programada
});
// Filtro por texto: nombre del participante, plantilla o destinatario.
const filteredQueue = computed(() => {
	let items = sortedQueue.value;
	// Filtro por asignación: todos / míos / sin asignar.
	if (queueAssignFilter.value === 'mine') {
		items = items.filter((it: any) => it.assignedTo === myUserId.value);
	} else if (queueAssignFilter.value === 'unassigned') {
		items = items.filter((it: any) => !it.assignedTo);
	}
	// Filtro por texto.
	const q = queueSearch.value.trim().toLowerCase();
	if (q) {
		items = items.filter((it: any) =>
			[it.participant?.firstName, it.participant?.lastName, it.templateType, it.recipientName]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
				.includes(q),
		);
	}
	return items;
});
const queueTotalPages = computed(() => Math.max(1, Math.ceil(filteredQueue.value.length / QUEUE_PAGE_SIZE)));
const pagedQueue = computed(() =>
	filteredQueue.value.slice((queuePage.value - 1) * QUEUE_PAGE_SIZE, queuePage.value * QUEUE_PAGE_SIZE),
);
// Volver a página 1 al reordenar o buscar; reajustar si la cola se achica.
watch([queueSort, queueSearch, queueAssignFilter], () => (queuePage.value = 1));
watch(
	() => queue.value.length,
	() => {
		if (queuePage.value > queueTotalPages.value) queuePage.value = queueTotalPages.value;
	},
);

// --------------------------------------------------------------------------
// Pestaña "Programados" (mensajes materializados: pending futuros, enviados…).
// TODO server-side: filtros, orden y paginación los resuelve el API; aquí sólo
// se mantiene el estado de los controles y se refetch-ea con debounce.
// --------------------------------------------------------------------------
const SCHED_STATUSES = ['pending', 'queued', 'sent', 'skipped', 'failed', 'cancelled'] as const;
const schedSearch = ref('');
const schedSearchDebounced = ref('');
const schedStatus = ref<string>('pending');
const schedOrder = ref<'scheduled' | 'recent'>('scheduled');
const schedSequenceFilter = ref<string | null>(null); // chip de secuencia (badge clickeable)
// Chip de participante (#9): histórico de un participante. Se fija al hacer click
// en su nombre de una fila — el nombre llega en la propia fila (no carga el roster).
const schedParticipantFilter = ref<{ id: string; name: string } | null>(null);
const schedPage = ref(1);
let schedSearchTimer: number | undefined;

watch(schedSearch, (v) => {
	window.clearTimeout(schedSearchTimer);
	schedSearchTimer = window.setTimeout(() => (schedSearchDebounced.value = v), 300);
});

// Contador del TAB: pending total del retiro, derivado de stats — igual fuente
// que los badges por secuencia. Independiente de los filtros de la pestaña
// (scheduledTotal cambia con el status elegido; este no).
const scheduledTabCount = computed(() =>
	Object.values(stats.value || {}).reduce(
		(n: number, byStatus) => n + ((byStatus as Record<string, number>).pending || 0),
		0,
	),
);

async function loadScheduled() {
	if (!retreatId.value) return;
	await sequenceStore.fetchScheduled(retreatId.value, {
		statuses: [schedStatus.value],
		sequenceId: schedSequenceFilter.value ?? undefined,
		participantId: schedParticipantFilter.value?.id,
		search: schedSearchDebounced.value.trim() || undefined,
		page: schedPage.value,
		order: schedOrder.value,
	});
}

// Refetch al cambiar cualquier control; los filtros además vuelven a página 1.
watch([schedSearchDebounced, schedStatus, schedOrder, schedSequenceFilter, schedParticipantFilter], () => {
	schedPage.value = 1;
	loadScheduled();
});
watch(schedPage, loadScheduled);
// Al entrar a la pestaña, datos frescos (las fechas vencen con el paso del tiempo).
watch(activeTab, (tab) => {
	if (tab === 'scheduled') loadScheduled();
});

// A5: badge "N programados" de una secuencia → pestaña Programados filtrada.
function openScheduledForSequence(seq: any) {
	schedSequenceFilter.value = seq.id;
	schedStatus.value = 'pending';
	activeTab.value = 'scheduled';
}
function clearSchedSequenceFilter() {
	schedSequenceFilter.value = null; // el watch refetch-ea
}
// #9: click en el nombre de una fila → todo el histórico del participante
// (el usuario combina el filtro con el selector de estado: sent, skipped…).
function openScheduledForParticipant(it: any) {
	schedParticipantFilter.value = { id: it.participantId, name: it.participantName || '' };
}
function clearSchedParticipantFilter() {
	schedParticipantFilter.value = null; // el watch refetch-ea
}
// A5: badge problemas de una secuencia → pestaña Problemas con chip removible.
const issuesSequenceFilter = ref<string | null>(null);
function openIssuesForSequence(seq: any) {
	issuesSequenceFilter.value = seq.id;
	activeTab.value = 'issues';
}

// Nombre legible de una secuencia por id (columna/tab de Programados).
function seqName(sequenceId: string | null | undefined): string {
	if (!sequenceId) return '';
	return sequences.value.find((s: any) => s.id === sequenceId)?.name || '';
}
// Nombre legible del tipo de plantilla (fallback al tipo crudo).
function templateLabel(type: string | null | undefined): string {
	if (!type) return '';
	return templates.value.find((tpl: any) => tpl.type === type)?.name || type;
}

// --------------------------------------------------------------------------
// Fechas en la TZ del retiro (A3). La zona la resuelve el SERVER (viene en la
// respuesta del listado); el fallback al retreatStore cubre la bandeja/detalle
// antes del primer fetch de Programados.
// --------------------------------------------------------------------------
const retreatTimezone = computed<string>(() => {
	const tz = scheduledTimezone.value || (retreatStore.selectedRetreat as any)?.timezone;
	return tz || 'America/Mexico_City';
});

function formatInRetreatTz(
	date: string | Date | null | undefined,
	opts: { withTime?: boolean; withTz?: boolean } = {},
): string {
	if (!date) return '';
	const dt = new Date(date);
	if (Number.isNaN(dt.getTime())) return '';
	const parts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
	if (opts.withTime !== false) {
		parts.hour = 'numeric';
		parts.minute = '2-digit';
	}
	if (opts.withTz !== false) parts.timeZoneName = 'short';
	return new Intl.DateTimeFormat('es-MX', { ...parts, timeZone: retreatTimezone.value }).format(dt);
}

// Fila de Programados: fecha completa "25 sep 2026, 9:00 a.m. CDMX".
function fmtScheduled(date: string | null): string {
	if (!date) return t('sequences.scheduledNoDate');
	return formatInRetreatTz(date, {});
}
// Header del paso en el editor: compacto "→ 12 sep, 9:00 CDMX".
function fmtStepDate(date: string | null): string {
	if (!date) return t('sequences.stepNoDate');
	return formatInRetreatTz(date, { withTz: true });
}

// Color del badge de estado en la tabla de Programados.
function schedStatusClass(status: string): string {
	return (
		{
			pending: 'bg-blue-100 text-blue-700',
			processing: 'bg-purple-100 text-purple-700',
			queued: 'bg-amber-100 text-amber-700',
			sent: 'bg-green-100 text-green-700',
			skipped: 'bg-gray-100 text-gray-600',
			failed: 'bg-red-100 text-red-700',
			cancelled: 'bg-gray-100 text-gray-500',
		}[status] || 'bg-gray-100 text-gray-600'
	);
}

// --------------------------------------------------------------------------
// M4: reprogramar / encolar ya (B1-B2). Mueve TODOS los pending del paso —
// el diálogo aclara el alcance. La conversión TZ la hace el SERVER
// (`makeDateInTimezone`); aquí sólo se arma la pared (fecha/hora) inicial.
// --------------------------------------------------------------------------
const reschedDialog = ref(false);
const reschedStep = ref<{ id: string; label: string } | null>(null);
const reschedDate = ref('');
const reschedHour = ref<number>(9);
const reschedSaving = ref(false);
const reschedModalRef = ref<HTMLElement | null>(null);
useModalA11y(reschedDialog, () => { reschedDialog.value = false; }, reschedModalRef);

// Partes de pared (Y/M/D + hora) de una fecha absoluta en una TZ dada — para
// precargar el diálogo con la fecha vigente del propio paso.
function wallPartsInTz(
	date: string | Date,
	tz: string,
): { year: number; month: number; day: number; hour: number } {
	// formatToParts no parsea strings ISO — normaliza a Date primero.
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		hour12: false,
	})
		.formatToParts(new Date(date))
		.reduce<Record<string, string>>((acc, p) => {
			if (p.type !== 'literal') acc[p.type] = p.value;
			return acc;
		}, {});
	return {
		year: Number(parts.year),
		month: Number(parts.month),
		day: Number(parts.day),
		hour: Number(parts.hour === '24' ? '0' : parts.hour),
	};
}

// Fecha/hora "ahora" en pared del retiro, para el aviso de catch-up.
function retreatWallNow(): { date: string; hour: number } {
	const { year, month, day, hour } = wallPartsInTz(new Date(), retreatTimezone.value);
	return {
		date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
		hour,
	};
}

// Comparación de pared (no de instantes): el server es la fuente de verdad de
// la conversión; esto es sólo el aviso "quedó en el pasado → corre el cron".
const reschedIsPast = computed(() => {
	if (!reschedDate.value) return false;
	const now = retreatWallNow();
	if (reschedDate.value < now.date) return true;
	return reschedDate.value === now.date && reschedHour.value <= now.hour;
});

function openReschedule(stepId: string, label: string, scheduledFor?: string | null) {
	reschedStep.value = { id: stepId, label };
	const base = scheduledFor
		? wallPartsInTz(scheduledFor, retreatTimezone.value)
		: wallPartsInTz(new Date(), retreatTimezone.value);
	reschedDate.value = `${base.year}-${String(base.month).padStart(2, '0')}-${String(base.day).padStart(2, '0')}`;
	reschedHour.value = base.hour;
	reschedDialog.value = true;
}

// Botón del editor: sólo pasos ya guardados (sin id no hay filas que mover).
function openRescheduleDraftStep(step: any, i: number) {
	if (!step?.id) return;
	openReschedule(step.id, t('sequences.stepN', { n: i + 1 }), stepDates.value[i]);
}

async function confirmReschedule() {
	if (!retreatId.value || !reschedStep.value || !reschedDate.value) return;
	reschedSaving.value = true;
	try {
		const res = await sequenceStore.rescheduleStep(retreatId.value, reschedStep.value.id, {
			date: reschedDate.value,
			hour: reschedHour.value,
		});
		toast({ title: t('sequences.reschedDone', { n: res.affected }) });
		reschedDialog.value = false;
		await loadScheduled();
	} catch (e: any) {
		toast({ title: t('sequences.reschedError'), description: e?.message, variant: 'destructive' });
	} finally {
		reschedSaving.value = false;
	}
}

// B2 "encolar ya": fecha=ahora + el server encadena el procesamiento del
// retiro, así que los mensajes caen a la bandeja de una vez.
async function enqueueNow(stepId: string) {
	if (!retreatId.value) return;
	try {
		const res = await sequenceStore.rescheduleStep(retreatId.value, stepId, { immediate: true });
		toast({ title: t('sequences.enqueueDone', { n: res.processed ?? res.affected }) });
		await loadScheduled();
	} catch (e: any) {
		toast({ title: t('sequences.reschedError'), description: e?.message, variant: 'destructive' });
	}
}

// Problemas: buscador + orden.
const issuesSearch = ref('');
const issuesSort = ref<'recent' | 'name' | 'template' | 'status'>('recent');
const filteredIssues = computed(() => {
	const q = issuesSearch.value.trim().toLowerCase();
	let items = [...issues.value];
	// Chip de secuencia removible (badge clickeable de la lista de secuencias).
	if (issuesSequenceFilter.value) {
		items = items.filter((it: any) => it.sequenceId === issuesSequenceFilter.value);
	}
	if (q) {
		// Se busca sobre el nombre del participante, el tipo CRUDO y el nombre
		// LEGIBLE de la plantilla ("Bienvenida" debe matchear WALKER_WELCOME,
		// que es como se muestra en la lista), el motivo y el destinatario.
		items = items.filter((it: any) =>
			[
				it.participant?.firstName,
				it.participant?.lastName,
				it.templateType,
				templateLabel(it.templateType),
				it.error,
				it.recipientName,
			]
				.filter(Boolean)
				.join(' ')
				.toLowerCase()
				.includes(q),
		);
	}
	const name = (q: any) => `${q.participant?.lastName || ''} ${q.participant?.firstName || ''}`.trim();
	if (issuesSort.value === 'name') items.sort((a, b) => name(a).localeCompare(name(b), 'es'));
	else if (issuesSort.value === 'template')
		items.sort((a, b) => (a.templateType || '').localeCompare(b.templateType || ''));
	else if (issuesSort.value === 'status')
		items.sort((a, b) => (a.status || '').localeCompare(b.status || '')); // failed antes que skipped
	// 'recent' → mantiene el orden del backend (updatedAt desc)
	return items;
});
// #2: "cargar más" — cuando el total real supera lo cargado (cap de página).
const issuesLoadingMore = ref(false);
async function loadMoreIssues() {
	if (issuesLoadingMore.value) return;
	issuesLoadingMore.value = true;
	try {
		await sequenceStore.loadMoreIssues();
	} catch {
		toast({ title: t('sequences.loadMoreError'), variant: 'destructive' });
	} finally {
		issuesLoadingMore.value = false;
	}
}
// Renueva el texto de los pendientes de la bandeja con la plantilla vigente
// (tras editar una plantilla, el snapshot encolado queda con el texto anterior).
async function regenerateQueue() {
	if (!retreatId.value || regenerating.value) return;
	regenerating.value = true;
	try {
		const res = await sequenceStore.regenerateQueue(retreatId.value);
		toast({ title: t('sequences.regenerateDone', { n: res.regenerated }) });
	} catch {
		toast({ title: t('sequences.regenerateError'), variant: 'destructive' });
	} finally {
		regenerating.value = false;
	}
}

// Importar una plantilla global de secuencia a este retiro (queda inactiva).
const isImportOpen = ref(false);
const importModalRef = ref<HTMLElement | null>(null);
useModalA11y(isImportOpen, () => { isImportOpen.value = false; }, importModalRef);
const importLoading = ref(false);
const globalSequences = computed(() =>
	(globalSequenceStore.sequences || []).filter((s: any) => s.isActive),
);
async function openImport() {
	isImportOpen.value = true;
	await globalSequenceStore.fetchSequences();
}
async function importGlobal(globalSeq: any) {
	if (!retreatId.value || importLoading.value) return;
	// Dedupe: si ya existe una secuencia con el mismo nombre en el retiro, avisar.
	if (sequences.value.some((s: any) => s.name === globalSeq.name)) {
		toast({ title: t('sequences.alreadyImported', { name: globalSeq.name }), variant: 'destructive' });
		return;
	}
	importLoading.value = true;
	try {
		await globalSequenceStore.copyToRetreat(globalSeq.id, retreatId.value);
		await sequenceStore.fetchSequences(retreatId.value);
		toast({ title: t('sequences.importedInactive', { name: globalSeq.name }) });
		isImportOpen.value = false;
	} catch {
		toast({ title: t('sequences.importError'), variant: 'destructive' });
	} finally {
		importLoading.value = false;
	}
}

// #10: preview de los pasos ANTES de importar una plantilla global — el botón
// deja de ser a ciegas. Acordeón por fila en el modal de import.
const expandedImportId = ref<string | null>(null);
function toggleImportPreview(id: string) {
	expandedImportId.value = expandedImportId.value === id ? null : id;
}
// Offset legible según el ancla del trigger (misma semántica que
// computeScheduledFor del servidor): days_before_retreat es ANTES del inicio;
// el resto, DESPUÉS de su ancla.
function importOffsetText(trigger: string, offsetDays: number): string {
	const anchor = t('sequences.previewAnchor.' + trigger);
	const n = Math.abs(offsetDays);
	if (!n) return t('sequences.previewOffset.sameDay', { anchor });
	const isBefore = trigger === 'days_before_retreat' ? offsetDays > 0 : offsetDays < 0;
	return isBefore
		? t('sequences.previewOffset.before', { n, anchor })
		: t('sequences.previewOffset.after', { n, anchor });
}
// La plantilla LOCAL que resolverá el paso tras importar; null = el retiro no
// la tiene y el paso quedaría skipped al procesarse ("sin plantilla X").
function importTemplateFor(type: string): any | null {
	return templates.value.find((tpl: any) => tpl.type === type) || null;
}

// Panel de detalle del participante (al hacer clic en su nombre en la bandeja):
// notas, cartas/palancas, estado de seguimiento e historial de mensajes, para
// decidir con contexto si enviar u omitir.
const detailItem = ref<any>(null);
const isDetailOpen = computed(() => !!detailItem.value);
const detailModalRef = ref<HTMLElement | null>(null);
useModalA11y(isDetailOpen, closeDetail, detailModalRef);

function openDetail(item: any) {
	detailItem.value = item;
	sequenceStore.fetchDetail(item.id);
}
function closeDetail() {
	detailItem.value = null;
	sequenceStore.clearDetail();
}

// Vista previa del mensaje a enviar (snapshot resuelto al encolar).
const detailPreview = computed(() =>
	detail.value?.message?.resolvedContent
		? convertHtmlToWhatsApp(detail.value.message.resolvedContent)
		: '',
);

function fmtDate(d: string | Date | null | undefined): string {
	if (!d) return '';
	const dt = new Date(d);
	return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString();
}

async function dispatchFromDetail() {
	const item = detailItem.value;
	if (!item) return;
	closeDetail();
	await openWhatsapp(item);
}
async function skipFromDetail() {
	const item = detailItem.value;
	if (!item) return;
	// D5: misma confirmación que el botón de la bandeja (también es "omitir").
	if (!window.confirm(t('sequences.skipConfirm'))) return;
	closeDetail();
	await sequenceStore.skip(item.id);
}

// Resuelve teléfono + texto del pendiente (snapshot, con fallback de recálculo).
function buildWhatsappLink(item: any): { phone: string; text: string } | null {
	let rawPhone: string | undefined = item.resolvedContact || undefined;
	let text = item.resolvedContent ? convertHtmlToWhatsApp(item.resolvedContent) : '';
	if (!rawPhone || !text) {
		const tpl = templates.value.find((x: any) => x.type === item.templateType);
		const participant = item.participant;
		const target = item.recipientTarget || 'participant';
		let contactKey: string | undefined;
		if (target === 'emergencyContact1') {
			rawPhone = rawPhone || participant?.emergencyContact1CellPhone;
			contactKey = 'emergencyContact1';
		} else if (target === 'emergencyContact2') {
			rawPhone = rawPhone || participant?.emergencyContact2CellPhone;
			contactKey = 'emergencyContact2';
		} else {
			rawPhone = rawPhone || participant?.cellPhone;
		}
		if (!text) {
			const retreatData = retreatStore.selectedRetreat as unknown as RetreatData;
			const html = tpl
				? replaceAllVariables(tpl.message, participant as unknown as ParticipantData, retreatData, contactKey)
				: '';
			text = convertHtmlToWhatsApp(html);
		}
	}
	if (!rawPhone) return null;
	return { phone: sanitizePhoneForWhatsapp(rawPhone), text };
}

// Abre WhatsApp (deep-link) tras MARCAR el envío/apertura. El orden importa:
// window.open primero puede matar el request que marca (al saltar a la app el
// navegador cancela lo pendiente) y el ítem quedaba enviado-sin-marcar — el
// incidente de los 20 recordatorios del 2026-09-12. Se marca primero, y solo
// entonces se abre el enlace.
async function openWhatsapp(item: any) {
	const link = buildWhatsappLink(item);
	if (!link) {
		toast({ title: t('sequences.noPhone'), variant: 'destructive' });
		return;
	}
	try {
		await navigator.clipboard.writeText(link.text);
	} catch {
		/* no bloqueante */
	}
	// Con "envío automático" activado, marcar YA lo saca de la bandeja; si el
	// dispatch falla, NO abrimos WhatsApp (recrearíamos el incidente). Sin
	// auto-confirm solo registra la apertura y se confirma a mano con
	// "Ya lo envié".
	if (autoConfirmSend.value) {
		try {
			await sequenceStore.dispatch(item.id);
		} catch {
			toast({ title: t('sequences.dispatchError'), variant: 'destructive' });
			return;
		}
	} else {
		try {
			await sequenceStore.open(item.id);
		} catch {
			/* no bloqueante */
		}
	}
	const opened = window.open(
		`https://api.whatsapp.com/send?phone=${link.phone}&text=${encodeURIComponent(link.text)}`,
		'_blank',
		'noopener,noreferrer',
	);
	// Tras el await del dispatch Safari puede bloquear el popup (ya no es un
	// gesto de usuario directo): el texto quedó en el portapapeles y el ítem ya
	// está marcado — avisar cómo completar el envío a mano.
	if (!opened) {
		toast({ title: t('sequences.popupBlocked') });
	}
}

// Confirma el envío real (sale de la bandeja, queda registrado quién lo envió).
async function confirmSent(item: any) {
	try {
		await sequenceStore.dispatch(item.id);
	} catch {
		toast({ title: t('sequences.dispatchError'), variant: 'destructive' });
	}
}

// Re-encola un mensaje fallido (vuelve a la cola; lo procesa el cron / "Procesar ahora").
async function retryIssue(item: any) {
	try {
		await sequenceStore.retry(item.id);
		if (retreatId.value) await sequenceStore.fetchStats(retreatId.value);
		toast({ title: t('sequences.retryOk') });
	} catch {
		toast({ title: t('sequences.retryError'), variant: 'destructive' });
	}
}

// Descarta un mensaje con problema (no se envía ni reaparece).
async function discardIssue(item: any) {
	try {
		await sequenceStore.discard(item.id);
		if (retreatId.value) await sequenceStore.fetchStats(retreatId.value);
		toast({ title: t('sequences.discardOk') });
	} catch {
		toast({ title: t('sequences.discardError'), variant: 'destructive' });
	}
}

// Acciones masivas sobre los mensajes con problema (reenviar / descartar).
// D6: respetan lo que se VE — con búsqueda o chip de secuencia activos, sólo
// las filas filtradas; sin filtro, todo el retiro (el server lo resuelve).
const bulkBusy = ref(false);
const issuesFilterActive = computed(
	() => !!issuesSearch.value.trim() || !!issuesSequenceFilter.value,
);
async function bulkIssues(action: 'retry' | 'discard') {
	if (!retreatId.value || bulkBusy.value) return;
	const ids = issuesFilterActive.value
		? filteredIssues.value.map((it: any) => it.id)
		: undefined;
	const n = ids ? ids.length : issues.value.length;
	if (!n) return; // nada visible que tocar (evita un bulk-todo accidental)
	if (!window.confirm(t('sequences.bulkConfirm', { n }))) return;
	bulkBusy.value = true;
	try {
		const res = await sequenceStore.bulkResolveIssues(retreatId.value, action, ids);
		toast({ title: t('sequences.bulkDone', { n: res.affected }) });
	} catch {
		toast({ title: t('sequences.bulkError'), variant: 'destructive' });
	} finally {
		bulkBusy.value = false;
	}
}

// Abre el siguiente pendiente sin abrir aún (flujo rápido), respetando el
// filtro/búsqueda/orden actual (abre el siguiente de lo que ves).
function openNext() {
	const pool = filteredQueue.value;
	const next = pool.find((q: any) => !q.openedAt) || pool[0];
	if (next) openWhatsapp(next);
}

// Asignación: tomar para mí / soltar.
async function takeItem(item: any) {
	if (!myUserId.value) return;
	await sequenceStore.assign(item.id, myUserId.value);
}
async function releaseItem(item: any) {
	await sequenceStore.assign(item.id, null);
}

// Toggle de no-contacto desde el panel de detalle.
async function toggleDoNotContact() {
	const d = detail.value;
	if (!d || !retreatId.value) return;
	try {
		await sequenceStore.setDoNotContact(retreatId.value, d.participant.id, !d.participant.doNotContact);
	} catch {
		toast({ title: t('sequences.dncError'), variant: 'destructive' });
	}
}
</script>

<template>
	<div class="p-4 space-y-6">
		<div>
			<h1 class="text-2xl font-semibold">{{ t('sequences.title') }}</h1>
			<p class="text-gray-600 text-sm">{{ t('sequences.subtitle') }}</p>
		</div>

		<!-- Tabs: Secuencias / Programados / Bandeja WhatsApp / Problemas -->
		<div
			class="flex items-stretch border-b overflow-x-auto"
			role="tablist"
			:aria-label="t('sequences.title')"
			@keydown="onTablistKeydown"
		>
			<button
				type="button"
				role="tab"
				id="seq-tab-sequences"
				:aria-selected="activeTab === 'sequences'"
				aria-controls="seq-panel-sequences"
				class="shrink-0 justify-start px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap"
				:class="activeTab === 'sequences' ? 'border-purple-500 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
				@click="switchTab('sequences')"
			>
				<Send class="w-4 h-4" /> {{ t('sequences.tabSequences') }}
				<span class="text-xs bg-purple-100 text-purple-700 rounded-full px-1.5">{{ sequences.length }}</span>
			</button>
			<button
				type="button"
				role="tab"
				id="seq-tab-scheduled"
				:aria-selected="activeTab === 'scheduled'"
				aria-controls="seq-panel-scheduled"
				class="shrink-0 justify-start px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap"
				:class="activeTab === 'scheduled' ? 'border-blue-500 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
				@click="switchTab('scheduled')"
			>
				<CalendarDays class="w-4 h-4" /> {{ t('sequences.tabScheduled') }}
				<span class="text-xs bg-blue-100 text-blue-700 rounded-full px-1.5">{{ scheduledTabCount }}</span>
			</button>
			<button
				type="button"
				role="tab"
				id="seq-tab-pending"
				:aria-selected="activeTab === 'pending'"
				aria-controls="seq-panel-pending"
				class="shrink-0 justify-start px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap"
				:class="activeTab === 'pending' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
				@click="switchTab('pending')"
			>
				<MessageCircle class="w-4 h-4" /> {{ t('sequences.tabPending') }}
				<span class="text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">{{ queue.length }}</span>
			</button>
			<button
				type="button"
				role="tab"
				id="seq-tab-issues"
				:aria-selected="activeTab === 'issues'"
				aria-controls="seq-panel-issues"
				class="shrink-0 justify-start px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap"
				:class="activeTab === 'issues' ? 'border-red-500 text-red-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
				@click="switchTab('issues')"
			>
				<AlertTriangle class="w-4 h-4" /> {{ t('sequences.tabIssues') }}
				<span v-if="issuesTotal" class="text-xs bg-red-100 text-red-700 rounded-full px-1.5">{{ issuesTotal }}</span>
			</button>
		</div>

		<!-- Tab: Secuencias -->
		<div v-show="activeTab === 'sequences'" role="tabpanel" id="seq-panel-sequences" aria-labelledby="seq-tab-sequences">
			<!-- Barra de acciones -->
			<div class="flex items-center justify-between gap-2 mb-3">
				<p class="text-xs text-gray-500 whitespace-nowrap">
					{{ t('sequences.sequencesCount', { n: sequences.length }) }}
				</p>
				<div class="grid grid-cols-3 gap-2 sm:flex sm:gap-2">
					<Button variant="outline" size="sm" class="justify-center" @click="runNow">
						<Play class="w-4 h-4 sm:mr-1" />
						<span class="hidden sm:inline">{{ t('sequences.runNow') }}</span>
						<span class="sm:hidden">{{ t('sequences.runShort') }}</span>
					</Button>
					<Button variant="outline" size="sm" class="justify-center" @click="openImport">
						<Globe class="w-4 h-4 sm:mr-1" />
						<span class="hidden sm:inline">{{ t('sequences.importFromGlobal') }}</span>
						<span class="sm:hidden">{{ t('sequences.importShort') }}</span>
					</Button>
					<Button size="sm" class="justify-center" @click="openCreate">
						<Plus class="w-4 h-4 sm:mr-1" />
						<span class="hidden sm:inline">{{ t('sequences.new') }}</span>
						<span class="sm:hidden">{{ t('sequences.newShort') }}</span>
					</Button>
				</div>
			</div>
		<div v-if="sequences.length" class="border rounded-md divide-y overflow-hidden">
			<div v-for="seq in sequences" :key="seq.id" class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 p-3 hover:bg-gray-50 transition-colors">
				<div class="min-w-0">
					<div class="font-medium flex items-center gap-2">
						<span
							class="w-2 h-2 rounded-full shrink-0"
							:class="seq.isActive ? 'bg-green-500' : 'bg-gray-300'"
							:title="seq.isActive ? t('sequences.active') : t('sequences.inactive')"
						/>
						<span class="truncate">{{ seq.name }}</span>
						<span v-if="!seq.isActive" class="text-xs bg-gray-200 text-gray-600 rounded px-1.5 py-0.5 shrink-0">
							{{ t('sequences.inactive') }}
						</span>
					</div>
					<!-- D7: la descripción editada por fin se ve (1 línea, el title la completa). -->
					<div v-if="seq.description" class="text-xs text-gray-400 truncate" :title="seq.description">
						{{ seq.description }}
					</div>
					<div class="text-xs text-gray-500">
						{{ t('sequences.triggers.' + seq.trigger) }} · {{ t('sequences.audiences.' + seq.audience) }}
						· {{ t('sequences.stepCount', { count: seq.steps?.length || 0 }) }}
					</div>
					<!-- Métricas por secuencia. Los badges de programados y problemas son
					     clickeables (A5): filtran la pestaña correspondiente por secuencia. -->
					<div class="flex flex-wrap gap-1.5 mt-1.5 text-[11px]">
						<!-- programados = status 'pending' del API: mensajes materializados con
						     fecha futura; el cron los pasa a 'queued' el día que vencen. -->
						<button
							v-if="statusCount(seq.id, 'pending')"
							type="button"
							class="bg-blue-100 text-blue-700 rounded px-1.5 py-0.5 hover:bg-blue-200 transition-colors cursor-pointer"
							:title="t('sequences.stat.scheduledHint')"
							@click="openScheduledForSequence(seq)"
						>
							{{ t('sequences.stat.scheduled', { n: statusCount(seq.id, 'pending') }) }}
						</button>
						<span v-if="statusCount(seq.id, 'sent')" class="bg-green-100 text-green-700 rounded px-1.5 py-0.5">
							{{ t('sequences.stat.sent', { n: statusCount(seq.id, 'sent') }) }}
						</span>
						<span v-if="statusCount(seq.id, 'queued')" class="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
							{{ t('sequences.stat.queued', { n: statusCount(seq.id, 'queued') }) }}
						</span>
						<button
							v-if="statusCount(seq.id, 'skipped')"
							type="button"
							class="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 hover:bg-gray-200 transition-colors cursor-pointer"
							:title="t('sequences.stat.issuesHint')"
							@click="openIssuesForSequence(seq)"
						>
							{{ t('sequences.stat.skipped', { n: statusCount(seq.id, 'skipped') }) }}
						</button>
						<button
							v-if="statusCount(seq.id, 'failed')"
							type="button"
							class="bg-red-100 text-red-700 rounded px-1.5 py-0.5 hover:bg-red-200 transition-colors cursor-pointer"
							:title="t('sequences.stat.issuesHint')"
							@click="openIssuesForSequence(seq)"
						>
							{{ t('sequences.stat.failed', { n: statusCount(seq.id, 'failed') }) }}
						</button>
					</div>
				</div>
				<div class="flex items-center gap-1 shrink-0 self-end sm:self-auto">
					<Button
						variant="ghost"
						size="icon"
						:title="t('sequences.toggleActive')"
						:aria-label="t('sequences.toggleActive')"
						@click="toggleActive(seq)"
					>
						<Power class="w-4 h-4" :class="seq.isActive ? 'text-green-600' : 'text-gray-400'" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						:title="t('sequences.duplicate')"
						:aria-label="t('sequences.duplicate')"
						@click="duplicateSequence(seq)"
					>
						<Copy class="w-4 h-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						:title="t('sequences.edit')"
						:aria-label="t('sequences.edit')"
						@click="openEdit(seq)"
					>
						<Pencil class="w-4 h-4" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						class="text-red-500"
						:title="t('sequences.delete')"
						:aria-label="t('sequences.delete')"
						@click="askDelete(seq)"
					>
						<Trash2 class="w-4 h-4" />
					</Button>
				</div>
			</div>
		</div>
		<div v-else class="border border-dashed rounded-md p-8 text-center">
			<Send class="w-8 h-8 mx-auto text-gray-300" />
			<p class="text-sm text-gray-500 mt-2">{{ t('sequences.empty') }}</p>
			<Button size="sm" class="mt-3" @click="openCreate">
				<Plus class="w-4 h-4 mr-1" /> {{ t('sequences.new') }}
			</Button>
		</div>
		</div>

			<!-- Tab: Programados (mensajes materializados, con la fecha en que saldrán/salieron) -->
			<div v-show="activeTab === 'scheduled'" role="tabpanel" id="seq-panel-scheduled" aria-labelledby="seq-tab-scheduled">
				<!-- Filtros server-side: búsqueda con debounce + estado + orden -->
				<div class="flex items-center gap-2 mb-2 flex-wrap">
					<input
						v-model="schedSearch"
						type="search"
						:placeholder="t('sequences.searchPlaceholder')"
						class="flex-1 min-w-40 p-2 border rounded-md text-sm"
					/>
					<label class="flex items-center gap-1.5 text-xs text-gray-600">
						{{ t('sequences.schedStatusLabel') }}
						<select v-model="schedStatus" class="p-1 border rounded-md text-xs bg-white">
							<option v-for="s in SCHED_STATUSES" :key="s" :value="s">
								{{ t('sequences.statuses.' + s) }}
							</option>
						</select>
					</label>
					<label class="flex items-center gap-1.5 text-xs text-gray-600">
						{{ t('sequences.sortLabel') }}
						<select v-model="schedOrder" class="p-1 border rounded-md text-xs bg-white">
							<option value="scheduled">{{ t('sequences.sort.scheduled') }}</option>
							<option value="recent">{{ t('sequences.sort.recent') }}</option>
						</select>
					</label>
				</div>
				<!-- Chips de filtro activo: secuencia (badge clickeable de la lista) y
				     participante (click en su nombre de una fila, #9). -->
				<div v-if="schedSequenceFilter || schedParticipantFilter" class="flex items-center gap-2 mb-2 text-xs flex-wrap">
					<span v-if="schedSequenceFilter" class="inline-flex items-center gap-1 bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
						{{ seqName(schedSequenceFilter) }}
						<button
							type="button"
							class="hover:text-blue-900"
							:aria-label="t('sequences.clearFilter')"
							@click="clearSchedSequenceFilter"
						>
							<X class="w-3 h-3" />
						</button>
					</span>
					<span v-if="schedParticipantFilter" class="inline-flex items-center gap-1 bg-violet-100 text-violet-700 rounded-full px-2 py-0.5">
						{{ t('sequences.filter.participant', { name: schedParticipantFilter.name }) }}
						<button
							type="button"
							class="hover:text-violet-900"
							:aria-label="t('sequences.clearFilter')"
							@click="clearSchedParticipantFilter"
						>
							<X class="w-3 h-3" />
						</button>
					</span>
				</div>
				<p v-if="scheduledTimezone" class="text-[11px] text-gray-400 mb-2">
					{{ t('sequences.scheduledTzHint', { tz: scheduledTimezone }) }}
				</p>

				<div v-if="scheduledLoading" class="text-sm text-gray-500 border rounded-md p-4 text-center">
					{{ t('common.loading') }}
				</div>
				<div v-else-if="scheduled.length" class="border rounded-md divide-y">
					<div
						v-for="it in scheduled"
						:key="it.id"
						class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3"
					>
						<div class="min-w-0">
							<!-- #9: el nombre filtra el histórico del participante (mismo patrón
							     que el badge de secuencia). -->
							<button
								type="button"
								class="text-sm font-medium truncate hover:underline text-left"
								:title="t('sequences.filter.byParticipant', { name: it.participantName })"
								@click="openScheduledForParticipant(it)"
							>
								{{ it.participantName }}
							</button>
							<div class="text-xs text-gray-500 truncate">
								{{ templateLabel(it.templateType) }}
								<span v-if="it.stepOrder != null">· {{ t('sequences.stepN', { n: it.stepOrder + 1 }) }}</span>
								<span
									v-if="it.recipientTarget && it.recipientTarget !== 'participant'"
									class="text-amber-600"
								>
									· → {{ it.recipientName || t('sequences.recipients.' + it.recipientTarget) }}
								</span>
								<span v-if="seqName(it.sequenceId)">· {{ seqName(it.sequenceId) }}</span>
							</div>
							<div v-if="it.error" class="text-xs text-red-600 break-words">{{ it.error }}</div>
						</div>
						<div class="flex items-center flex-wrap sm:flex-nowrap gap-1.5 shrink-0">
							<span class="text-xs text-gray-700 whitespace-nowrap">{{ fmtScheduled(it.scheduledFor) }}</span>
							<span
								class="text-xs rounded px-1.5 py-0.5 shrink-0"
								:class="schedStatusClass(it.status)"
							>
								{{ t('sequences.statuses.' + it.status) }}
							</span>
							<span class="text-[10px] uppercase text-gray-400 shrink-0">
								{{ t('sequences.channels.' + it.channel) }}
							</span>
							<!-- M4: sólo pending (queued ya está materializado en la bandeja). -->
							<template v-if="it.status === 'pending'">
								<Button
									variant="outline"
									size="sm"
									class="h-6 px-1.5 text-[11px]"
									@click="openReschedule(
										it.stepId,
										[seqName(it.sequenceId), templateLabel(it.templateType)].filter(Boolean).join(' · '),
										it.scheduledFor,
									)"
								>
									<CalendarDays class="w-3 h-3" /> {{ t('sequences.reschedule') }}
								</Button>
								<Button
									variant="outline"
									size="sm"
									class="h-6 px-1.5 text-[11px]"
									@click="enqueueNow(it.stepId)"
								>
									<Send class="w-3 h-3" /> {{ t('sequences.enqueueNow') }}
								</Button>
							</template>
						</div>
					</div>
				</div>
				<div v-else class="text-sm text-gray-500 border rounded-md p-4 text-center">
					{{ t('sequences.scheduledEmpty') }}
				</div>

				<!-- Paginación server-side -->
				<div v-if="scheduledTotalPages > 1" class="flex items-center justify-center gap-3 mt-3 text-sm">
					<Button size="sm" variant="outline" :disabled="schedPage <= 1" @click="schedPage = schedPage - 1">‹</Button>
					<span class="text-gray-600">
						{{ t('sequences.pageOf', { page: schedPage, total: scheduledTotalPages }) }}
						· {{ t('sequences.scheduledTotal', { n: scheduledTotal }) }}
					</span>
					<Button
						size="sm"
						variant="outline"
						:disabled="schedPage >= scheduledTotalPages"
						@click="schedPage = schedPage + 1"
					>
						›
					</Button>
				</div>
			</div>

			<!-- Tab: Pendientes de WhatsApp -->
			<div v-show="activeTab === 'pending'" role="tabpanel" id="seq-panel-pending" aria-labelledby="seq-tab-pending">
				<!-- Buscador + (móvil) menú de acciones -->
				<div v-if="queue.length" class="flex items-center gap-2 mb-2">
					<input
						v-model="queueSearch"
						type="search"
						:placeholder="t('sequences.searchPlaceholder')"
						class="flex-1 min-w-0 p-2 border rounded-md text-sm"
					/>
					<div class="relative sm:hidden">
						<Button
							variant="outline"
							size="icon"
							:aria-label="t('sequences.moreActions')"
							@click="queueMenuOpen = !queueMenuOpen"
						>
							<MoreVertical class="w-4 h-4" />
						</Button>
						<div v-if="queueMenuOpen" class="fixed inset-0 z-10" @click="queueMenuOpen = false" />
						<div
							v-if="queueMenuOpen"
							class="absolute right-0 mt-1 z-20 w-64 bg-white border rounded-md shadow-lg p-3 space-y-3"
						>
							<label class="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
								<input type="checkbox" v-model="autoConfirmSend" class="rounded border-gray-300" />
								{{ t('sequences.autoConfirmSend') }}
							</label>
							<label class="block text-sm text-gray-700">
								{{ t('sequences.sortLabel') }}
								<select v-model="queueSort" class="w-full mt-1 p-2 border rounded-md text-sm bg-white">
									<option value="scheduled">{{ t('sequences.sort.scheduled') }}</option>
									<option value="recent">{{ t('sequences.sort.recent') }}</option>
									<option value="name">{{ t('sequences.sort.name') }}</option>
									<option value="template">{{ t('sequences.sort.template') }}</option>
								</select>
							</label>
							<label class="block text-sm text-gray-700">
								{{ t('sequences.filterLabel') }}
								<select v-model="queueAssignFilter" class="w-full mt-1 p-2 border rounded-md text-sm bg-white">
									<option value="all">{{ t('sequences.filter.all') }}</option>
									<option value="mine">{{ t('sequences.filter.mine') }}</option>
									<option value="unassigned">{{ t('sequences.filter.unassigned') }}</option>
								</select>
							</label>
							<Button
								size="sm"
								variant="outline"
								class="w-full justify-center"
								:disabled="regenerating"
								@click="regenerateQueue(); queueMenuOpen = false"
							>
								<RefreshCw class="w-4 h-4 mr-1" :class="regenerating ? 'animate-spin' : ''" />
								{{ t('sequences.regenerateQueue') }}
							</Button>
							<Button
								size="sm"
								variant="default"
								class="w-full justify-center"
								@click="openNext(); queueMenuOpen = false"
							>
								{{ t('sequences.openNext') }}
							</Button>
						</div>
					</div>
				</div>
				<!-- Controles inline (escritorio) -->
				<div v-if="queue.length" class="hidden sm:flex items-center justify-end flex-wrap gap-2 mb-2">
					<label class="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none mr-auto">
						<input type="checkbox" v-model="autoConfirmSend" class="rounded border-gray-300" />
						{{ t('sequences.autoConfirmSend') }}
					</label>
					<label class="flex items-center gap-1.5 text-xs text-gray-600">
						{{ t('sequences.sortLabel') }}
						<select v-model="queueSort" class="p-1 border rounded-md text-xs bg-white">
							<option value="scheduled">{{ t('sequences.sort.scheduled') }}</option>
							<option value="recent">{{ t('sequences.sort.recent') }}</option>
							<option value="name">{{ t('sequences.sort.name') }}</option>
							<option value="template">{{ t('sequences.sort.template') }}</option>
						</select>
					</label>
					<label class="flex items-center gap-1.5 text-xs text-gray-600">
						{{ t('sequences.filterLabel') }}
						<select v-model="queueAssignFilter" class="p-1 border rounded-md text-xs bg-white">
							<option value="all">{{ t('sequences.filter.all') }}</option>
							<option value="mine">{{ t('sequences.filter.mine') }}</option>
							<option value="unassigned">{{ t('sequences.filter.unassigned') }}</option>
						</select>
					</label>
					<Button size="sm" variant="ghost" :disabled="regenerating" @click="regenerateQueue">
						<RefreshCw class="w-4 h-4 mr-1" :class="regenerating ? 'animate-spin' : ''" />
						{{ t('sequences.regenerateQueue') }}
					</Button>
					<Button size="sm" variant="outline" @click="openNext">
						{{ t('sequences.openNext') }}
					</Button>
				</div>
				<div v-if="queue.length && filteredQueue.length" class="border rounded-md divide-y">
					<div v-for="item in pagedQueue" :key="item.id" class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3">
					<div class="min-w-0">
						<div class="font-medium text-sm truncate flex items-center gap-2">
							<button
								type="button"
								class="text-blue-600 hover:underline truncate"
								:title="t('sequences.viewDetail')"
								@click="openDetail(item)"
							>
								{{ item.participant?.firstName }} {{ item.participant?.lastName }}
							</button>
							<span
								v-if="item.followUpStatus"
								class="text-[10px] rounded px-1.5 py-0.5 shrink-0"
								:class="followUpBadgeClass(item.followUpStatus)"
							>
								{{ t('followUp.statuses.' + item.followUpStatus) }}
							</span>
							<span v-if="item.openedAt" class="text-[10px] rounded px-1.5 py-0.5 bg-blue-100 text-blue-700 shrink-0">
								{{ t('sequences.opened') }}
							</span>
						</div>
						<div class="text-xs text-gray-500">
							{{ templateLabel(item.templateType) }}
							<span v-if="item.scheduledFor">· {{ fmtScheduled(item.scheduledFor) }}</span>
							<span
								v-if="item.recipientTarget && item.recipientTarget !== 'participant'"
								class="text-amber-600"
							>
								· → {{ item.recipientName || t('sequences.recipients.' + item.recipientTarget) }}
							</span>
							<span v-if="item.assignedTo === myUserId" class="text-green-600">· {{ t('sequences.mine') }}</span>
							<span v-else-if="item.assignedTo" class="text-gray-400">· {{ t('sequences.assigned') }}</span>
						</div>
					</div>
					<div class="flex items-center flex-nowrap gap-1 sm:gap-1.5 sm:shrink-0">
						<button
							v-if="item.assignedTo === myUserId"
							type="button"
							class="text-xs text-gray-400 hover:underline shrink-0"
							@click="releaseItem(item)"
						>
							{{ t('sequences.release') }}
						</button>
						<button
							v-else-if="!item.assignedTo && myUserId"
							type="button"
							class="text-xs text-blue-600 hover:underline shrink-0"
							@click="takeItem(item)"
						>
							{{ t('sequences.take') }}
						</button>
						<Button size="sm" variant="outline" class="shrink-0 px-2 sm:px-3" @click="skipItem(item)">
							{{ t('sequences.skip') }}
						</Button>
						<Button
							size="sm"
							:variant="autoConfirmSend ? 'default' : 'outline'"
							class="shrink-0 px-2 sm:px-3"
							:title="autoConfirmSend ? t('sequences.openWhatsappAndSend') : t('sequences.openWhatsapp')"
							@click="openWhatsapp(item)"
						>
							<Send class="w-4 h-4 sm:mr-1" />
							<span class="hidden sm:inline">
								{{ autoConfirmSend ? t('sequences.openWhatsappAndSend') : t('sequences.openWhatsapp') }}
							</span>
						</Button>
						<Button v-if="!autoConfirmSend" size="sm" class="shrink-0 px-2 sm:px-3" @click="confirmSent(item)">
							<span class="hidden sm:inline">{{ t('sequences.markSent') }}</span>
							<span class="sm:hidden">{{ t('sequences.markSentShort') }}</span>
						</Button>
					</div>
				</div>
			</div>
			<div v-else-if="queue.length" class="text-sm text-gray-500 border rounded-md p-4 text-center">
				{{ t('sequences.searchNoResults') }}
			</div>
			<div v-else class="text-sm text-gray-500 border rounded-md p-4 text-center">
				{{ t('sequences.queueEmpty') }}
			</div>
				<!-- Paginación de pendientes -->
				<div v-if="queueTotalPages > 1" class="flex items-center justify-center gap-3 mt-3 text-sm">
					<Button size="sm" variant="outline" :disabled="queuePage <= 1" @click="queuePage = queuePage - 1">‹</Button>
					<span class="text-gray-600">{{ t('sequences.pageOf', { page: queuePage, total: queueTotalPages }) }}</span>
					<Button size="sm" variant="outline" :disabled="queuePage >= queueTotalPages" @click="queuePage = queuePage + 1">›</Button>
				</div>
			</div>

			<!-- Tab: Problemas (omitidos o fallidos, con su motivo) -->
			<div v-show="activeTab === 'issues'" role="tabpanel" id="seq-panel-issues" aria-labelledby="seq-tab-issues">
				<!-- Chip de secuencia (viene del badge clickeable de la lista) -->
				<div v-if="issuesSequenceFilter" class="flex items-center gap-2 mb-2 text-xs">
					<span class="inline-flex items-center gap-1 bg-red-100 text-red-700 rounded-full px-2 py-0.5">
						{{ seqName(issuesSequenceFilter) }}
						<button
							type="button"
							class="hover:text-red-900"
							:aria-label="t('sequences.clearFilter')"
							@click="issuesSequenceFilter = null"
						>
							<X class="w-3 h-3" />
						</button>
					</span>
				</div>
				<!-- Buscador + (móvil) menú de acciones -->
				<div v-if="issues.length" class="flex items-center gap-2 mb-2">
					<input
						v-model="issuesSearch"
						type="search"
						:placeholder="t('sequences.searchPlaceholder')"
						class="flex-1 min-w-0 p-2 border rounded-md text-sm"
					/>
					<div class="relative sm:hidden">
						<Button
							variant="outline"
							size="icon"
							:aria-label="t('sequences.moreActions')"
							@click="issuesMenuOpen = !issuesMenuOpen"
						>
							<MoreVertical class="w-4 h-4" />
						</Button>
						<div v-if="issuesMenuOpen" class="fixed inset-0 z-10" @click="issuesMenuOpen = false" />
						<div
							v-if="issuesMenuOpen"
							class="absolute right-0 mt-1 z-20 w-64 bg-white border rounded-md shadow-lg p-3 space-y-3"
						>
							<label class="block text-sm text-gray-700">
								{{ t('sequences.sortLabel') }}
								<select v-model="issuesSort" class="w-full mt-1 p-2 border rounded-md text-sm bg-white">
									<option value="recent">{{ t('sequences.sort.recent') }}</option>
									<option value="status">{{ t('sequences.sort.status') }}</option>
									<option value="name">{{ t('sequences.sort.name') }}</option>
									<option value="template">{{ t('sequences.sort.template') }}</option>
								</select>
							</label>
							<Button
								size="sm"
								variant="outline"
								class="w-full justify-center"
								:disabled="bulkBusy"
								@click="bulkIssues('retry'); issuesMenuOpen = false"
							>
								<RefreshCw class="w-4 h-4 mr-1" /> {{ t('sequences.bulkRetry') }}
							</Button>
							<Button
								size="sm"
								variant="ghost"
								class="w-full justify-center text-gray-500"
								:disabled="bulkBusy"
								@click="bulkIssues('discard'); issuesMenuOpen = false"
							>
								{{ t('sequences.bulkDiscard') }}
							</Button>
						</div>
					</div>
				</div>
				<!-- Controles inline (escritorio) -->
				<div v-if="issues.length" class="hidden sm:flex items-center justify-end flex-wrap gap-2 mb-2">
					<label class="flex items-center gap-1.5 text-xs text-gray-600 mr-auto">
						{{ t('sequences.sortLabel') }}
						<select v-model="issuesSort" class="p-1 border rounded-md text-xs bg-white">
							<option value="recent">{{ t('sequences.sort.recent') }}</option>
							<option value="status">{{ t('sequences.sort.status') }}</option>
							<option value="name">{{ t('sequences.sort.name') }}</option>
							<option value="template">{{ t('sequences.sort.template') }}</option>
						</select>
					</label>
					<Button size="sm" variant="outline" :disabled="bulkBusy" @click="bulkIssues('retry')">
						<RefreshCw class="w-4 h-4 mr-1" /> {{ t('sequences.bulkRetry') }}
					</Button>
					<Button size="sm" variant="ghost" class="text-gray-500" :disabled="bulkBusy" @click="bulkIssues('discard')">
						{{ t('sequences.bulkDiscard') }}
					</Button>
				</div>
				<div v-if="issues.length && filteredIssues.length" class="border rounded-md divide-y">
				<div v-for="it in filteredIssues" :key="it.id" class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3">
					<div class="min-w-0">
						<div class="text-sm truncate">
							<button
								type="button"
								class="text-blue-600 hover:underline"
								:title="t('sequences.viewDetail')"
								@click="openDetail(it)"
							>
								{{ it.participant?.firstName }} {{ it.participant?.lastName }}
							</button>
							· {{ templateLabel(it.templateType) }}
						</div>
						<div class="text-xs text-red-600 break-words">{{ it.error }}</div>
						<div v-if="remediationFor(it)" class="text-xs text-gray-600 mt-0.5 flex gap-1">
							<span class="font-medium shrink-0">{{ t('sequences.remediationLabel') }}:</span>
							<span>{{ remediationFor(it) }}</span>
						</div>
					</div>
					<div class="flex items-center flex-nowrap gap-1.5 sm:gap-2 sm:shrink-0">
						<span
							class="text-xs rounded px-2 py-0.5 shrink-0"
							:class="it.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'"
						>
							{{ t('sequences.statuses.' + it.status) }}
						</span>
						<Button
							v-if="it.status === 'failed' || it.status === 'skipped'"
							variant="outline"
							size="sm"
							class="h-7 px-2 text-xs shrink-0"
							@click="retryIssue(it)"
						>
							{{ t('sequences.retry') }}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							class="h-7 px-2 text-xs text-gray-500 shrink-0"
							@click="discardIssue(it)"
						>
							{{ t('sequences.discard') }}
						</Button>
					</div>
				</div>
				</div>
				<div v-else-if="issues.length" class="text-sm text-gray-500 border rounded-md p-4 text-center">
					{{ t('sequences.searchNoResults') }}
				</div>
				<div v-else class="text-sm text-gray-500 border rounded-md p-4 text-center">
					{{ t('sequences.issuesEmpty') }}
				</div>
				<!-- #2: quedan problemas sin cargar (cap de página) → siguiente página -->
				<div v-if="issues.length && issues.length < issuesTotal" class="flex justify-center mt-3">
					<Button size="sm" variant="outline" :disabled="issuesLoadingMore" @click="loadMoreIssues">
						{{ t('sequences.loadMore', { remaining: issuesTotal - issues.length }) }}
					</Button>
				</div>
			</div>

		<!-- Editor de secuencia -->
		<div
			v-if="isEditorOpen"
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
			@click.self="isEditorOpen = false"
		>
			<div
				ref="editorModalRef"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				:aria-label="draft.id ? t('sequences.editTitle') : t('sequences.newTitle')"
				class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col focus:outline-none"
			>
				<div class="flex items-center justify-between p-6 border-b">
					<h2 class="text-xl font-semibold">
						{{ draft.id ? t('sequences.editTitle') : t('sequences.newTitle') }}
					</h2>
					<Button
						variant="ghost"
						size="icon"
						:aria-label="t('sequences.close')"
						@click="isEditorOpen = false"
					>
						<X class="w-5 h-5" />
					</Button>
				</div>
				<div class="p-6 space-y-4 overflow-y-auto">
					<div>
						<label class="text-sm font-medium">{{ t('sequences.name') }}</label>
						<Input v-model="draft.name" class="mt-1" :placeholder="t('sequences.namePlaceholder')" />
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
						<div>
							<label class="text-sm font-medium">{{ t('sequences.trigger') }}</label>
							<select v-model="draft.trigger" class="w-full mt-1 p-2 border rounded-md text-sm" @change="onTriggerChange">
								<option v-for="tr in TRIGGERS" :key="tr" :value="tr">{{ t('sequences.triggers.' + tr) }}</option>
							</select>
						</div>
						<div>
							<label class="text-sm font-medium">{{ t('sequences.audience') }}</label>
							<select v-model="draft.audience" class="w-full mt-1 p-2 border rounded-md text-sm" @change="onAudienceChange">
								<option v-for="a in availableAudiences" :key="a" :value="a">{{ t('sequences.audiences.' + a) }}</option>
							</select>
						</div>
					</div>
					<!-- Opciones de envío -->
					<div class="rounded-lg border bg-gray-50 p-3 space-y-3">
						<div class="text-xs font-semibold uppercase tracking-wide text-gray-500">
							{{ t('sequences.optionsTitle') }}
						</div>
						<label class="flex items-start gap-2 text-sm">
							<input type="checkbox" v-model="draft.isActive" class="mt-0.5" />
							<span>
								{{ t('sequences.active') }}
								<span class="block text-xs text-gray-500">{{ t('sequences.activeHint') }}</span>
							</span>
						</label>
						<div class="flex items-center justify-between gap-3 text-sm">
							<span>
								{{ t('sequences.maxOverdueDays') }}
								<span class="block text-xs text-gray-500">{{ t('sequences.maxOverdueDaysHint') }}</span>
							</span>
							<input
								type="number"
								min="0"
								v-model.number="draft.maxOverdueDays"
								class="w-24 p-1.5 border rounded-md text-sm shrink-0"
								:placeholder="t('sequences.noLimit')"
							/>
						</div>
					</div>

					<!-- Pasos -->
					<div>
						<div class="flex items-center justify-between mb-1">
							<label class="text-sm font-medium">{{ t('sequences.steps') }}</label>
							<Button variant="outline" size="sm" @click="addStep">
								<Plus class="w-4 h-4 mr-1" /> {{ t('sequences.addStep') }}
							</Button>
						</div>
						<div v-if="draft.steps.length" class="space-y-3">
							<div v-for="(step, i) in draft.steps" :key="i" class="rounded-lg border bg-white p-3 space-y-3 shadow-sm">
								<div class="flex items-center justify-between gap-2">
									<div class="flex items-baseline gap-2 min-w-0">
										<span class="text-sm font-semibold text-gray-700 shrink-0">{{ t('sequences.stepN', { n: i + 1 }) }}</span>
										<!-- A4: fecha que tendría este paso para el participante de muestra,
										     en la TZ del retiro (resuelta por el servidor). -->
										<span v-if="stepDatesLoading" class="text-xs text-gray-400">…</span>
										<span
											v-else-if="stepDates.length"
											class="text-xs text-gray-500 truncate"
											:title="t('sequences.stepDateHint')"
										>
											→ {{ fmtStepDate(stepDates[i]) }}
										</span>
									</div>
									<div class="flex items-center gap-1 shrink-0">
										<!-- M4: reprogramar el paso materializado (sólo pasos guardados). -->
										<Button
											v-if="step.id"
											variant="ghost"
											size="icon"
											class="text-gray-500 -my-1"
											:title="t('sequences.reschedule')"
											@click="openRescheduleDraftStep(step, i)"
										>
											<Clock class="w-4 h-4" />
										</Button>
										<Button variant="ghost" size="icon" class="text-red-500 -my-1" @click="removeStep(i)">
											<Trash2 class="w-4 h-4" />
										</Button>
									</div>
								</div>
								<!-- Plantilla (filtrada por la audiencia del destinatario) -->
								<div>
									<label class="text-xs text-gray-500">{{ t('sequences.template') }}</label>
									<select v-model="step.templateType" class="w-full mt-1 p-2 border rounded-md text-sm">
										<option v-for="tpl in templatesForStep(step)" :key="tpl.id" :value="tpl.type">{{ tpl.name }}</option>
									</select>
								</div>
								<div class="grid grid-cols-2 md:grid-cols-6 gap-3">
									<div class="md:col-span-1">
										<label class="text-xs text-gray-500">{{ t('sequences.offsetDays') }}</label>
										<input type="number" min="0" v-model.number="step.offsetDays" class="w-full mt-1 p-2 border rounded-md text-sm" />
									</div>
									<div class="md:col-span-1">
										<label class="text-xs text-gray-500">{{ t('sequences.sendHour') }}</label>
										<input type="number" min="0" max="23" v-model.number="step.sendHour" class="w-full mt-1 p-2 border rounded-md text-sm" />
									</div>
									<div class="md:col-span-2">
										<label class="text-xs text-gray-500">{{ t('sequences.channel') }}</label>
										<select v-model="step.channel" class="w-full mt-1 p-2 border rounded-md text-sm">
											<option v-for="c in CHANNELS" :key="c" :value="c">{{ t('sequences.channels.' + c) }}</option>
										</select>
									</div>
									<div class="col-span-2 md:col-span-2">
										<label class="text-xs text-gray-500">{{ t('sequences.recipient') }}</label>
										<select v-model="step.recipientTarget" class="w-full mt-1 p-2 border rounded-md text-sm" @change="onAudienceChange">
											<option v-for="r in recipientOptions" :key="r" :value="r">{{ t('sequences.recipients.' + r) }}</option>
										</select>
									</div>
									<!-- Responsabilidad destino (cuando recipientTarget = responsibility) -->
									<div v-if="step.recipientTarget === 'responsibility'" class="col-span-2 md:col-span-6">
										<label class="text-xs text-gray-500">{{ t('sequences.recipientResponsibility') }}</label>
										<input
											v-model="step.recipientResponsibility"
											list="seq-responsibilities"
											class="w-full mt-1 p-2 border rounded-md text-sm"
											:placeholder="t('sequences.recipientResponsibilityPlaceholder')"
										/>
										<datalist id="seq-responsibilities">
											<option v-for="rn in responsibilityNames" :key="rn" :value="rn" />
										</datalist>
									</div>
								</div>
								<!-- Vista previa de ESTE paso, resuelta en el servidor -->
								<div class="border-t pt-2">
									<button
										type="button"
										class="text-xs text-blue-600 hover:underline"
										@click="previewStepIndex === i ? closeStepPreview() : openStepPreview(i)"
									>
										{{ previewStepIndex === i ? t('sequences.previewHide') : t('sequences.previewShow') }}
									</button>
									<div v-if="previewStepIndex === i" class="mt-2 space-y-1">
										<p v-if="previewLoading" class="text-xs text-gray-500">
											{{ t('sequences.previewLoading') }}
										</p>
										<p v-else-if="previewError" class="text-xs text-red-600">{{ previewError }}</p>
										<template v-else-if="previewResult">
											<p class="text-xs text-gray-500">
												{{ t('sequences.previewRecipient') }}:
												<span class="font-medium text-gray-700">
													{{ previewResult.recipientName || '—' }}
												</span>
												<span v-if="previewResult.recipientContact">
													· {{ previewResult.recipientContact }}
												</span>
											</p>
											<p
												v-if="previewResult.warning"
												class="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5"
											>
												{{ previewResult.warning }}
											</p>
											<pre
												v-if="previewResult.content"
												class="p-2 bg-gray-50 border rounded text-xs whitespace-pre-wrap font-sans"
											>{{ previewPlainText }}</pre>
											<p
												v-if="previewResult.emptyVariables.length"
												class="text-xs text-amber-700"
											>
												{{ t('sequences.previewEmptyVars') }}:
												{{ previewResult.emptyVariables.join(', ') }}
											</p>
										</template>
									</div>
								</div>

								<!-- Condición (opcional, colapsable) -->
								<div class="border-t pt-2">
									<button
										type="button"
										class="text-xs text-blue-600 hover:underline"
										@click="step.condOpen = !step.condOpen"
									>
										{{ step.condOpen ? t('sequences.condHide') : (hasCondition(step.condition) ? t('sequences.condEdit') : t('sequences.condAdd')) }}
									</button>
									<div v-show="step.condOpen" class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
										<div>
											<label class="text-xs text-gray-500">{{ t('sequences.condType') }}</label>
											<select v-model="step.condition.participantType" class="w-full mt-1 p-2 border rounded-md text-sm">
												<option :value="null">{{ t('sequences.condAny') }}</option>
												<option v-for="ct in CONDITION_TYPES" :key="ct" :value="ct">{{ t('sequences.condTypes.' + ct) }}</option>
											</select>
										</div>
										<div>
											<label class="text-xs text-gray-500">{{ t('sequences.condPayment') }}</label>
											<select v-model="step.condition.paymentStatus" class="w-full mt-1 p-2 border rounded-md text-sm">
												<option :value="null">{{ t('sequences.condAny') }}</option>
												<option v-for="ps in CONDITION_PAYMENTS" :key="ps" :value="ps">{{ t('sequences.payments.' + ps) }}</option>
											</select>
										</div>
										<div>
											<label class="text-xs text-gray-500">{{ t('sequences.condAttendance') }}</label>
											<select v-model="step.condition.attendanceFilter" class="w-full mt-1 p-2 border rounded-md text-sm">
												<option value="all">{{ t('sequences.condAny') }}</option>
												<option v-for="at in CONDITION_ATTENDANCE" :key="at" :value="at">{{ t('sequences.attendanceStates.' + at) }}</option>
											</select>
										</div>
									</div>
								</div>
							</div>
						</div>
						<p v-else class="text-xs text-gray-500 border border-dashed rounded-md p-4 text-center">{{ t('sequences.noSteps') }}</p>
					</div>

					<!-- Aviso: pasos cuyo tipo de plantilla no existe en el retiro -->
					<div
						v-if="stepsWithMissingTemplate.length"
						class="bg-yellow-50 border border-yellow-200 rounded-md p-2 text-xs text-yellow-800"
					>
						{{ t('sequences.missingTemplate', { count: stepsWithMissingTemplate.length }) }}
					</div>

					<!-- Participante de muestra para las vistas previas por paso -->
					<div v-if="participantStore.participants?.length">
						<label class="text-xs text-gray-500">{{ t('sequences.previewParticipant') }}</label>
						<select v-model="previewParticipantId" class="w-full mt-1 p-2 border rounded-md text-sm">
							<option value="">{{ t('sequences.previewFirstParticipant') }}</option>
							<option v-for="p in participantStore.participants" :key="p.id" :value="p.id">
								{{ p.firstName }} {{ p.lastName }}
							</option>
						</select>
					</div>
				</div>
				<div class="flex items-center justify-end gap-2 p-6 border-t bg-gray-50">
					<Button variant="outline" @click="isEditorOpen = false">{{ t('common.actions.cancel') }}</Button>
					<Button :disabled="!draft.name.trim() || draft.steps.length === 0" @click="saveDraft">
						{{ t('common.actions.save') }}
					</Button>
				</div>
			</div>
		</div>

		<!-- Importar de plantilla global -->
		<div
			v-if="isImportOpen"
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
			@click.self="isImportOpen = false"
		>
			<div
				ref="importModalRef"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				:aria-label="t('sequences.importTitle')"
				class="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col focus:outline-none"
			>
				<div class="flex items-center justify-between p-5 border-b">
					<div>
						<h2 class="text-lg font-semibold">{{ t('sequences.importTitle') }}</h2>
						<p class="text-xs text-gray-500">{{ t('sequences.importHint') }}</p>
					</div>
					<Button
						variant="ghost"
						size="icon"
						:aria-label="t('sequences.close')"
						@click="isImportOpen = false"
					>
						<X class="w-5 h-5" />
					</Button>
				</div>
				<div class="p-5 overflow-y-auto">
					<div v-if="globalSequences.length" class="border rounded-md divide-y">
						<div v-for="g in globalSequences" :key="g.id" class="p-3">
							<div class="flex items-center justify-between gap-3">
								<div class="min-w-0">
									<div class="font-medium text-sm truncate">{{ g.name }}</div>
									<div class="text-xs text-gray-500">
										{{ t('sequences.triggers.' + g.trigger) }} · {{ t('sequences.audiences.' + g.audience) }}
										· {{ t('sequences.stepCount', { count: g.steps?.length || 0 }) }}
									</div>
								</div>
								<div class="flex items-center gap-1 shrink-0">
									<Button
										size="sm"
										variant="outline"
										:aria-expanded="expandedImportId === g.id"
										@click="toggleImportPreview(g.id)"
									>
										<ChevronDown
											class="w-3.5 h-3.5 transition-transform"
											:class="expandedImportId === g.id ? 'rotate-180' : ''"
										/>
										{{ t('sequences.previewSteps') }}
									</Button>
									<Button size="sm" :disabled="importLoading" @click="importGlobal(g)">
										{{ t('sequences.import') }}
									</Button>
								</div>
							</div>
							<!-- #10: los pasos que traerá la importación. El tipo de plantilla se
							     resuelve al nombre local; en ámbar si el retiro NO la tiene (ese paso
							     quedaría skipped al procesarse). -->
							<div v-if="expandedImportId === g.id" class="mt-2 border-t pt-2 space-y-1">
								<div
									v-for="(st, i) in g.steps || []"
									:key="i"
									class="text-xs text-gray-600 flex flex-wrap items-baseline gap-x-2"
								>
									<span class="text-gray-400">{{ i + 1 }}.</span>
									<span :class="importTemplateFor(st.templateType) ? '' : 'text-amber-600 font-medium'">
										{{ templateLabel(st.templateType) }}
									</span>
									<span>· {{ importOffsetText(g.trigger, st.offsetDays) }}</span>
									<span>· {{ st.sendHour }}:00</span>
									<span>· {{ t('sequences.channels.' + st.channel) }}</span>
									<span
										v-if="st.recipientTarget && st.recipientTarget !== 'participant'"
										class="text-amber-600"
									>
										· → {{ t('sequences.recipients.' + st.recipientTarget) }}
									</span>
									<span v-if="st.condition && Object.keys(st.condition).length" class="text-gray-400">
										· {{ t('sequences.previewCondition') }}
									</span>
									<span v-if="!importTemplateFor(st.templateType)" class="text-amber-600">
										· {{ t('sequences.previewMissingTemplate') }}
									</span>
								</div>
							</div>
						</div>
					</div>
					<div v-else class="text-sm text-gray-500 text-center py-6">
						{{ t('sequences.noGlobal') }}
					</div>
				</div>
			</div>
		</div>

		<!-- Detalle del participante (decidir si enviar u omitir) -->
		<div
			v-if="isDetailOpen"
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
			@click.self="closeDetail"
		>
			<div
				ref="detailModalRef"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				:aria-label="t('sequences.detailTitle')"
				class="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col focus:outline-none"
			>
				<div class="flex items-center justify-between p-5 border-b">
					<div class="min-w-0">
						<h2 class="text-lg font-semibold truncate">
							{{ detailItem?.participant?.firstName }} {{ detailItem?.participant?.lastName }}
						</h2>
						<p class="text-xs text-gray-500">{{ t('sequences.detailTitle') }}</p>
					</div>
					<Button variant="ghost" size="icon" :aria-label="t('sequences.close')" @click="closeDetail">
						<X class="w-5 h-5" />
					</Button>
				</div>

				<div class="p-5 space-y-4 overflow-y-auto text-sm">
					<div v-if="detailLoading" class="text-gray-500 text-center py-6">
						{{ t('common.loading') }}
					</div>
					<template v-else-if="detail">
						<!-- Estado de seguimiento -->
						<div>
							<div class="text-xs font-medium text-gray-500 mb-1">{{ t('sequences.followUpSection') }}</div>
							<div v-if="detail.followUp" class="flex items-center gap-2">
								<span
									class="text-[11px] rounded px-1.5 py-0.5"
									:class="followUpBadgeClass(detail.followUp.status)"
								>
									{{ t('followUp.statuses.' + detail.followUp.status) }}
								</span>
								<span v-if="detail.followUp.note" class="text-gray-600">{{ detail.followUp.note }}</span>
							</div>
							<div v-else class="text-gray-400">{{ t('sequences.noFollowUp') }}</div>
						</div>

						<!-- Mensaje a enviar -->
						<div>
							<div class="text-xs font-medium text-gray-500 mb-1">
								{{ t('sequences.messageToSend') }}
								<span class="text-gray-400">· {{ templateLabel(detail.message.templateType) }}</span>
								<span v-if="detail.message.scheduledFor" class="text-gray-400">
									· {{ fmtScheduled(detail.message.scheduledFor) }}
								</span>
								<span
									v-if="detail.message.recipientTarget !== 'participant'"
									class="text-amber-600"
								>
									· → {{ detail.message.recipientName || t('sequences.recipients.' + detail.message.recipientTarget) }}
								</span>
							</div>
							<pre
								v-if="detailPreview"
								class="p-2 bg-gray-50 border rounded text-xs whitespace-pre-wrap font-sans max-h-40 overflow-y-auto"
							>{{ detailPreview }}</pre>
							<div v-else class="text-gray-400">{{ t('sequences.noPreview') }}</div>
						</div>

						<!-- Cartas / palancas -->
						<div>
							<div class="text-xs font-medium text-gray-500 mb-1">{{ t('sequences.palancasSection') }}</div>
							<div class="space-y-0.5">
								<div>
									{{ t('sequences.palancasRequested') }}:
									<span class="font-medium">
										{{ detail.palancas.requested ? t('common.yes') : t('common.no') }}
									</span>
								</div>
								<div v-if="detail.palancas.received" class="text-gray-700">
									<span class="text-gray-500">{{ t('sequences.palancasReceived') }}:</span>
									{{ detail.palancas.received }}
								</div>
								<div v-if="detail.palancas.notes" class="text-gray-600">{{ detail.palancas.notes }}</div>
							</div>
						</div>

						<!-- Notas del participante -->
						<div>
							<div class="text-xs font-medium text-gray-500 mb-1">{{ t('sequences.notesSection') }}</div>
							<div v-if="detail.participant.notes" class="text-gray-700 whitespace-pre-wrap">
								{{ detail.participant.notes }}
							</div>
							<div v-else class="text-gray-400">{{ t('sequences.noNotes') }}</div>
						</div>

						<!-- Mensajes ya enviados -->
						<div>
							<div class="text-xs font-medium text-gray-500 mb-1">{{ t('sequences.communicationsSection') }}</div>
							<ul v-if="detail.communications.length" class="divide-y border rounded-md">
								<li
									v-for="c in detail.communications"
									:key="c.id"
									class="flex items-center justify-between gap-2 px-2 py-1.5"
								>
									<span class="truncate">
										<span class="uppercase text-[10px] text-gray-500 mr-1">{{ c.messageType }}</span>
										{{ c.templateName || c.subject || '—' }}
									</span>
									<span class="text-xs text-gray-400 shrink-0">{{ fmtDate(c.sentAt) }}</span>
								</li>
							</ul>
							<div v-else class="text-gray-400">{{ t('sequences.noCommunications') }}</div>
						</div>

						<!-- Lista de no-contacto (opt-out) -->
						<label class="flex items-center gap-2 text-sm border-t pt-3">
							<input
								type="checkbox"
								:checked="detail.participant.doNotContact"
								@change="toggleDoNotContact"
							/>
							{{ t('sequences.doNotContact') }}
						</label>
					</template>
				</div>

				<div class="flex items-center justify-end gap-2 p-4 border-t bg-gray-50">
					<Button variant="outline" @click="skipFromDetail">{{ t('sequences.skip') }}</Button>
					<Button @click="dispatchFromDetail">
						<Send class="w-4 h-4 mr-1" /> {{ t('sequences.openWhatsapp') }}
					</Button>
				</div>
			</div>
		</div>

		<!-- Confirmación de eliminación -->
		<div
			v-if="seqToDelete"
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
			@click.self="seqToDelete = null"
		>
			<div
				ref="deleteModalRef"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				:aria-label="t('sequences.deleteTitle')"
				class="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 focus:outline-none"
			>
				<h2 class="text-lg font-semibold">{{ t('sequences.deleteTitle') }}</h2>
				<p class="text-sm text-gray-600 mt-1">
					{{ t('sequences.deleteConfirm', { name: seqToDelete.name }) }}
				</p>
				<div class="flex justify-end gap-2 mt-4">
					<Button variant="outline" @click="seqToDelete = null">{{ t('common.actions.cancel') }}</Button>
					<Button variant="destructive" @click="confirmDelete">{{ t('common.actions.delete') }}</Button>
				</div>
			</div>
		</div>

		<!-- M4: diálogo de reprogramación de un paso (mueve todos sus pending) -->
		<div
			v-if="reschedDialog"
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
			@click.self="reschedDialog = false"
		>
			<div
				ref="reschedModalRef"
				role="dialog"
				aria-modal="true"
				tabindex="-1"
				:aria-label="t('sequences.reschedTitle')"
				class="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 focus:outline-none"
			>
				<h2 class="text-lg font-semibold">{{ t('sequences.reschedTitle') }}</h2>
				<p class="text-sm text-gray-600 mt-1">
					{{ t('sequences.reschedHint', { name: reschedStep?.label }) }}
				</p>
				<div class="grid grid-cols-2 gap-3 mt-4">
					<div>
						<label class="text-xs text-gray-500">{{ t('sequences.reschedDate') }}</label>
						<input
							type="date"
							v-model="reschedDate"
							class="w-full mt-1 p-2 border rounded-md text-sm"
						/>
					</div>
					<div>
						<label class="text-xs text-gray-500">{{ t('sequences.reschedHour') }}</label>
						<input
							type="number"
							min="0"
							max="23"
							v-model.number="reschedHour"
							class="w-full mt-1 p-2 border rounded-md text-sm"
						/>
					</div>
				</div>
				<p class="text-xs text-gray-400 mt-1">
					{{ t('sequences.reschedTzHint', { tz: retreatTimezone }) }}
				</p>
				<p v-if="reschedIsPast" class="text-xs text-amber-600 mt-2 flex items-start gap-1">
					<AlertTriangle class="w-3.5 h-3.5 shrink-0 mt-0.5" />
					{{ t('sequences.reschedPast') }}
				</p>
				<div class="flex justify-end gap-2 mt-4">
					<Button variant="outline" :disabled="reschedSaving" @click="reschedDialog = false">
						{{ t('common.actions.cancel') }}
					</Button>
					<Button :disabled="reschedSaving || !reschedDate" @click="confirmReschedule">
						{{ reschedSaving ? '…' : t('sequences.reschedule') }}
					</Button>
				</div>
			</div>
		</div>
	</div>
</template>
