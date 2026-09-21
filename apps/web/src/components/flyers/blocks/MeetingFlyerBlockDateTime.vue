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
					class="font-black text-[15px] uppercase text-[color:var(--fb-heading)] tracking-[0.15em] mb-1.5"
				>
					{{ content.dateLabelText }}
				</h4>
				<p class="text-[20px] font-black text-[color:var(--fb-text)] first-letter:uppercase">
					{{ content.dateOnly }}
				</p>
				<p v-if="content.timeOnly" class="text-[16px] text-[color:var(--fb-text)] font-bold mt-0.5 opacity-80">
					{{ content.timeOnly }} hrs.
				</p>
				<p v-if="content.durationText" class="text-[16px] text-[color:var(--fb-text)] font-bold mt-1 opacity-80">
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
