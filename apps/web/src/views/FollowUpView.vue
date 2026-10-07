<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, type Component } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast, Button, Input } from '@repo/ui';
import {
	Search,
	Phone,
	MessageCircle,
	CheckCircle,
	PhoneMissed,
	XCircle,
	MailCheck,
} from 'lucide-vue-next';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useCrmStore } from '@/stores/crmStore';
import { useParticipantMessageDialog } from '@/composables/useParticipantMessageDialog';
import MessageDialog from '@/components/MessageDialog.vue';
import FollowUpCard from '@/components/crm/FollowUpCard.vue';
import ParticipantTimelinePanel from '@/components/crm/ParticipantTimelinePanel.vue';
import { resolvePalancas, effectiveMinPalancas } from '@repo/utils';
import type { FollowUpStatus } from '@repo/types';

const { t } = useI18n();
const { toast } = useToast();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const crmStore = useCrmStore();

const { followUps, tasks } = storeToRefs(crmStore);
const { participants } = storeToRefs(participantStore);

const retreatId = computed(() => retreatStore.selectedRetreatId || '');
const minPalancas = computed(
	() => (retreatStore.selectedRetreat as any)?.minPalancasPerWalker ?? null,
);

const STATUSES: FollowUpStatus[] = ['pending', 'contacted', 'confirmed', 'no_answer', 'declined'];
const PAGE = 50;
/** Clave del cubo «Con sus cartas» en el paginado `shown` (no es una etapa). */
const LETTERS_MET = 'letters_met';
/** Ícono por etapa: en el celular la barra y los botones del panel se muestran
 *  sin texto, así que cada etapa necesita un ícono reconocible — y el mismo en
 *  ambos lados, para que se refuercen. */
const STAGE_ICONS: Record<string, Component> = {
	pending: Phone,
	contacted: MessageCircle,
	confirmed: CheckCircle,
	no_answer: PhoneMissed,
	declined: XCircle,
	[LETTERS_MET]: MailCheck,
};
/** Mismo aspecto que el `Input` de @repo/ui; el select sigue nativo porque en
 *  el teléfono el selector del sistema es el más cómodo. */
const SELECT_CLASS =
	'block w-full h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

const search = ref('');
// El tablero es de seguimiento de caminantes: abre ya filtrado a ellos.
const typeFilter = ref<'all' | 'walker' | 'server'>('walker');
const lettersFilter = ref<'all' | 'none' | 'below' | 'met' | 'unknown'>('all');
// Cuántas tarjetas se pintan por columna. Objeto plano, no Map: dentro de un
// ref, Map y Set no son reactivos en este repo.
const shown = ref<Record<string, number>>({});
const dragging = ref<string | null>(null);
const dragOverStatus = ref<string | null>(null);
// Columna que se ve en el celular (ahí se pinta una sola) y a la que se lleva
// el scroll en escritorio.
const activeStage = ref<string>(STATUSES[0]);

const panelOpen = ref(false);
const panelParticipant = ref<any | null>(null);

const {
	isOpen: messageDialogOpen,
	participant: messageParticipant,
	open: openMessageDialog,
} = useParticipantMessageDialog();

async function load() {
	if (!retreatId.value) return;
	participantStore.filters.retreatId = retreatId.value;
	await Promise.all([
		crmStore.fetchFollowUps(retreatId.value),
		crmStore.fetchTasks(retreatId.value),
		participantStore.fetchParticipants(),
	]);
	shown.value = Object.fromEntries([...STATUSES, LETTERS_MET].map((s) => [s, PAGE]));
}

onMounted(load);
watch(retreatId, load);

/** Etapa de cada participante. Quien no tiene fila cuenta como `pending`. */
const statusByParticipant = computed<Record<string, FollowUpStatus>>(() => {
	const map: Record<string, FollowUpStatus> = {};
	for (const fu of followUps.value) map[fu.participantId] = fu.status;
	return map;
});

const openTasksByParticipant = computed<Record<string, number>>(() => {
	const map: Record<string, number> = {};
	for (const task of tasks.value) {
		if (task.status !== 'open' || !task.participantId) continue;
		map[task.participantId] = (map[task.participantId] ?? 0) + 1;
	}
	return map;
});

const contactableParticipants = computed(() =>
	(participants.value || []).filter(
		// Quien ejerció el derecho de borrado queda anonimizado («(eliminado)»,
		// sin teléfono ni correo): no se le puede contactar, así que no tiene
		// nada que hacer en un tablero de seguimiento.
		(p: any) => !p.isCancelled && !p.dataDeletedAt,
	),
);

const visibleParticipants = computed(() => {
	const q = search.value.trim().toLowerCase();
	return contactableParticipants.value.filter((p: any) => {
		if (typeFilter.value !== 'all' && p.type !== typeFilter.value) return false;
		if (q) {
			const name = `${p.firstName ?? ''} ${p.lastName ?? ''}`.toLowerCase();
			if (!name.includes(q)) return false;
		}
		if (lettersFilter.value !== 'all') {
			const { milestone } = resolvePalancas(p, minPalancas.value);
			if (milestone !== lettersFilter.value) return false;
		}
		return true;
	});
});

const columns = computed(() => {
	const byStatus: Record<string, any[]> = Object.fromEntries(STATUSES.map((s) => [s, []]));
	for (const p of visibleParticipants.value) {
		const status = statusByParticipant.value[p.id] ?? 'pending';
		(byStatus[status] ?? byStatus.pending).push(p);
	}
	return byStatus;
});

const lettersThreshold = computed(() => effectiveMinPalancas(minPalancas.value));

/**
 * Columna «Con sus cartas»: cubo DERIVADO del conteo de la ficha, no una etapa.
 * Quien cumple el umbral aparece aquí y ADEMÁS en su etapa de contacto; no se
 * arrastra hacia esta columna porque el conteo es la única verdad — una etapa
 * manual acabaría contradiciendo a la ficha.
 */
const lettersMetParticipants = computed<any[]>(() =>
	visibleParticipants.value.filter(
		(p: any) => resolvePalancas(p, minPalancas.value).milestone === 'met',
	),
);

/** Índice del tablero: las cinco etapas y el cubo de cartas, con su conteo. */
const stageNav = computed(() => [
	...STATUSES.map((s) => ({
		key: s as string,
		label: t('followUp.statuses.' + s),
		count: columns.value[s].length,
	})),
	{
		key: LETTERS_MET,
		label: t('followUp.lettersColumnTitle'),
		count: lettersMetParticipants.value.length,
	},
]);

function selectStage(key: string) {
	activeStage.value = key;
	// En escritorio todas las columnas están a la vista y se lleva el scroll
	// hasta la elegida; en el celular sólo se pinta la activa.
	nextTick(() =>
		document
			.getElementById(`stage-${key}`)
			?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }),
	);
}

function clearFilters() {
	search.value = '';
	typeFilter.value = 'all';
	lettersFilter.value = 'all';
}

/** Etapa de quien tiene el panel abierto, para resaltarla en los botones. */
const panelStatus = computed<FollowUpStatus>(() =>
	panelParticipant.value ? (statusByParticipant.value[panelParticipant.value.id] ?? 'pending') : 'pending',
);

function isPanelFor(participantId: string) {
	return panelOpen.value && panelParticipant.value?.id === participantId;
}

async function moveTo(participant: any, status: FollowUpStatus) {
	if (!participant?.id || !retreatId.value) return;
	const previous = statusByParticipant.value[participant.id] ?? 'pending';
	if (previous === status) return;
	// Movimiento optimista: la tarjeta salta ya, y si el POST falla se revierte.
	//
	// La reversión busca por participantId, NO por el índice capturado antes del
	// await: `setFollowUp` termina llamando a `fetchFollowUps`, que REEMPLAZA el
	// array entero reordenado por `updatedAt`. Con dos arrastres concurrentes, un
	// índice viejo apunta a la fila de otra persona y la reversión la pisaría.
	const existia = followUps.value.some((f) => f.participantId === participant.id);
	const snapshot = existia
		? { ...followUps.value.find((f) => f.participantId === participant.id)! }
		: null;
	followUps.value = existia
		? followUps.value.map((f) =>
				f.participantId === participant.id ? { ...f, status } : f,
			)
		: [
				...followUps.value,
				{ participantId: participant.id, retreatId: retreatId.value, status } as any,
			];

	try {
		await crmStore.setFollowUp({
			retreatId: retreatId.value,
			participantId: participant.id,
			status,
		});
		// El efecto colateral hay que decirlo: mover a Confirmó/Declinó escribe
		// la confirmación de asistencia y con eso apaga recordatorios pendientes.
		if (status === 'confirmed') toast({ title: t('followUp.attendanceSynced') });
		else if (status === 'declined') toast({ title: t('followUp.attendanceDeclined') });
		await participantStore.fetchParticipants();
	} catch {
		followUps.value = snapshot
			? followUps.value.map((f) => (f.participantId === participant.id ? snapshot : f))
			: followUps.value.filter((f) => f.participantId !== participant.id);
		toast({ title: t('followUp.moveError'), variant: 'destructive' });
	}
}

function onDragStart(participant: any) {
	dragging.value = participant.id;
}
function onDragEnd() {
	dragging.value = null;
	dragOverStatus.value = null;
}
function onDrop(status: FollowUpStatus) {
	const id = dragging.value;
	dragOverStatus.value = null;
	dragging.value = null;
	if (!id) return;
	const participant = visibleParticipants.value.find((p: any) => p.id === id);
	if (participant) moveTo(participant, status);
}

function openPanel(participant: any) {
	panelParticipant.value = participant;
	panelOpen.value = true;
}

/**
 * El MessageDialog elige el contacto con su propio selector, así que aquí sólo
 * se abre con el participante. Pasarle un `contactKey` no serviría: no es parte
 * de su API.
 */
function onPanelMessage(payload: { participant: any }) {
	openMessageDialog(payload.participant);
}

function showMore(status: string) {
	shown.value = { ...shown.value, [status]: (shown.value[status] ?? PAGE) + PAGE };
}

/**
 * Fecha de la última vez que se movió el seguimiento. NO es la fecha del último
 * mensaje: el listado de participantes sólo hidrata `messageCount`, no la fecha
 * del último envío, y traerla costaría otra consulta por participante.
 */
const lastActivityByParticipant = computed<Record<string, string>>(() => {
	const map: Record<string, string> = {};
	for (const fu of followUps.value) {
		if (fu.updatedAt) map[fu.participantId] = fu.updatedAt as any;
	}
	return map;
});
</script>

<template>
	<div class="p-4 space-y-4">
		<div>
			<h1 class="text-2xl font-semibold">{{ t('followUp.title') }}</h1>
			<p class="hidden sm:block text-gray-600 text-sm">{{ t('followUp.subtitle') }}</p>
		</div>

		<!-- Filtros -->
		<div class="flex flex-wrap gap-2 items-end">
			<div class="relative basis-full sm:basis-auto sm:flex-1 sm:min-w-[180px]">
				<Search
					class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
				/>
				<Input
					v-model="search"
					class="pl-9"
					:placeholder="t('followUp.search')"
					:aria-label="t('followUp.search')"
				/>
			</div>
			<label class="flex-1 sm:flex-none sm:min-w-[9rem]">
				<span class="text-xs text-gray-500">{{ t('followUp.showType') }}</span>
				<select v-model="typeFilter" :class="SELECT_CLASS">
					<option value="all">{{ t('followUp.allTypes') }}</option>
					<option value="walker">{{ t('followUp.walkers') }}</option>
					<option value="server">{{ t('followUp.servers') }}</option>
				</select>
			</label>
			<label class="flex-1 sm:flex-none sm:min-w-[11rem]">
				<span class="text-xs text-gray-500">{{ t('followUp.lettersFilter') }}</span>
				<select v-model="lettersFilter" :class="SELECT_CLASS">
					<option value="all">{{ t('followUp.lettersAll') }}</option>
					<option value="none">{{ t('followUp.lettersNone') }}</option>
					<option value="below">{{ t('followUp.lettersBelow') }}</option>
					<option value="met">{{ t('followUp.lettersMet') }}</option>
					<option value="unknown">{{ t('followUp.lettersUnknown') }}</option>
				</select>
			</label>
		</div>

		<p v-if="!contactableParticipants.length" class="text-sm text-gray-500">
			{{ t('followUp.noParticipants') }}
		</p>

		<!-- Hay gente, pero los filtros no dejan a nadie: decirlo, no fingir un
		     retiro vacío. -->
		<div
			v-else-if="!visibleParticipants.length"
			class="flex flex-wrap items-center gap-3 text-sm text-gray-500"
		>
			<span>{{ t('followUp.noMatches') }}</span>
			<Button variant="outline" size="sm" data-testid="clear-filters" @click="clearFilters">
				{{ t('followUp.clearFilters') }}
			</Button>
		</div>

		<template v-else>
			<!-- Índice del tablero: en el celular elige la columna que se ve; en
			     escritorio lleva el scroll hasta ella. -->
			<nav
				:aria-label="t('followUp.stagesNav')"
				class="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1"
			>
				<button
					v-for="s in stageNav"
					:key="s.key"
					type="button"
					:data-testid="`stage-nav-${s.key}`"
					:aria-current="activeStage === s.key ? 'true' : undefined"
					:aria-label="`${s.label}: ${s.count}`"
					:title="s.label"
					class="shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm whitespace-nowrap transition-colors"
					:class="
						activeStage === s.key
							? s.key === LETTERS_MET
								? 'bg-green-700 border-green-700 text-white'
								: 'bg-gray-900 border-gray-900 text-white'
							: s.key === LETTERS_MET
								? 'bg-green-50 border-green-200 text-green-800 hover:bg-green-100'
								: 'bg-white text-gray-700 hover:bg-gray-50'
					"
					@click="selectStage(s.key)"
				>
					<!-- En el celular la pastilla es ícono + conteo; el texto completo
					     sólo desde md. -->
					<component :is="STAGE_ICONS[s.key]" class="w-4 h-4 md:hidden" aria-hidden="true" />
					<span class="hidden md:inline">{{ s.label }}</span>
					<span
						class="rounded-full px-1.5 text-xs tabular-nums"
						:class="activeStage === s.key ? 'bg-white/20' : 'bg-gray-100 text-gray-600'"
					>
						{{ s.count }}
					</span>
				</button>
			</nav>

			<!-- Tablero. En el celular, una columna a la vez (la de la barra); en
			     escritorio, todas en fila y cada lista con su propio scroll para que
			     el encabezado y la barra horizontal no se pierdan. -->
			<div class="flex flex-col md:flex-row gap-3 md:overflow-x-auto pb-20 md:pb-4">
				<section
					v-for="status in STATUSES"
					:id="`stage-${status}`"
					:key="status"
					class="w-full md:w-64 md:shrink-0 flex-col rounded-md bg-gray-50 border"
					:class="[
						activeStage === status ? 'flex' : 'hidden md:flex',
						dragOverStatus === status ? 'border-blue-500 bg-blue-50' : '',
					]"
					@dragover.prevent="dragOverStatus = status"
					@dragleave="dragOverStatus = null"
					@drop.prevent="onDrop(status)"
				>
					<header class="px-3 py-2 border-b flex items-center justify-between gap-2">
						<h2 class="text-xs font-semibold uppercase tracking-wide text-gray-600">
							{{ t('followUp.statuses.' + status) }}
						</h2>
						<span class="rounded-full bg-gray-200 text-gray-700 px-2 text-xs tabular-nums">
							{{ columns[status].length }}
						</span>
					</header>

					<div
						class="p-2 space-y-2 min-h-24 md:max-h-[calc(100dvh-16rem)] md:overflow-y-auto"
						:class="
							dragging && !columns[status].length
								? 'outline-2 outline-dashed outline-blue-300 -outline-offset-4 rounded-md'
								: ''
						"
					>
						<p v-if="!columns[status].length" class="text-xs text-gray-400 text-center py-4">
							{{ t('followUp.emptyColumn') }}
						</p>
						<FollowUpCard
							v-for="p in columns[status].slice(0, shown[status] ?? PAGE)"
							:key="p.id"
							:participant="p"
							:min-palancas="minPalancas"
							:open-tasks="openTasksByParticipant[p.id]"
							:last-activity-at="lastActivityByParticipant[p.id]"
							:message-count="p.messageCount"
							:selected="isPanelFor(p.id)"
							class="md:cursor-grab"
							draggable="true"
							@dragstart="onDragStart(p)"
							@dragend="onDragEnd"
							@click="openPanel(p)"
						/>
						<Button
							v-if="columns[status].length > (shown[status] ?? PAGE)"
							variant="ghost"
							size="sm"
							class="w-full text-xs"
							@click.stop="showMore(status)"
						>
							{{ t('followUp.showMore') }}
						</Button>
					</div>
				</section>

				<!-- Cubo derivado «Con sus cartas»: sin zona de arrastre porque no es
				     una etapa — se llena sola desde el conteo de la ficha, y quien
				     cumple sigue viviendo en su etapa de contacto. -->
				<section
					:id="`stage-${LETTERS_MET}`"
					class="w-full md:w-64 md:shrink-0 flex-col rounded-md bg-green-50 border border-green-200 transition-opacity"
					:class="[activeStage === LETTERS_MET ? 'flex' : 'hidden md:flex', dragging ? 'opacity-60' : '']"
				>
					<header class="px-3 py-2 border-b border-green-200">
						<div class="flex items-center justify-between gap-2">
							<h2 class="text-xs font-semibold uppercase tracking-wide text-green-800">
								{{ t('followUp.lettersColumnTitle') }}
							</h2>
							<span class="rounded-full bg-green-200 text-green-900 px-2 text-xs tabular-nums">
								{{ lettersMetParticipants.length }}
							</span>
						</div>
						<div class="text-[11px] text-green-700 leading-tight">
							{{ t('followUp.lettersColumnHint', { threshold: lettersThreshold }) }}
						</div>
					</header>

					<div class="p-2 space-y-2 min-h-24 md:max-h-[calc(100dvh-16rem)] md:overflow-y-auto">
						<p v-if="!lettersMetParticipants.length" class="text-xs text-gray-400 text-center py-4">
							{{ t('followUp.lettersColumnEmpty') }}
						</p>
						<FollowUpCard
							v-for="p in lettersMetParticipants.slice(0, shown[LETTERS_MET] ?? PAGE)"
							:key="`met-${p.id}`"
							:participant="p"
							:min-palancas="minPalancas"
							:open-tasks="openTasksByParticipant[p.id]"
							:last-activity-at="lastActivityByParticipant[p.id]"
							:message-count="p.messageCount"
							:selected="isPanelFor(p.id)"
							@click="openPanel(p)"
						/>
						<Button
							v-if="lettersMetParticipants.length > (shown[LETTERS_MET] ?? PAGE)"
							variant="ghost"
							size="sm"
							class="w-full text-xs"
							@click.stop="showMore(LETTERS_MET)"
						>
							{{ t('followUp.showMore') }}
						</Button>
					</div>
				</section>
			</div>
		</template>

		<ParticipantTimelinePanel
			v-model:open="panelOpen"
			:retreat-id="retreatId"
			:participant="panelParticipant"
			@message="onPanelMessage"
		>
			<!-- La etapa se cambia aquí en cualquier dispositivo: en el celular es
			     la única forma, porque el arrastre nativo sólo funciona con mouse. -->
			<template #header-extra>
				<div v-if="panelParticipant" class="px-4 py-3 border-b space-y-2">
					<div class="text-xs font-semibold uppercase tracking-wide text-gray-500">
						{{ t('followUp.stageLabel') }}
					</div>
					<div class="flex flex-wrap gap-1.5">
						<Button
							v-for="status in STATUSES"
							:key="status"
							size="sm"
							:variant="panelStatus === status ? 'default' : 'outline'"
							:aria-pressed="panelStatus === status"
							:aria-label="t('followUp.statuses.' + status)"
							:title="t('followUp.statuses.' + status)"
							:data-testid="`stage-chip-${status}`"
							@click="moveTo(panelParticipant, status)"
						>
							<!-- Mismo ícono que la barra de etapas; texto sólo desde md. -->
							<component :is="STAGE_ICONS[status]" class="w-4 h-4 md:hidden" aria-hidden="true" />
							<span class="hidden md:inline">{{ t('followUp.statuses.' + status) }}</span>
						</Button>
					</div>
					<p class="text-[11px] text-gray-500">{{ t('followUp.stageSideEffectHint') }}</p>
				</div>
			</template>
		</ParticipantTimelinePanel>

		<MessageDialog
			v-model:open="messageDialogOpen"
			context="retreat"
			:retreat-id="retreatId || undefined"
			:participant="messageParticipant"
		/>
	</div>
</template>
