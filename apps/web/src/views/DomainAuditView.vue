<template>
	<div class="domain-audit-view p-4 space-y-4">
		<div>
			<h1 class="text-2xl font-bold">Auditoría</h1>
			<p class="text-sm text-muted-foreground">
				Registro de quién creó, editó o borró participantes, mesas, camas, casas, pagos y datos
				del retiro.
			</p>
		</div>

		<!-- Filtros -->
		<div class="flex flex-wrap items-end gap-3">
			<div class="flex flex-col gap-1">
				<Label class="text-xs">Área</Label>
				<Select v-model="resourceTypeFilter">
					<SelectTrigger class="w-[170px]">
						<SelectValue placeholder="Todas" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todas</SelectItem>
						<SelectItem value="participant">Participantes</SelectItem>
						<SelectItem value="table">Mesas</SelectItem>
						<SelectItem value="bed">Camas</SelectItem>
						<SelectItem value="house">Casas</SelectItem>
						<SelectItem value="payment">Pagos</SelectItem>
						<SelectItem value="retreat">Retiro</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div class="flex flex-col gap-1">
				<Label class="text-xs">Acción</Label>
				<Select v-model="actionFilter">
					<SelectTrigger class="w-[200px]">
						<SelectValue placeholder="Todas" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Todas</SelectItem>
						<SelectItem v-for="a in actionOptions" :key="a.value" :value="a.value">
							{{ a.label }}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div class="flex flex-col gap-1">
				<Label class="text-xs">Desde</Label>
				<Input v-model="startDate" type="date" class="w-[160px]" />
			</div>
			<div class="flex flex-col gap-1">
				<Label class="text-xs">Hasta</Label>
				<Input v-model="endDate" type="date" class="w-[160px]" />
			</div>

			<Button variant="outline" @click="resetAndLoad">Limpiar</Button>
		</div>

		<!-- Estado -->
		<div v-if="loading" class="py-10 text-center text-muted-foreground">Cargando…</div>
		<div v-else-if="!logs.length" class="py-10 text-center text-muted-foreground">
			No hay eventos de auditoría para los filtros seleccionados.
		</div>

		<!-- Lista -->
		<div v-else class="space-y-2">
			<div
				v-for="log in logs"
				:key="log.id"
				class="rounded-lg border p-3 text-sm flex flex-col gap-1"
			>
				<div class="flex flex-wrap items-center gap-2">
					<Badge :class="badgeClass(log.resourceType)">{{ actionLabel(log.action) }}</Badge>
					<span class="font-medium">{{ log.actor?.displayName || 'Sistema / sin sesión' }}</span>
					<span v-if="log.actor?.email" class="text-xs text-muted-foreground">
						{{ log.actor.email }}
					</span>
					<span class="ml-auto text-xs text-muted-foreground">{{ formatDate(log.createdAt) }}</span>
				</div>

				<div class="text-xs text-muted-foreground">
					{{ resourceLabel(log.resourceType) }}
					<span v-if="log.resourceId"> · {{ log.resourceId }}</span>
				</div>

				<!-- Cambios -->
				<div v-if="hasChanges(log)" class="mt-1 rounded bg-muted/50 p-2 text-xs space-y-0.5">
					<div v-for="field in changedFields(log)" :key="field" class="flex flex-wrap gap-1">
						<span class="font-medium">{{ field }}:</span>
						<span class="text-red-600 line-through">{{ fmt(log.oldValues?.[field]) }}</span>
						<span>→</span>
						<span class="text-green-700">{{ fmt(log.newValues?.[field]) }}</span>
					</div>
				</div>

				<!-- Metadata -->
				<div v-if="log.metadata" class="mt-1 text-xs text-muted-foreground">
					{{ JSON.stringify(log.metadata) }}
				</div>

				<div v-if="log.ipAddress" class="text-[11px] text-muted-foreground/70">
					IP: {{ log.ipAddress }}
				</div>
			</div>
		</div>

		<!-- Paginación -->
		<div v-if="logs.length" class="flex items-center justify-between pt-2">
			<span class="text-xs text-muted-foreground">
				{{ offset + 1 }}–{{ offset + logs.length }} de {{ total }}
			</span>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" :disabled="offset === 0" @click="prevPage">
					Anterior
				</Button>
				<Button variant="outline" size="sm" :disabled="!hasMore" @click="nextPage">
					Siguiente
				</Button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import {
	Button,
	Badge,
	Input,
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	useToast,
} from '@repo/ui';
import { useRetreatStore } from '@/stores/retreatStore';
import { getDomainAuditLogs } from '@/services/api';

interface AuditActor {
	displayName: string;
	email: string;
}
interface AuditLogRow {
	id: string;
	action: string;
	resourceType: string;
	resourceId: string | null;
	retreatId: string | null;
	actorUserId: string | null;
	actor: AuditActor | null;
	oldValues: Record<string, any> | null;
	newValues: Record<string, any> | null;
	metadata: Record<string, any> | null;
	ipAddress: string | null;
	userAgent: string | null;
	createdAt: string;
}

const { toast } = useToast();
const retreatStore = useRetreatStore();

const logs = ref<AuditLogRow[]>([]);
const total = ref(0);
const hasMore = ref(false);
const loading = ref(false);
const offset = ref(0);
const limit = 50;

const resourceTypeFilter = ref('all');
const actionFilter = ref('all');
const startDate = ref('');
const endDate = ref('');

const ACTION_LABELS: Record<string, string> = {
	'participant.create': 'Participante creado',
	'participant.update': 'Participante editado',
	'participant.delete': 'Participante eliminado',
	'participant.import': 'Importación de participantes',
	'participant.confirm': 'Participante confirmado',
	'participant.checkin': 'Check-in',
	'participant.anonymize': 'Datos anonimizados (GDPR)',
	'table.create': 'Mesa creada',
	'table.update': 'Mesa editada',
	'table.delete': 'Mesa eliminada',
	'table.assign_leader': 'Líder asignado',
	'table.unassign_leader': 'Líder removido',
	'table.assign_walker': 'Caminante asignado a mesa',
	'table.unassign_walker': 'Caminante removido de mesa',
	'table.rebalance': 'Mesas rebalanceadas',
	'table.clear_all': 'Mesas limpiadas',
	'bed.assign': 'Cama asignada',
	'bed.unassign': 'Cama liberada',
	'bed.toggle_active': 'Cama habilitada/deshabilitada',
	'bed.clear_all': 'Camas limpiadas',
	'house.create': 'Casa creada',
	'house.update': 'Casa editada',
	'house.delete': 'Casa eliminada',
	'payment.create': 'Pago registrado',
	'payment.update': 'Pago editado',
	'payment.delete': 'Pago eliminado',
	'retreat.create': 'Retiro creado',
	'retreat.update': 'Retiro editado',
};

const RESOURCE_LABELS: Record<string, string> = {
	participant: 'Participante',
	table: 'Mesa',
	bed: 'Cama',
	house: 'Casa',
	payment: 'Pago',
	retreat: 'Retiro',
};

const actionOptions = computed(() => {
	const entries = Object.entries(ACTION_LABELS);
	const filtered =
		resourceTypeFilter.value === 'all'
			? entries
			: entries.filter(([key]) => key.startsWith(`${resourceTypeFilter.value}.`));
	return filtered.map(([value, label]) => ({ value, label }));
});

const actionLabel = (action: string) => ACTION_LABELS[action] || action;
const resourceLabel = (rt: string) => RESOURCE_LABELS[rt] || rt;

const badgeClass = (rt: string) => {
	const map: Record<string, string> = {
		participant: 'bg-blue-100 text-blue-800',
		table: 'bg-purple-100 text-purple-800',
		bed: 'bg-amber-100 text-amber-800',
		house: 'bg-teal-100 text-teal-800',
		payment: 'bg-green-100 text-green-800',
		retreat: 'bg-slate-100 text-slate-800',
	};
	return map[rt] || 'bg-gray-100 text-gray-800';
};

const hasChanges = (log: AuditLogRow) =>
	(log.oldValues && Object.keys(log.oldValues).length > 0) ||
	(log.newValues && Object.keys(log.newValues).length > 0);

const changedFields = (log: AuditLogRow) => {
	const keys = new Set([
		...Object.keys(log.oldValues || {}),
		...Object.keys(log.newValues || {}),
	]);
	return [...keys];
};

const fmt = (v: any) => {
	if (v === null || v === undefined || v === '') return '∅';
	if (typeof v === 'boolean') return v ? 'sí' : 'no';
	return String(v);
};

const formatDate = (iso: string) => {
	try {
		return new Date(iso).toLocaleString('es-MX', {
			dateStyle: 'medium',
			timeStyle: 'short',
		});
	} catch {
		return iso;
	}
};

async function load() {
	const retreatId = retreatStore.selectedRetreatId;
	if (!retreatId) {
		logs.value = [];
		return;
	}
	loading.value = true;
	try {
		const data = await getDomainAuditLogs(retreatId, {
			resourceType: resourceTypeFilter.value !== 'all' ? resourceTypeFilter.value : undefined,
			action: actionFilter.value !== 'all' ? actionFilter.value : undefined,
			startDate: startDate.value || undefined,
			endDate: endDate.value ? `${endDate.value}T23:59:59` : undefined,
			limit,
			offset: offset.value,
		});
		logs.value = data.logs;
		total.value = data.total;
		hasMore.value = data.hasMore;
	} catch (e: any) {
		toast({
			title: 'Error',
			description: e?.response?.data?.message || 'No se pudo cargar la auditoría.',
			variant: 'destructive',
		});
	} finally {
		loading.value = false;
	}
}

function resetAndLoad() {
	resourceTypeFilter.value = 'all';
	actionFilter.value = 'all';
	startDate.value = '';
	endDate.value = '';
	offset.value = 0;
	load();
}

function nextPage() {
	if (!hasMore.value) return;
	offset.value += limit;
	load();
}
function prevPage() {
	offset.value = Math.max(0, offset.value - limit);
	load();
}

// Al cambiar filtros, volver a la primera página. Si cambia el área, resetear la acción.
watch(resourceTypeFilter, () => {
	actionFilter.value = 'all';
});
watch([resourceTypeFilter, actionFilter, startDate, endDate], () => {
	offset.value = 0;
	load();
});
watch(
	() => retreatStore.selectedRetreatId,
	() => {
		offset.value = 0;
		load();
	},
);

onMounted(load);
</script>
