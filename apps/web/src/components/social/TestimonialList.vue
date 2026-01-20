<template>
	<div class="space-y-4">
		<!-- Header with tabs -->
		<div class="flex items-center justify-between">
			<div class="flex gap-2">
				<button
					v-for="tab in tabs"
					:key="tab.key"
					@click="currentTab = tab.key"
					:class="tabClasses(tab.key)"
					class="px-4 py-2 rounded-lg font-medium text-sm transition-colors"
				>
					{{ tab.label }}
				</button>
			</div>
		</div>

		<!-- Loading state -->
		<div v-if="loading && testimonials.length === 0" class="space-y-4">
			<div
				v-for="i in 3"
				:key="i"
				class="p-4 rounded-lg border bg-card animate-pulse"
			>
				<div class="flex items-center gap-3 mb-3">
					<div class="w-10 h-10 rounded-full bg-muted"></div>
					<div class="space-y-1 flex-1">
						<div class="h-4 bg-muted rounded w-1/3"></div>
						<div class="h-3 bg-muted rounded w-20"></div>
					</div>
				</div>
				<div class="space-y-2">
					<div class="h-4 bg-muted rounded"></div>
					<div class="h-4 bg-muted rounded w-3/4"></div>
				</div>
			</div>
		</div>

		<!-- Empty state -->
		<div
			v-else-if="!loading && filteredTestimonials.length === 0"
			class="p-8 text-center"
		>
			<div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="32"
					height="32"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="text-muted-foreground"
				>
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
				</svg>
			</div>
			<h3 class="text-lg font-semibold mb-1">{{ emptyTitle }}</h3>
			<p class="text-muted-foreground">{{ emptyMessage }}</p>
		</div>

		<!-- Testimonials list -->
		<div v-else class="space-y-4">
			<TestimonialCard
				v-for="testimonial in filteredTestimonials"
				:key="testimonial.id"
				:testimonial="testimonial"
				@edit="emit('edit', $event)"
				@delete="emit('delete', $event)"
			/>

			<!-- Load more indicator -->
			<div
				v-if="loading && testimonials.length > 0"
				class="flex justify-center py-4"
			>
				<div class="inline-flex items-center gap-2 text-muted-foreground text-sm">
					<svg
						class="animate-spin"
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
					</svg>
					Cargando...
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import TestimonialCard from './TestimonialCard.vue';
import type { Testimonial } from '@/stores/testimonialStore';
import { useAuthStore as _useAuthStore } from '@/stores/authStore';

function useAuthStore() {
	return _useAuthStore();
}

interface Tab {
	key: string;
	label: string;
}

interface Props {
	testimonials: Testimonial[];
	loading?: boolean;
	showMineTab?: boolean;
	retreatId?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
	loading: false,
	showMineTab: true,
	retreatId: null,
});

const emit = defineEmits<{
	(e: 'edit', testimonial: Testimonial): void;
	(e: 'delete', testimonial: Testimonial): void;
}>();

// State
const currentTab = ref(props.showMineTab ? 'mine' : 'all');

// Tabs definition
const tabs = computed((): Tab[] => {
	const baseTabs: Tab[] = [
		{ key: 'all', label: 'Todos' },
	];
	if (props.showMineTab) {
		baseTabs.unshift({ key: 'mine', label: 'Mis testimonios' });
	}
	return baseTabs;
});

// Filter testimonials based on current tab
const filteredTestimonials = computed(() => {
	const authStore = useAuthStore();
	const userId = authStore.user?.id;

	console.log('[TESTIMONIAL LIST] Filtering testimonials:', {
		currentTab: currentTab.value,
		userId,
		totalTestimonials: props.testimonials.length,
		testimonials: props.testimonials
	});

	let filtered;
	if (currentTab.value === 'mine' && userId) {
		filtered = props.testimonials.filter((t) => t.userId === userId);
		console.log('[TESTIMONIAL LIST] Filtered for "mine":', filtered);
	} else {
		filtered = props.testimonials;
		console.log('[TESTIMONIAL LIST] Showing all:', filtered);
	}

	console.log('[TESTIMONIAL LIST] Final filtered count:', filtered.length);
	return filtered;
});

// Tab classes
const tabClasses = (tabKey: string) => {
	const base = 'transition-colors';
	if (currentTab.value === tabKey) {
		return `${base} bg-primary text-primary-foreground`;
	}
	return `${base} hover:bg-secondary`;
};

// Empty state messages
const emptyTitle = computed(() => {
	if (currentTab.value === 'mine') return 'Aún no has compartido tu experiencia';
	return 'No hay testimonios aún';
});

const emptyMessage = computed(() => {
	if (currentTab.value === 'mine') {
		return 'Comparte tu experiencia de los retiros en los que has participado';
	}
	return 'Sé el primero en compartir un testimonio';
});

// Reset tab when retreatId changes
watch(
	() => props.retreatId,
	() => {
		currentTab.value = props.showMineTab ? 'mine' : 'all';
	}
);
</script>
