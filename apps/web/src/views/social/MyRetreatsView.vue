<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRetreatMemoryStore } from '@/stores/retreatMemoryStore';
import { useRetreatStore } from '@/stores/retreatStore';
import { useAuthStore } from '@/stores/authStore';
import { useAuthPermissions } from '@/composables/useAuthPermissions';
import {
	useToast,
	Button,
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@repo/ui';
import { Plus, Pencil, Trash2 } from 'lucide-vue-next';
import { formatDate } from '@repo/utils';
import type { Retreat, CreateRetreat } from '@repo/types';
import RetreatMemoryCard from '@/components/social/RetreatMemoryCard.vue';
import EmptyState from '@/components/social/EmptyState.vue';
import RetreatModal from '@/components/RetreatModal.vue';
import DeleteRetreatDialog from '@/components/DeleteRetreatDialog.vue';

const retreatMemoryStore = useRetreatMemoryStore();
const retreatStore = useRetreatStore();
const authStore = useAuthStore();
const { can, isSuperadmin } = useAuthPermissions();
const { toast } = useToast();

const { attendedRetreats, loading } = storeToRefs(retreatMemoryStore);
const { retreats: managedRetreats } = storeToRefs(retreatStore);

// --- Galería de recuerdos (retiros donde participaste) ---
const retreatsWithMemories = computed(() => {
	return attendedRetreats.value.filter((r) => r.memoryPhotoUrl || r.musicPlaylistUrl);
});

const retreatsWithoutMemories = computed(() => {
	return attendedRetreats.value.filter((r) => !r.memoryPhotoUrl && !r.musicPlaylistUrl);
});

// --- Gestión de retiros (retiros que administras) ---
const canManage = computed(
	() => can.create('retreat') || can.update('retreat') || can.delete('retreat'),
);

// Un admin solo puede borrar los retiros que él creó; el superadmin, cualquiera.
// El backend es la fuente de verdad (403/409); esto solo controla la visibilidad.
function canDeleteRetreat(retreat: Retreat): boolean {
	if (isSuperadmin.value) return true;
	return can.delete('retreat') && retreat.createdBy === authStore.user?.id;
}

// --- Detector de duplicados: mismo nombre (parish, sin espacios) + misma fecha de inicio ---
function duplicateKey(retreat: Retreat): string {
	const parish = (retreat.parish ?? '').trim().toLowerCase();
	const start = retreat.startDate ? new Date(retreat.startDate).toISOString().slice(0, 10) : '';
	return `${parish}|${start}`;
}

const duplicateKeys = computed(() => {
	const counts = new Map<string, number>();
	for (const r of managedRetreats.value) {
		const k = duplicateKey(r);
		counts.set(k, (counts.get(k) ?? 0) + 1);
	}
	return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k));
});

function isPossibleDuplicate(retreat: Retreat): boolean {
	return duplicateKeys.value.has(duplicateKey(retreat));
}

const isAddModalOpen = ref(false);
const isEditModalOpen = ref(false);
const retreatForEdit = ref<Retreat | null>(null);

const isDeleteOpen = ref(false);
const retreatForDelete = ref<Retreat | null>(null);

function openCreate() {
	isAddModalOpen.value = true;
}

function openEdit(retreat: Retreat) {
	retreatForEdit.value = retreat;
	isEditModalOpen.value = true;
}

function openDelete(retreat: Retreat) {
	retreatForDelete.value = retreat;
	isDeleteOpen.value = true;
}

const handleAdd = async (data: CreateRetreat) => {
	try {
		await retreatStore.createRetreat(data);
		isAddModalOpen.value = false;
	} catch {
		/* el store ya muestra el toast de error */
	}
};

const handleEdit = async (data: Partial<Retreat> & { id: string; _refreshBeds?: boolean }) => {
	try {
		const { _refreshBeds, ...rest } = data;
		await retreatStore.updateRetreat(rest, _refreshBeds);
		isEditModalOpen.value = false;
		retreatForEdit.value = null;
	} catch {
		/* el store ya muestra el toast de error */
	}
};

const loadRetreats = async () => {
	try {
		await retreatMemoryStore.fetchAttendedRetreats();
	} catch (error: any) {
		toast({
			title: 'Error',
			description: error.message || 'No se pudieron cargar tus retiros',
			variant: 'destructive',
		});
	}
};

onMounted(() => {
	loadRetreats();
	// Cargar la lista real de retiros administrados (para la sección de gestión).
	retreatStore.fetchRetreats().catch(() => {});
});
</script>

<template>
	<div class="container mx-auto px-4 py-8 max-w-4xl">
		<!-- Header -->
		<div class="mb-6">
			<h1 class="text-3xl font-bold">Mis Retiros</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Revive los momentos especiales de los retiros en los que participaste
			</p>
		</div>

		<!-- Sección: Retiros que administras -->
		<section v-if="canManage" class="mb-10">
			<div class="flex items-center justify-between mb-4 gap-3">
				<h2 class="text-xl font-semibold">Retiros que administras</h2>
				<Button v-if="can.create('retreat')" size="sm" @click="openCreate">
					<Plus class="w-4 h-4 mr-2" />
					Crear retiro
				</Button>
			</div>

			<div
				v-if="managedRetreats.length === 0"
				class="text-sm text-muted-foreground border rounded-lg p-4"
			>
				No administras ningún retiro todavía.
			</div>

			<div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div
					v-for="retreat in managedRetreats"
					:key="retreat.id"
					class="border rounded-lg p-4 flex items-start justify-between gap-3"
				>
					<div class="min-w-0">
						<div class="flex items-center gap-2 min-w-0">
							<h3 class="font-semibold truncate">{{ retreat.parish }}</h3>
							<span
								v-if="isPossibleDuplicate(retreat)"
								class="flex-shrink-0 inline-flex items-center rounded-full bg-amber-100 text-amber-800 text-xs font-medium px-2 py-0.5"
							>
								Posible duplicado
							</span>
						</div>
						<p class="text-sm text-muted-foreground">
							{{ formatDate(retreat.startDate) }}
						</p>
					</div>
					<div class="flex items-center gap-1 flex-shrink-0">
						<TooltipProvider :delay-duration="150">
							<Tooltip v-if="can.update('retreat')">
								<TooltipTrigger as-child>
									<Button variant="outline" size="icon" aria-label="Editar retiro" @click="openEdit(retreat)">
										<Pencil class="w-4 h-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Editar retiro</TooltipContent>
							</Tooltip>
							<Tooltip v-if="canDeleteRetreat(retreat)">
								<TooltipTrigger as-child>
									<Button
										variant="outline"
										size="icon"
										aria-label="Eliminar retiro"
										class="text-destructive hover:text-destructive"
										@click="openDelete(retreat)"
									>
										<Trash2 class="w-4 h-4" />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Eliminar retiro</TooltipContent>
							</Tooltip>
						</TooltipProvider>
					</div>
				</div>
			</div>
		</section>

		<!-- Loading state -->
		<div v-if="loading && attendedRetreats.length === 0" class="py-12">
			<div class="flex flex-col items-center justify-center">
				<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
				<p class="text-muted-foreground">Cargando tus retiros...</p>
			</div>
		</div>

		<!-- Empty state -->
		<EmptyState
			v-else-if="attendedRetreats.length === 0"
			type="no-results"
			title="Aún no has participado en ningún retiro"
			description="Cuando participes en un retiro, podrás ver los recuerdos aquí"
		/>

		<!-- Retreats with memories -->
		<div v-else>
			<!-- Section: Retreats with memories -->
			<div v-if="retreatsWithMemories.length > 0" class="mb-8">
				<h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-primary"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<polyline points="12 6 12 12 16 14"></polyline>
					</svg>
					Recuerdos compartidos
				</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<RetreatMemoryCard
						v-for="retreat in retreatsWithMemories"
						:key="retreat.id"
						:retreat="retreat"
					/>
				</div>
			</div>

			<!-- Section: Retreats without memories -->
			<div v-if="retreatsWithoutMemories.length > 0">
				<h2 class="text-xl font-semibold mb-4 flex items-center gap-2">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="text-muted-foreground"
					>
						<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
						<rect x="7" y="7" width="3" height="3"></rect>
						<rect x="14" y="7" width="3" height="3"></rect>
						<rect x="7" y="14" width="3" height="3"></rect>
						<rect x="14" y="14" width="3" height="3"></rect>
					</svg>
					Retiros sin recuerdos añadidos
				</h2>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<RetreatMemoryCard
						v-for="retreat in retreatsWithoutMemories"
						:key="retreat.id"
						:retreat="retreat"
					/>
				</div>
			</div>
		</div>

		<!-- Modales de crear / editar retiro (reusan RetreatModal) -->
		<RetreatModal
			:open="isAddModalOpen"
			mode="add"
			@update:open="isAddModalOpen = $event"
			@submit="handleAdd"
		/>
		<RetreatModal
			:open="isEditModalOpen"
			mode="edit"
			:retreat="retreatForEdit"
			@update:open="isEditModalOpen = $event"
			@update="handleEdit"
		/>

		<!-- Confirmación de borrado (componente compartido: exige teclear el nombre exacto) -->
		<DeleteRetreatDialog v-model:open="isDeleteOpen" :retreat="retreatForDelete" />
	</div>
</template>
