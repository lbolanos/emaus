<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { useToast, Button, Input } from '@repo/ui';
import { X } from 'lucide-vue-next';
import { useRetreatStore } from '@/stores/retreatStore';
import { useParticipantStore } from '@/stores/participantStore';
import { useCrmStore } from '@/stores/crmStore';
import { useTapAssign } from '@/composables/useTapAssign';
import { useParticipantMessageDialog } from '@/composables/useParticipantMessageDialog';
import MessageDialog from '@/components/MessageDialog.vue';
import FollowUpCard from '@/components/crm/FollowUpCard.vue';
import ParticipantTimelinePanel from '@/components/crm/ParticipantTimelinePanel.vue';
import { resolvePalancas } from '@repo/utils';
import type { FollowUpStatus } from '@repo/types';

const { t } = useI18n();
const { toast } = useToast();
const retreatStore = useRetreatStore();
const participantStore = useParticipantStore();
const crmStore = useCrmStore();
const { tappedParticipant, onTouchStart, onTouchEnd, onTapZone, onZoneClick, clearSelection, isSelected } =
	useTapAssign();

const { followUps, tasks } = storeToRefs(crmStore);
const { participants } = storeToRefs(participantStore);

const retreatId = computed(() => retreatStore.selectedRetreatId || '');
const minPalancas = computed(
	() => (retreatStore.selectedRetreat as any)?.minPalancasPerWalker ?? null,
);

const STATUSES: FollowUpStatus[] = ['pending', 'contacted', 'confirmed', 'no_answer', 'declined'];
const PAGE = 50;

const search = ref('');
const typeFilter = ref<'all' | 'walker' | 'server'>('all');
const lettersFilter = ref<'all' | 'none' | 'below' | 'met' | 'unknown'>('all');
// Cuántas tarjetas se pintan por columna. Objeto plano, no Map: dentro de un
// ref, Map y Set no son reactivos en este repo.
const shown = ref<Record<string, number>>({});
const dragging = ref<string | null>(null);
const dragOverStatus = ref<string | null>(null);

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
	shown.value = Object.fromEntries(STATUSES.map((s) => [s, PAGE]));
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

const visibleParticipants = computed(() => {
	const q = search.value.trim().toLowerCase();
	return (participants.value || []).filter((p: any) => {
		if (p.isCancelled) return false;
		// Quien ejerció el derecho de borrado queda anonimizado («(eliminado)»,
		// sin teléfono ni correo): no se le puede contactar, así que no tiene
		// nada que hacer en un tablero de seguimiento.
		if (p.dataDeletedAt) return false;
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
	} finally {
		clearSelection();
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
			<p class="text-gray-600 text-sm">{{ t('followUp.subtitle') }}</p>
		</div>

		<!-- Filtros -->
		<div class="flex flex-wrap gap-2 items-end">
			<div class="flex-1 min-w-[180px]">
				<label class="text-xs text-gray-500">{{ t('followUp.search') }}</label>
				<Input v-model="search" :placeholder="t('followUp.search')" />
			</div>
			<div>
				<label class="text-xs text-gray-500">{{ t('followUp.showType') }}</label>
				<select v-model="typeFilter" class="block w-full p-2 border rounded-md text-sm">
					<option value="all">{{ t('followUp.allTypes') }}</option>
					<option value="walker">{{ t('followUp.walkers') }}</option>
					<option value="server">{{ t('followUp.servers') }}</option>
				</select>
			</div>
			<div>
				<label class="text-xs text-gray-500">{{ t('followUp.lettersFilter') }}</label>
				<select v-model="lettersFilter" class="block w-full p-2 border rounded-md text-sm">
					<option value="all">{{ t('followUp.lettersAll') }}</option>
					<option value="none">{{ t('followUp.lettersNone') }}</option>
					<option value="below">{{ t('followUp.lettersBelow') }}</option>
					<option value="met">{{ t('followUp.lettersMet') }}</option>
					<option value="unknown">{{ t('followUp.lettersUnknown') }}</option>
				</select>
			</div>
		</div>

		<!-- Aviso de selección táctil -->
		<div
			v-if="tappedParticipant"
			class="flex items-center justify-between gap-2 bg-blue-50 border border-blue-200 rounded-md p-2 text-sm"
		>
			<span>
				{{
					t('followUp.tapToMove', {
						name: `${tappedParticipant.firstName} ${tappedParticipant.lastName}`,
					})
				}}
			</span>
			<Button variant="ghost" size="sm" @click="clearSelection">
				<X class="w-4 h-4 mr-1" />{{ t('followUp.cancelMove') }}
			</Button>
		</div>

		<p v-if="!visibleParticipants.length" class="text-sm text-gray-500">
			{{ t('followUp.noParticipants') }}
		</p>

		<!-- Tablero -->
		<div v-else class="flex gap-3 overflow-x-auto pb-4">
			<section
				v-for="status in STATUSES"
				:key="status"
				class="shrink-0 w-64 rounded-md bg-gray-50 border"
				:class="dragOverStatus === status ? 'border-blue-500 bg-blue-50' : ''"
				@dragover.prevent="dragOverStatus = status"
				@dragleave="dragOverStatus = null"
				@drop.prevent="onDrop(status)"
				@touchend="onTapZone($event, () => moveTo(tappedParticipant, status))"
				@click="onZoneClick(() => moveTo(tappedParticipant, status))"
			>
				<header class="px-3 py-2 border-b sticky top-0 bg-gray-50 rounded-t-md">
					<div class="text-xs font-semibold uppercase tracking-wide text-gray-600">
						{{ t('followUp.statuses.' + status) }}
					</div>
					<div class="text-xs text-gray-400">{{ columns[status].length }}</div>
				</header>

				<div class="p-2 space-y-2">
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
						:selected="isSelected(p.id)"
						draggable="true"
						@dragstart="onDragStart(p)"
						@dragend="onDragEnd"
						@touchstart="onTouchStart($event)"
						@touchend="onTouchEnd($event, p)"
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
		</div>

		<ParticipantTimelinePanel
			v-model:open="panelOpen"
			:retreat-id="retreatId"
			:participant="panelParticipant"
			@message="onPanelMessage"
		/>

		<MessageDialog
			v-model:open="messageDialogOpen"
			context="retreat"
			:retreat-id="retreatId || undefined"
			:participant="messageParticipant"
		/>
	</div>
</template>
