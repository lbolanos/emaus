<template>
	<div class="p-4">
		<div class="flex gap-4 items-start group">
			<div
				class="bg-gradient-to-br from-blue-500 to-blue-700 p-2.5 rounded-xl text-white shadow-xl flex-shrink-0"
			>
				<Calendar class="w-5 h-5" />
			</div>
			<div class="flex-1 min-w-0">
				<h4
					class="font-black text-[15px] uppercase text-[color:var(--fb-heading)] tracking-[0.15em] mb-1.5"
				>
					{{ t('retreatFlyer.endTime') }}
				</h4>
				<p data-end-date class="text-[17px] text-yellow-300 font-bold mb-0.5 drop-shadow-lg">
					{{ content.formatDate(content.endDate) }}
				</p>
				<div v-if="content.closingLocation" class="mb-2">
					<p class="font-semibold text-[color:var(--fb-text)] text-[12px] leading-tight">
						{{ content.closingLocation }}
					</p>
				</div>
				<p
					class="text-gray-800 font-bold uppercase text-[12px] flex items-center gap-2 bg-amber-50/80 px-3 py-2 rounded-lg border border-amber-200"
				>
					<Users class="w-5 h-5 flex-shrink-0" /> {{ content.arrivalTimeNoteText }}
				</p>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Calendar, Users } from 'lucide-vue-next';
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{ content: FlyerContent }>();

const { t } = useI18n();
</script>
