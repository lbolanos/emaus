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
					v-if="content.dateLabelText"
					class="font-black fb-title text-[length:calc(0.9375rem*var(--fb-title-scale,1))] uppercase text-[color:var(--fb-title-color)] tracking-[0.15em] mb-1.5"
				>
					{{ content.dateLabelText }}
				</h4>
				<p class="fb-emphasis text-[length:calc(1.25rem*var(--fb-emphasis-scale,1))] font-black text-[color:var(--fb-emphasis-color)] first-letter:uppercase">
					{{ content.dateOnly }}
				</p>
				<p v-if="content.timeOnly" class="fb-body text-[length:calc(1rem*var(--fb-body-scale,1))] text-[color:var(--fb-body-color)] font-bold mt-0.5 opacity-80">
					{{ content.timeOnly }} hrs.
				</p>
				<p v-if="content.durationText" class="fb-body text-[length:calc(1rem*var(--fb-body-scale,1))] text-[color:var(--fb-body-color)] font-bold mt-1 opacity-80">
					<template v-if="content.durationLabelText">{{ content.durationLabelText }}: </template>{{ content.durationText }}
				</p>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { Calendar } from 'lucide-vue-next';
import type { MeetingFlyerContent } from '@/composables/useMeetingFlyerContent';

defineProps<{ content: MeetingFlyerContent }>();
</script>
