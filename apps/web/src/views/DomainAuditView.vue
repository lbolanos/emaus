<template>
	<div class="domain-audit-view p-4 space-y-4">
		<div>
			<h1 class="text-2xl font-bold">{{ t('audit.ui.title') }}</h1>
			<p class="text-sm text-muted-foreground">
				{{ t('audit.ui.description') }}
			</p>
		</div>

		<!-- Rango rápido -->
		<div class="flex flex-wrap items-center gap-1">
			<span class="text-xs text-muted-foreground mr-1">{{ t('audit.ui.quickRange') }}</span>
			<Button
				v-for="p in RANGE_PRESETS"
				:key="p.key"
				size="sm"
				:variant="activePreset === p.key ? 'default' : 'outline'"
				:aria-pressed="activePreset === p.key"
				@click="applyPreset(p)"
			>
				{{ presetLabel(p.key) }}
			</Button>
		</div>

		<!-- Filtros -->
		<div class="flex flex-wrap items-end gap-3">
			<div class="flex flex-col gap-1">
				<Label class="text-xs">{{ t('audit.ui.area') }}</Label>
				<Select v-model="resourceTypeFilter">
					<SelectTrigger class="w-[170px]">
						<SelectValue :placeholder="t('audit.ui.all')" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{{ t('audit.ui.all') }}</SelectItem>
						<SelectItem v-for="rt in DOMAIN_RESOURCE_TYPES" :key="rt" :value="rt">
							{{ resourceLabel(rt) }}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div class="flex flex-col gap-1">
				<Label class="text-xs">{{ t('audit.ui.action') }}</Label>
				<Select v-model="actionFilter">
					<SelectTrigger class="w-[200px]">
						<SelectValue :placeholder="t('audit.ui.all')" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{{ t('audit.ui.all') }}</SelectItem>
						<SelectItem v-for="a in actionOptions" :key="a.value" :value="a.value">
							{{ a.label }}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>

			<div class="flex flex-col gap-1">
				<Label class="text-xs">{{ t('audit.ui.from') }}</Label>
				<Input
					:model-value="startDate"
					type="date"
					class="w-[160px]"
					@update:model-value="onStartInput"
				/>
			</div>
			<div class="flex flex-col gap-1">
				<Label class="text-xs">{{ t('audit.ui.to') }}</Label>
				<Input
					:model-value="endDate"
					type="date"
					class="w-[160px]"
					@update:model-value="onEndInput"
				/>
			</div>

			<Button variant="outline" @click="resetAndLoad">{{ t('audit.ui.clear') }}</Button>
		</div>

		<!-- Estado -->
		<div v-if="loading" class="py-10 text-center text-muted-foreground">
			{{ t('audit.ui.loading') }}
		</div>
		<div v-else-if="!logs.length" class="py-10 text-center text-muted-foreground">
			{{ t('audit.ui.empty') }}
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
					<span class="font-medium">{{ log.actor?.displayName || t('audit.ui.systemActor') }}</span>
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
					{{ t('audit.ui.ip') }}: {{ log.ipAddress }}
				</div>
			</div>
		</div>

		<!-- Paginación -->
		<div v-if="logs.length" class="flex items-center justify-between pt-2">
			<span class="text-xs text-muted-foreground">
				{{ offset + 1 }}–{{ offset + logs.length }} {{ t('audit.ui.of') }} {{ total }}
			</span>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" :disabled="offset === 0" @click="prevPage">
					{{ t('audit.ui.previous') }}
				</Button>
				<Button variant="outline" size="sm" :disabled="!hasMore" @click="nextPage">
					{{ t('audit.ui.next') }}
				</Button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { DomainAuditAction, DOMAIN_RESOURCE_TYPES } from '@repo/types';
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

const i18n = useI18n();
const { t } = i18n;
// `te` está tipado como método → desestructurarlo dispara unbound-method.
const te = (key: string) => i18n.te(key);
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

// Los filtros usan la fecha LOCAL del navegador (lo que espera <input type="date">);
// formatear con toISOString correría a UTC y podría adelantar/atrasar un día para
// usuarios al oeste de UTC.
const toYmd = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayYmd = () => toYmd(new Date());
const daysAgoYmd = (days: number) => {
	const d = new Date();
	d.setDate(d.getDate() - days);
	return toYmd(d);
};

// Rangos rápidos. `days: null` = "Todo" (sin filtro de fecha).
const RANGE_PRESETS: { key: string; days: number | null }[] = [
	{ key: '1w', days: 7 },
	{ key: '2w', days: 14 },
	{ key: '1m', days: 30 },
	{ key: '3m', days: 90 },
	{ key: '6m', days: 180 },
	{ key: 'all', days: null },
];
// El rango por defecto se deriva del preset, no se duplica el número de días.
const DEFAULT_PRESET = '1m';
const DEFAULT_DAYS = RANGE_PRESETS.find((p) => p.key === DEFAULT_PRESET)!.days as number;

const activePreset = ref<string | null>(DEFAULT_PRESET);
const startDate = ref(daysAgoYmd(DEFAULT_DAYS));
const endDate = ref(todayYmd());

function applyPreset(p: { key: string; days: number | null }) {
	if (p.days === null) {
		startDate.value = '';
		endDate.value = '';
	} else {
		startDate.value = daysAgoYmd(p.days);
		endDate.value = todayYmd();
	}
	activePreset.value = p.key;
	// El watcher de [startDate, endDate] dispara la recarga.
}

// Editar una fecha a mano apaga el resaltado del preset (el rango deja de ser uno fijo).
function onStartInput(v: unknown) {
	startDate.value = String(v ?? '');
	activePreset.value = null;
}
function onEndInput(v: unknown) {
	endDate.value = String(v ?? '');
	activePreset.value = null;
}

// Acciones y áreas derivadas de la fuente de verdad compartida (@repo/types);
// las etiquetas viven en los locales (`audit.actions.*` / `audit.resources.*`).
// Fallback a la key cruda si falta la traducción (anti-drift visible).
const ALL_ACTIONS = Object.values(DomainAuditAction) as string[];

const actionLabel = (action: string) => {
	const key = `audit.actions.${action}`;
	return te(key) ? t(key) : action;
};
const resourceLabel = (rt: string) => {
	const key = `audit.resources.${rt}`;
	return te(key) ? t(key) : rt;
};
const presetLabel = (key: string) => t(`audit.ranges.${key}`);

const actionOptions = computed(() => {
	const actions =
		resourceTypeFilter.value === 'all'
			? ALL_ACTIONS
			: ALL_ACTIONS.filter((a) => a.startsWith(`${resourceTypeFilter.value}.`));
	return actions.map((value) => ({ value, label: actionLabel(value) }));
});

const badgeClass = (rt: string) => {
	const map: Record<string, string> = {
		participant: 'bg-blue-100 text-blue-800',
		participant_debt: 'bg-rose-100 text-rose-800',
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
	if (typeof v === 'boolean') return v ? t('audit.ui.yes') : t('audit.ui.no');
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

// Guard de secuencia: si llegan respuestas fuera de orden (filtros cambiados
// rápido, red lenta), solo la última solicitud pinta datos.
let loadSeq = 0;

async function load() {
	const retreatId = retreatStore.selectedRetreatId;
	if (!retreatId) {
		logs.value = [];
		return;
	}
	const seq = ++loadSeq;
	loading.value = true;
	try {
		const data = await getDomainAuditLogs(retreatId, {
			resourceType: resourceTypeFilter.value !== 'all' ? resourceTypeFilter.value : undefined,
			action: actionFilter.value !== 'all' ? actionFilter.value : undefined,
			// Fechas planas YYYY-MM-DD: el backend resuelve las fronteras del día
			// en la timezone del retiro (no del navegador ni del servidor).
			startDate: startDate.value || undefined,
			endDate: endDate.value || undefined,
			limit,
			offset: offset.value,
		});
		if (seq !== loadSeq) return;
		logs.value = data.logs;
		total.value = data.total;
		hasMore.value = data.hasMore;
	} catch (e: any) {
		if (seq !== loadSeq) return;
		toast({
			title: t('audit.ui.errorTitle'),
			description: e?.response?.data?.message || t('audit.ui.errorLoad'),
			variant: 'destructive',
		});
	} finally {
		if (seq === loadSeq) loading.value = false;
	}
}

// Coalesce de disparos múltiples en el mismo tick (watchers en cascada,
// reset de filtros) → una sola request.
let loadQueued = false;
function scheduleLoad() {
	if (loadQueued) return;
	loadQueued = true;
	queueMicrotask(() => {
		loadQueued = false;
		void load();
	});
}

function resetAndLoad() {
	resourceTypeFilter.value = 'all';
	actionFilter.value = 'all';
	startDate.value = daysAgoYmd(DEFAULT_DAYS);
	endDate.value = todayYmd();
	activePreset.value = DEFAULT_PRESET;
	offset.value = 0;
	// Si todo ya estaba en defaults los watchers no disparan; garantizar una recarga.
	scheduleLoad();
}

function nextPage() {
	if (!hasMore.value) return;
	offset.value += limit;
	scheduleLoad();
}
function prevPage() {
	offset.value = Math.max(0, offset.value - limit);
	scheduleLoad();
}

// Al cambiar filtros, volver a la primera página. Si cambia el área, resetear la acción.
watch(resourceTypeFilter, () => {
	actionFilter.value = 'all';
});
watch([resourceTypeFilter, actionFilter, startDate, endDate], () => {
	offset.value = 0;
	scheduleLoad();
});
watch(
	() => retreatStore.selectedRetreatId,
	() => {
		offset.value = 0;
		scheduleLoad();
	},
);

onMounted(load);
</script>
