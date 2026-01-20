<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useRetreatMemoryStore } from '@/stores/retreatMemoryStore';
import { useToast } from '@repo/ui';
import RetreatMemoryCard from '@/components/social/RetreatMemoryCard.vue';
import EmptyState from '@/components/social/EmptyState.vue';

const retreatMemoryStore = useRetreatMemoryStore();
const { toast } = useToast();

const { attendedRetreats, loading } = storeToRefs(retreatMemoryStore);

const hasMemories = computed(() => {
	return attendedRetreats.value.some((r) => r.memoryPhotoUrl || r.musicPlaylistUrl);
});

const retreatsWithMemories = computed(() => {
	return attendedRetreats.value.filter((r) => r.memoryPhotoUrl || r.musicPlaylistUrl);
});

const retreatsWithoutMemories = computed(() => {
	return attendedRetreats.value.filter((r) => !r.memoryPhotoUrl && !r.musicPlaylistUrl);
});

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
	</div>
</template>
