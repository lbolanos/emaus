<template>
	<div class="p-4">
		<div class="fb-lead flex gap-4 items-start group">
			<div
				class="bg-gradient-to-br from-blue-500 to-blue-700 p-2.5 rounded-xl text-white shadow-xl flex-shrink-0"
			>
				<Calendar class="w-5 h-5" />
			</div>
			<div class="flex-1 min-w-0">
				<h4
					class="font-black fb-title text-[length:calc(0.9375rem*var(--fb-title-scale,1))] uppercase text-[color:var(--fb-title-color)] tracking-[0.15em] mb-1.5"
				>
					{{ t('retreatFlyer.endTime') }}
				</h4>
				<p data-end-date class="fb-emphasis text-[length:calc(1.0625rem*var(--fb-emphasis-scale,1))] text-[color:var(--fb-emphasis-color)] font-bold mb-0.5">
					{{ content.formatDate(content.endDate) }}
				</p>
				<div v-if="content.closingLocation" class="mb-2">
					<p
						class="font-semibold text-[color:var(--fb-body-color)] fb-body text-[length:calc(0.75rem*var(--fb-body-scale,1))] leading-tight whitespace-pre-line"
					>
						{{ content.closingLocation }}
					</p>
				</div>
				<!-- inline-flex, not flex: block-level it stretched to the column and the
				     warning read as an empty amber bar with a line of text inside -->
				<p
					v-if="content.arrivalTimeNoteText"
					data-arrival-note
					class="fb-row text-gray-800 font-bold uppercase fb-body text-[length:calc(0.75rem*var(--fb-body-scale,1))] inline-flex max-w-full items-center gap-2 bg-amber-50/80 px-3 py-2 rounded-lg border border-amber-200 whitespace-pre-line"
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
