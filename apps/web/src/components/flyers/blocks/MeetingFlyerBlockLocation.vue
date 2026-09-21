<template>
	<div class="p-4">
		<div class="fb-lead flex gap-4 items-start group">
			<div
				class="bg-gradient-to-br from-green-500 to-green-700 p-2.5 rounded-xl text-white shadow-xl flex-shrink-0"
			>
				<MapPin class="w-5 h-5" />
			</div>
			<div class="flex-1 min-w-0">
				<h4
					v-if="content.locationLabelText"
					class="font-black text-[15px] uppercase text-[color:var(--fb-heading)] tracking-[0.15em] mb-1.5"
				>
					{{ content.locationLabelText }}
				</h4>
				<p class="text-[18px] font-black text-[color:var(--fb-text)] leading-tight">
					{{ content.communityName }}
				</p>
				<p class="text-[14px] text-[color:var(--fb-text)] leading-snug mt-1 font-medium opacity-90">
					{{ content.address }}
				</p>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { MapPin } from 'lucide-vue-next';
import type { MeetingFlyerContent } from '@/composables/useMeetingFlyerContent';

defineProps<{ content: MeetingFlyerContent }>();
</script>
