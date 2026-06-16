<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast, Button, Input } from '@repo/ui';
import { Plus, Trash2, X, Play, Pencil, Send, Clock, AlertTriangle, Globe, RefreshCw, MoreVertical } from 'lucide-vue-next';
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
import { getMessageTemplateAudience } from '@repo/types';

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

const { sequences, queue, stats, issues, detail, detailLoading } = storeToRefs(sequenceStore);

// Filtros disponibles para la condición de un paso (subconjunto de SegmentFilters).
const CONDITION_TYPES = ['walker', 'server', 'waiting', 'partial_server'] as const;
const CONDITION_PAYMENTS = ['paid', 'partial', 'unpaid', 'overpaid', 'scholarship'] as const;
const CONDITION_ATTENDANCE = ['pending', 'confirmed', 'declined'] as const;
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

const TRIGGERS = ['participant_created', 'days_before_retreat', 'days_after_retreat', 'birthday'] as const;
const AUDIENCES = ['all', 'walker', 'server', 'table_leaders', 'responsables'] as const;
const CHANNELS = ['email', 'whatsapp'] as const;

// Audiencias válidas según el disparador. "Al registrarse" solo aplica a quien
// se registra (caminante/servidor); líderes/responsables se asignan después.
const AUDIENCES_BY_TRIGGER: Record<string, readonly string[]> = {
	participant_created: ['walker', 'server'],
};
const availableAudiences = computed<string[]>(() => {
	const base = [...(AUDIENCES_BY_TRIGGER[draft.value.trigger] ?? AUDIENCES)];
	// Incluir el valor actual si no está (no romper secuencias existentes, p.ej. 'all').
	return base.includes(draft.value.audience) ? base : [draft.value.audience, ...base];
});
// Al cambiar audiencia: si la plantilla de un paso ya no corresponde a la
// categoría del destinatario, reasignarla a la primera válida (evita que quede
// "Bienvenida Caminante" al pasar a Servidores).
function onAudienceChange() {
	for (const step of draft.value.steps) {
		const aud = recipientAudience(step);
		if (!aud) continue;
		if (audienceMatches(getMessageTemplateAudience(step.templateType), aud)) continue;
		// Preferir misma categoría → luego 'participant' (si aplica) → luego general.
		const both = aud === 'walker' || aud === 'server';
		const first =
			usableTemplates.value.find((t: any) => getMessageTemplateAudience(t.type) === aud) ||
			(both && usableTemplates.value.find((t: any) => getMessageTemplateAudience(t.type) === 'participant')) ||
			usableTemplates.value.find((t: any) => getMessageTemplateAudience(t.type) === 'general');
		if (first) step.templateType = first.type;
	}
}
// Al cambiar el disparador (acción del usuario), corrige la audiencia si quedó
// inválida y revalida las plantillas.
function onTriggerChange() {
	const base = AUDIENCES_BY_TRIGGER[draft.value.trigger] ?? AUDIENCES;
	if (!base.includes(draft.value.audience)) draft.value.audience = base[0] as any;
	onAudienceChange();
}
const RECIPIENT_TARGETS = [
	'participant',
	'emergencyContact1',
	'emergencyContact2',
	'inviter',
	'tableLeader',
	'responsibility',
] as const;

// "Enviar a" ordenado por relevancia según el enrolamiento (más usados primero),
// pero la lista es completa (flexible): cualquier destinatario sigue disponible.
const recipientOptions = computed<string[]>(() => {
	const aud = draft.value.audience;
	if (aud === 'walker' || aud === 'all') {
		return ['participant', 'inviter', 'emergencyContact1', 'emergencyContact2', 'tableLeader', 'responsibility'];
	}
	// server / table_leaders / responsables → primero participante, líder y responsable
	return ['participant', 'tableLeader', 'responsibility', 'inviter', 'emergencyContact1', 'emergencyContact2'];
});

// Audiencia de plantilla que corresponde al DESTINATARIO de un paso (para filtrar
// las plantillas mostradas). Regla: el filtro sigue al "enviar a", no al enrolamiento.
function recipientAudience(step: { recipientTarget: string }): string | null {
	const t = step.recipientTarget;
	if (t === 'inviter' || t === 'emergencyContact1' || t === 'emergencyContact2') return 'family';
	if (t === 'tableLeader') return 'table_leader';
	if (t === 'responsibility') return 'responsible';
	// participant → audiencia derivada del enrolamiento
	const byAudience: Record<string, string | null> = {
		walker: 'walker',
		server: 'server',
		table_leaders: 'table_leader',
		responsables: 'responsible',
		all: null,
	};
	return byAudience[draft.value.audience] ?? null;
}

// Plantillas mostradas para un paso: las de la audiencia del destinatario + general
// + la actualmente seleccionada (para no perderla al editar). 'all' (null) = todas.
// ¿La audiencia de una plantilla aplica a la audiencia del destinatario? Las
// plantillas 'participant' (ambos tipos) valen para caminantes y servidores.
function audienceMatches(a: string, aud: string): boolean {
	return a === aud || a === 'general' || (a === 'participant' && (aud === 'walker' || aud === 'server'));
}

function templatesForStep(step: { recipientTarget: string; templateType: string }) {
	const aud = recipientAudience(step);
	if (!aud) return usableTemplates.value;
	return usableTemplates.value.filter(
		(tpl: any) => audienceMatches(getMessageTemplateAudience(tpl.type), aud) || tpl.type === step.templateType,
	);
}

type RecipientTarget = (typeof RECIPIENT_TARGETS)[number];

interface StepCondition {
	participantType?: string | null;
	paymentStatus?: string | null;
	attendanceFilter?: string;
}
interface StepDraft {
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

// ¿El paso tiene alguna condición configurada?
function hasCondition(c: StepCondition): boolean {
	return !!(c.participantType || c.paymentStatus || (c.attendanceFilter && c.attendanceFilter !== 'all'));
}
interface SequenceDraft {
	id?: string;
	name: string;
	description: string;
	trigger: (typeof TRIGGERS)[number];
	audience: (typeof AUDIENCES)[number];
	isActive: boolean;
	maxOverdueDays: number | null;
	steps: StepDraft[];
}

// Convierte el objeto condición del editor en SegmentFilters (omitiendo vacíos),
// o undefined si no hay ninguna condición.
function conditionToFilters(c: StepCondition): Record<string, unknown> | undefined {
	const out: Record<string, unknown> = {};
	if (c.participantType) out.participantType = c.participantType;
	if (c.paymentStatus) out.paymentStatus = c.paymentStatus;
	if (c.attendanceFilter && c.attendanceFilter !== 'all') out.attendanceFilter = c.attendanceFilter;
	return Object.keys(out).length ? out : undefined;
}
function filtersToCondition(f: any): StepCondition {
	return {
		participantType: f?.participantType ?? null,
		paymentStatus: f?.paymentStatus ?? null,
		attendanceFilter: f?.attendanceFilter ?? 'all',
	};
}

const isEditorOpen = ref(false);
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

async function load() {
	if (!retreatId.value) return;
	participantStore.filters.retreatId = retreatId.value;
	await Promise.all([
		sequenceStore.fetchSequences(retreatId.value),
		sequenceStore.fetchQueue(retreatId.value),
		sequenceStore.fetchStats(retreatId.value),
		templateStore.fetchTemplates(retreatId.value),
		participantStore.fetchParticipants().catch(() => {}),
		responsabilityStore.fetchResponsibilities(retreatId.value, { silent: true }).catch(() => {}),
	]);
}

onMounted(load);
watch(retreatId, load);

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

// Preview del primer paso resuelto con un participante de ejemplo.
const previewText = computed(() => {
	const step = draft.value.steps[0];
	if (!step || !sampleParticipant.value) return '';
	const tpl = usableTemplates.value.find((x: any) => x.type === step.templateType);
	if (!tpl) return '';
	const retreatData = retreatStore.selectedRetreat as unknown as RetreatData;
	const contactKey =
		step.recipientTarget === 'participant' ? undefined : step.recipientTarget;
	const html = replaceAllVariables(
		tpl.message,
		sampleParticipant.value as unknown as ParticipantData,
		retreatData,
		contactKey,
	);
	return convertHtmlToWhatsApp(html);
});
function removeStep(i: number) {
	draft.value.steps.splice(i, 1);
}

async function saveDraft() {
	if (!draft.value.name.trim() || !retreatId.value) return;
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
		if (draft.value.id) {
			await sequenceStore.update(draft.value.id, payload);
		} else {
			await sequenceStore.create(payload);
		}
		toast({ title: t('sequences.saved') });
		isEditorOpen.value = false;
	} catch {
		toast({ title: t('sequences.saveError'), variant: 'destructive' });
	}
}

// Confirmación antes de eliminar (un clic ya no borra directo).
const seqToDelete = ref<any>(null);
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

// Tabs de la página (secuencias / pendientes / problemas), paginación y orden.
const activeTab = ref<'sequences' | 'pending' | 'issues'>('sequences');
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

// Problemas: buscador + orden.
const issuesSearch = ref('');
const issuesSort = ref<'recent' | 'name' | 'template' | 'status'>('recent');
const filteredIssues = computed(() => {
	const q = issuesSearch.value.trim().toLowerCase();
	let items = [...issues.value];
	if (q) {
		items = items.filter((it: any) =>
			[it.participant?.firstName, it.participant?.lastName, it.templateType, it.error]
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

// Panel de detalle del participante (al hacer clic en su nombre en la bandeja):
// notas, cartas/palancas, estado de seguimiento e historial de mensajes, para
// decidir con contexto si enviar u omitir.
const detailItem = ref<any>(null);
const isDetailOpen = computed(() => !!detailItem.value);

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

// Abre WhatsApp (deep-link) y registra la APERTURA (≠ enviado). El ítem sigue en
// la bandeja hasta que el coordinador confirme el envío con "Ya lo envié".
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
	window.open(
		`https://api.whatsapp.com/send?phone=${link.phone}&text=${encodeURIComponent(link.text)}`,
		'_blank',
	);
	try {
		// Con "envío automático" activado, abrir WhatsApp ya lo marca como enviado
		// (sale de la bandeja); si no, solo registra la apertura y se confirma a mano.
		if (autoConfirmSend.value) {
			await sequenceStore.dispatch(item.id);
		} else {
			await sequenceStore.open(item.id);
		}
	} catch {
		/* no bloqueante */
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

// Acciones masivas sobre todos los mensajes con problema (reenviar / descartar).
const bulkBusy = ref(false);
async function bulkIssues(action: 'retry' | 'discard') {
	if (!retreatId.value || bulkBusy.value) return;
	if (!window.confirm(t('sequences.bulkConfirm', { n: issues.length }))) return;
	bulkBusy.value = true;
	try {
		const res = await sequenceStore.bulkResolveIssues(retreatId.value, action);
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

		<!-- Tabs: Secuencias / Pendientes / Problemas -->
		<div class="flex items-stretch border-b">
			<button
				type="button"
				class="flex-1 sm:flex-none justify-center sm:justify-start min-w-0 px-2 sm:px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap"
				:class="activeTab === 'sequences' ? 'border-purple-500 text-purple-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
				@click="activeTab = 'sequences'"
			>
				<Send class="w-4 h-4" /> {{ t('sequences.tabSequences') }}
				<span class="text-xs bg-purple-100 text-purple-700 rounded-full px-1.5">{{ sequences.length }}</span>
			</button>
			<button
				type="button"
				class="flex-1 sm:flex-none justify-center sm:justify-start min-w-0 px-2 sm:px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap"
				:class="activeTab === 'pending' ? 'border-amber-500 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
				@click="activeTab = 'pending'"
			>
				<Clock class="w-4 h-4" /> {{ t('sequences.tabPending') }}
				<span class="text-xs bg-amber-100 text-amber-700 rounded-full px-1.5">{{ queue.length }}</span>
			</button>
			<button
				type="button"
				class="flex-1 sm:flex-none justify-center sm:justify-start min-w-0 px-2 sm:px-3 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 whitespace-nowrap"
				:class="activeTab === 'issues' ? 'border-red-500 text-red-700' : 'border-transparent text-gray-500 hover:text-gray-700'"
				@click="activeTab = 'issues'"
			>
				<AlertTriangle class="w-4 h-4" /> {{ t('sequences.tabIssues') }}
				<span v-if="issues.length" class="text-xs bg-red-100 text-red-700 rounded-full px-1.5">{{ issues.length }}</span>
			</button>
		</div>

		<!-- Tab: Secuencias -->
		<div v-show="activeTab === 'sequences'">
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
			<div v-for="seq in sequences" :key="seq.id" class="flex items-center justify-between gap-3 p-3 hover:bg-gray-50 transition-colors">
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
					<div class="text-xs text-gray-500">
						{{ t('sequences.triggers.' + seq.trigger) }} · {{ t('sequences.audiences.' + seq.audience) }}
						· {{ t('sequences.stepCount', { count: seq.steps?.length || 0 }) }}
					</div>
					<!-- Métricas por secuencia -->
					<div class="flex flex-wrap gap-1.5 mt-1.5 text-[11px]">
						<span v-if="statusCount(seq.id, 'sent')" class="bg-green-100 text-green-700 rounded px-1.5 py-0.5">
							{{ t('sequences.stat.sent', { n: statusCount(seq.id, 'sent') }) }}
						</span>
						<span v-if="statusCount(seq.id, 'queued')" class="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">
							{{ t('sequences.stat.queued', { n: statusCount(seq.id, 'queued') }) }}
						</span>
						<span v-if="statusCount(seq.id, 'skipped')" class="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
							{{ t('sequences.stat.skipped', { n: statusCount(seq.id, 'skipped') }) }}
						</span>
						<span v-if="statusCount(seq.id, 'failed')" class="bg-red-100 text-red-700 rounded px-1.5 py-0.5">
							{{ t('sequences.stat.failed', { n: statusCount(seq.id, 'failed') }) }}
						</span>
					</div>
				</div>
				<div class="flex items-center gap-1 shrink-0">
					<Button variant="ghost" size="icon" @click="openEdit(seq)"><Pencil class="w-4 h-4" /></Button>
					<Button variant="ghost" size="icon" class="text-red-500" @click="askDelete(seq)">
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

			<!-- Tab: Pendientes de WhatsApp -->
			<div v-show="activeTab === 'pending'">
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
							{{ item.templateType }}
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
						<Button size="sm" variant="outline" class="shrink-0 px-2 sm:px-3" @click="sequenceStore.skip(item.id)">
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
			<div v-show="activeTab === 'issues'">
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
							· {{ it.templateType }}
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
			</div>

		<!-- Editor de secuencia -->
		<div
			v-if="isEditorOpen"
			class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
			@click.self="isEditorOpen = false"
		>
			<div class="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
				<div class="flex items-center justify-between p-6 border-b">
					<h2 class="text-xl font-semibold">
						{{ draft.id ? t('sequences.editTitle') : t('sequences.newTitle') }}
					</h2>
					<Button variant="ghost" size="icon" @click="isEditorOpen = false"><X class="w-5 h-5" /></Button>
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
								<div class="flex items-center justify-between">
									<span class="text-sm font-semibold text-gray-700">{{ t('sequences.stepN', { n: i + 1 }) }}</span>
									<Button variant="ghost" size="icon" class="text-red-500 -my-1" @click="removeStep(i)">
										<Trash2 class="w-4 h-4" />
									</Button>
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
										<input type="number" v-model.number="step.offsetDays" class="w-full mt-1 p-2 border rounded-md text-sm" />
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

					<!-- Preview del primer paso (con un participante de ejemplo) -->
					<div v-if="previewText">
						<label class="text-xs text-gray-500">{{ t('sequences.preview') }}</label>
						<pre class="mt-1 p-2 bg-gray-50 border rounded text-xs whitespace-pre-wrap font-sans">{{ previewText }}</pre>
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
			<div class="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
				<div class="flex items-center justify-between p-5 border-b">
					<div>
						<h2 class="text-lg font-semibold">{{ t('sequences.importTitle') }}</h2>
						<p class="text-xs text-gray-500">{{ t('sequences.importHint') }}</p>
					</div>
					<Button variant="ghost" size="icon" @click="isImportOpen = false"><X class="w-5 h-5" /></Button>
				</div>
				<div class="p-5 overflow-y-auto">
					<div v-if="globalSequences.length" class="border rounded-md divide-y">
						<div v-for="g in globalSequences" :key="g.id" class="flex items-center justify-between gap-3 p-3">
							<div class="min-w-0">
								<div class="font-medium text-sm truncate">{{ g.name }}</div>
								<div class="text-xs text-gray-500">
									{{ t('sequences.triggers.' + g.trigger) }} · {{ t('sequences.audiences.' + g.audience) }}
									· {{ t('sequences.stepCount', { count: g.steps?.length || 0 }) }}
								</div>
							</div>
							<Button size="sm" :disabled="importLoading" @click="importGlobal(g)">
								{{ t('sequences.import') }}
							</Button>
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
			<div class="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
				<div class="flex items-center justify-between p-5 border-b">
					<div class="min-w-0">
						<h2 class="text-lg font-semibold truncate">
							{{ detailItem?.participant?.firstName }} {{ detailItem?.participant?.lastName }}
						</h2>
						<p class="text-xs text-gray-500">{{ t('sequences.detailTitle') }}</p>
					</div>
					<Button variant="ghost" size="icon" @click="closeDetail"><X class="w-5 h-5" /></Button>
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
								<span class="text-gray-400">· {{ detail.message.templateType }}</span>
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
			<div class="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
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
	</div>
</template>
