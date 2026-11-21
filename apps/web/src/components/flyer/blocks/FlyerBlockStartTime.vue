<template>
	<div class="p-4">
		<div class="fb-lead flex gap-4 items-start group">
			<div
				class="bg-gradient-to-br from-blue-500 to-blue-700 p-2.5 rounded-xl text-white shadow-xl flex-shrink-0"
			>
				<Clock class="w-5 h-5" />
			</div>
			<div class="flex-1 min-w-0">
				<h4
					class="font-black fb-title text-[length:calc(0.9375rem*var(--fb-title-scale,1))] uppercase text-[color:var(--fb-title-color)] tracking-[0.15em] mb-1.5"
				>
					{{ t('retreatFlyer.startTime') }}
				</h4>
				<p class="fb-emphasis text-[length:calc(1.0625rem*var(--fb-emphasis-scale,1))] text-[color:var(--fb-emphasis-color)] font-bold mb-0.5">
					{{ content.formatDate(content.startDate) }}
				</p>
				<!-- Body, not emphasis: born --fb-text near-black, and one slot cannot
				     hold two colours — the date keeps the heading colour it was born
				     with, the time rides Texto so saved flyers render as they did -->
				<p class="fb-body text-[length:calc(1.375rem*var(--fb-body-scale,1))] font-black text-[color:var(--fb-body-color)] mt-1">{{ content.openingTimeDisplay }}</p>
				<div
					v-if="content.registrationDeadline"
					class="mt-3 border-l-4 border-[color:var(--fb-heading)] pl-3.5 py-1"
				>
					<p class="fb-body fb-row text-[length:calc(0.8125rem*var(--fb-body-scale,1))] text-[color:var(--fb-body-color)] font-bold flex items-center gap-2.5">
						<span class="fb-body text-[length:calc(0.875rem*var(--fb-body-scale,1))] leading-tight whitespace-pre-line">
							{{ content.registrationDeadline }}
						</span>
					</p>
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Clock } from 'lucide-vue-next';
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{ content: FlyerContent }>();

const { t } = useI18n();
</script>
