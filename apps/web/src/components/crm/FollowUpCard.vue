<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { MessageSquare, MailOpen, Ban, CheckSquare } from 'lucide-vue-next';
import { formatDate, resolvePalancas } from '@repo/utils';

const props = defineProps<{
	participant: any;
	/** Última vez que se movió el seguimiento (no la del último mensaje). */
	lastActivityAt?: string | Date | null;
	/** Mensajes enviados a esta persona y sus contactos. */
	messageCount?: number;
	openTasks?: number;
	/** Umbral de cartas del retiro; null cae al default del helper. */
	minPalancas?: number | null;
	selected?: boolean;
}>();

const { t } = useI18n();

const name = computed(() =>
	`${props.participant?.firstName ?? ''} ${props.participant?.lastName ?? ''}`.trim(),
);

/**
 * Un único criterio para las cartas — `resolvePalancas` de @repo/utils.
 * `unknown` (capturadas como texto) NO se pinta igual que `none`: eso es
 * justo lo que hacía ver a un caminante con cartas como «Pendiente».
 */
const palancas = computed(() => resolvePalancas(props.participant ?? {}, props.minPalancas));

const palancaClass = computed(() => {
	switch (palancas.value.milestone) {
		case 'met':
			return 'bg-green-100 text-green-800';
		case 'below':
			return 'bg-amber-100 text-amber-800';
		case 'unknown':
			return 'bg-purple-100 text-purple-800';
		default:
			return 'bg-gray-100 text-gray-600';
	}
});

const palancaLabel = computed(() =>
	palancas.value.milestone === 'unknown'
		? '?'
		: t('followUp.lettersOf', {
				count: palancas.value.count ?? 0,
				threshold: palancas.value.threshold,
			}),
);

const attendance = computed(() => props.participant?.attendanceConfirmation ?? 'pending');
</script>

<template>
	<div
		class="bg-white border rounded-md p-2.5 space-y-1.5 cursor-pointer hover:border-blue-400 hover:shadow-sm transition"
		:class="selected ? 'ring-2 ring-blue-500 border-blue-500' : ''"
	>
		<div class="flex items-start justify-between gap-2">
			<span class="text-sm font-medium leading-tight min-w-0 break-words">{{ name }}</span>
			<span v-if="lastActivityAt" class="text-[11px] text-gray-400 shrink-0">
				{{ formatDate(lastActivityAt as any, { format: 'datetime' }) }}
			</span>
		</div>

		<div class="flex flex-wrap items-center gap-1">
			<!-- Cartas (palancas) -->
			<span
				class="inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5"
				:class="palancaClass"
				:title="
					palancas.milestone === 'unknown'
						? t('followUp.lettersUnknownHint')
						: t('followUp.letters')
				"
			>
				<MailOpen class="w-3 h-3" />
				{{ palancaLabel }}
			</span>

			<!-- Confirmación de asistencia real -->
			<span
				v-if="attendance !== 'pending'"
				class="text-[11px] rounded px-1.5 py-0.5"
				:class="attendance === 'confirmed' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
			>
				{{ t('followUp.statuses.' + (attendance === 'confirmed' ? 'confirmed' : 'declined')) }}
			</span>

			<!-- Mensajes que le hemos enviado -->
			<span
				v-if="messageCount"
				class="inline-flex items-center gap-1 text-[11px] text-gray-500"
			>
				<MessageSquare class="w-3 h-3" />{{ messageCount }}
			</span>

			<span
				v-if="openTasks"
				class="inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 bg-blue-100 text-blue-800"
			>
				<CheckSquare class="w-3 h-3" />
				{{ openTasks }}
			</span>

			<span
				v-if="participant?.doNotContact"
				class="inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 bg-red-100 text-red-800"
				:title="t('followUp.doNotContact')"
			>
				<Ban class="w-3 h-3" />
			</span>
		</div>
	</div>
</template>
