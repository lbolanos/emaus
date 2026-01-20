<template>
	<div class="p-4 rounded-lg border bg-card">
		<!-- Header: User info and actions -->
		<div class="flex items-start justify-between gap-3 mb-3">
			<div class="flex items-center gap-3 min-w-0">
				<!-- Avatar -->
				<div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold flex-shrink-0 overflow-hidden">
					<img
						v-if="testimonial.user?.photo"
						:src="testimonial.user.photo"
						:alt="`${testimonial.user.displayName} avatar`"
						class="w-full h-full object-cover"
					/>
					<span v-else>{{ initials }}</span>
				</div>

				<!-- User info -->
				<div class="min-w-0">
					<h4 class="font-semibold text-sm truncate">{{ testimonial.user?.displayName }}</h4>
					<p class="text-xs text-muted-foreground">{{ formatDate(testimonial.createdAt) }}</p>
				</div>
			</div>

			<!-- Visibility badge -->
			<span
				:class="visibilityBadgeClasses"
				class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0"
			>
				{{ visibilityLabel }}
			</span>
		</div>

		<!-- Content -->
		<p class="text-sm whitespace-pre-wrap mb-3">{{ testimonial.content }}</p>

		<!-- Retreat info (if applicable) -->
		<div v-if="testimonial.retreat" class="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
			<svg
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
				<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
				<polyline points="9 22 9 12 15 12 15 22"></polyline>
			</svg>
			<span>{{ testimonial.retreat.parish }}</span>
		</div>

		<!-- Footer: Landing page status and actions -->
		<div class="flex items-center justify-between pt-3 border-t">
			<!-- Landing page status -->
			<div v-if="canManageLanding" class="flex items-center gap-1.5 text-xs">
				<span
					v-if="testimonial.allowLandingPage && testimonial.approvedForLanding"
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<polyline points="20 6 9 17 4 12"></polyline>
					</svg>
					<span>En landing</span>
				</span>
				<span
					v-else-if="testimonial.allowLandingPage"
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<polyline points="12 6 12 12 16 14"></polyline>
					</svg>
					<span>Pendiente</span>
				</span>
			</div>
			<div v-else></div>

			<!-- Actions -->
			<div class="flex items-center gap-2">
				<!-- Edit button (only for owner) -->
				<button
					v-if="isOwner"
					@click="emit('edit', testimonial)"
					class="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
					:title="'Editar testimonio'"
				>
					<svg
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
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
					</svg>
				</button>

				<!-- Delete button (only for owner) -->
				<button
					v-if="isOwner"
					@click="emit('delete', testimonial)"
					class="p-1.5 rounded-md hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
					:title="'Eliminar testimonio'"
				>
					<svg
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
						<polyline points="3 6 5 6 21 6"></polyline>
						<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
						<line x1="10" y1="11" x2="10" y2="17"></line>
						<line x1="14" y1="11" x2="14" y2="17"></line>
					</svg>
				</button>

				<!-- Approve/Revoke button (only for superadmin) -->
				<button
					v-if="canManageLanding && testimonial.allowLandingPage"
					@click="handleLandingToggle"
					class="p-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
					:title="testimonial.approvedForLanding ? 'Revocar aprobación' : 'Aprobar para landing'"
				>
					<svg
						v-if="testimonial.approvedForLanding"
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
						<polyline points="20 6 9 17 4 12"></polyline>
					</svg>
					<svg
						v-else
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
						<circle cx="12" cy="12" r="10"></circle>
						<polyline points="12 6 12 12 16 14"></polyline>
					</svg>
				</button>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { Testimonial } from '@/stores/testimonialStore';
import { useAuthStore } from '@/stores/authStore';

interface Props {
	testimonial: Testimonial;
}

const props = defineProps<Props>();

const emit = defineEmits<{
	(e: 'edit', testimonial: Testimonial): void;
	(e: 'delete', testimonial: Testimonial): void;
}>();

const authStore = useAuthStore();

// Computed
const isOwner = computed(() => {
	return props.testimonial.userId === authStore.user?.id;
});

const canManageLanding = computed(() => {
	return authStore.userProfile?.roles?.some((role) => role.role.name === 'superadmin');
});

const initials = computed(() => {
	const name = props.testimonial.user?.displayName || '';
	const names = name.trim().split(/\s+/);
	if (names.length === 0) return '?';
	if (names.length === 1) {
		return names[0].charAt(0).toUpperCase();
	}
	return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
});

const visibilityLabel = computed(() => {
	const labels: Record<string, string> = {
		public: 'Público',
		friends: 'Amigos',
		retreat_participants: 'Participantes',
		private: 'Privado',
	};
	return labels[props.testimonial.visibility] || props.testimonial.visibility;
});

const visibilityBadgeClasses = computed(() => {
	const classes: Record<string, string> = {
		public: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
		friends: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
		retreat_participants: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
		private: 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400',
	};
	return classes[props.testimonial.visibility] || classes.private;
});

// Methods
const formatDate = (dateString: string) => {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return 'Hoy';
	if (diffDays === 1) return 'Ayer';
	if (diffDays < 7) return `Hace ${diffDays} días`;
	if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} semanas`;
	if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
	return `Hace ${Math.floor(diffDays / 365)} años`;
};

const handleLandingToggle = () => {
	if (props.testimonial.approvedForLanding) {
		emit('edit', { ...props.testimonial, approvedForLanding: false });
	} else {
		emit('edit', { ...props.testimonial, approvedForLanding: true });
	}
};
</script>
