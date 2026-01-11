<template>
	<Dialog :open="open" @update:open="$emit('update:open', $event)">
		<DialogContent class="max-w-3xl max-h-[80vh] overflow-y-auto">
			<DialogHeader>
				<DialogTitle>Historial de {{ member?.participant?.firstName }} {{ member?.participant?.lastName }}</DialogTitle>
				<DialogDescription>
					Todas las interacciones con este miembro de la comunidad
				</DialogDescription>
			</DialogHeader>

			<!-- Loading State -->
			<div v-if="loading" class="flex items-center justify-center py-8">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
			</div>

			<!-- Timeline -->
			<div v-else-if="timelineEvents.length > 0" class="space-y-4 mt-4">
				<div v-for="event in timelineEvents" :key="event.id" class="flex gap-4">
					<!-- Date Column -->
					<div class="text-sm text-muted-foreground w-40 flex-shrink-0 text-right">
						{{ event.date }}
					</div>
					<!-- Event Column -->
					<div class="flex-1 pb-4 border-l-2 pl-4 relative">
						<div class="absolute w-3 h-3 bg-primary rounded-full -left-[7px] top-1"></div>
						<div class="font-medium">{{ event.title }}</div>
						<div class="text-sm text-muted-foreground mt-1">{{ event.description }}</div>
					</div>
				</div>
			</div>

			<!-- Empty State -->
			<div v-else class="text-center py-8">
				<svg class="w-12 h-12 mx-auto text-muted-foreground/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
				</svg>
				<p class="text-sm text-muted-foreground mt-2">No hay historial disponible</p>
			</div>

			<!-- Notes Section -->
			<div v-if="member?.notes" class="mt-6 p-4 bg-muted/50 rounded-lg">
				<div class="font-medium text-sm mb-2">Notas:</div>
				<div class="text-sm text-muted-foreground whitespace-pre-wrap">{{ member.notes }}</div>
			</div>
		</DialogContent>
	</Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from '@repo/ui';

interface TimelineData {
	member: {
		id: string;
		notes?: string | null;
		participant?: {
			firstName?: string;
			lastName?: string;
		};
	};
	attendances: Array<{
		id: string;
		attended: boolean;
		recordedAt: string;
		meeting?: {
			title?: string;
			startDate?: string;
		};
		notes?: string;
	}>;
	meetings: Array<{
		id: string;
		title?: string;
		startDate?: string;
	}>;
}

interface Props {
	open: boolean;
	member: {
		id: string;
		notes?: string | null;
		participant?: {
			firstName?: string;
			lastName?: string;
		};
	} | null;
	timelineData?: TimelineData | null;
	loading?: boolean;
}

interface Emits {
	(e: 'update:open', value: boolean): void;
}

const props = withDefaults(defineProps<Props>(), {
	loading: false,
});

const emit = defineEmits<Emits>();

// Format date for display
const formatDate = (dateString: string | Date) => {
	const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
	return new Intl.DateTimeFormat('es-ES', {
		day: '2-digit',
		month: 'short',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	}).format(date);
};

// Build timeline events from the data
const timelineEvents = computed(() => {
	if (!props.timelineData) return [];

	const events: Array<{
		id: string;
		date: string;
		title: string;
		description: string;
	}> = [];

	// Add attendance records
	for (const attendance of props.timelineData.attendances) {
		const meeting = attendance.meeting;
		events.push({
			id: `attendance-${attendance.id}`,
			date: formatDate(attendance.recordedAt),
			title: attendance.attended ? 'Asistió a reunión' : 'No asistió a reunión',
			description: meeting?.title || 'Reunión',
		});
	}

	// Add member joined event (from member joinedAt if available)
	if (props.member) {
		events.push({
			id: `member-joined-${props.member.id}`,
			date: 'Miembro desde',
			title: 'Se unió a la comunidad',
			description: 'Miembro activo',
		});
	}

	// Sort by date (most recent first)
	return events.sort((a, b) => {
		// Put "Miembro desde" at the end
		if (a.title === 'Se unió a la comunidad') return 1;
		if (b.title === 'Se unió a la comunidad') return -1;
		return b.date.localeCompare(a.date);
	});
});
</script>

<style scoped>
.max-h-\[80vh\] {
	max-height: 80vh;
}

.overflow-y-auto {
	overflow-y: auto;
}
</style>
