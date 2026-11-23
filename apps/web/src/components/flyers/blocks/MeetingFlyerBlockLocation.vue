<template>
	<div class="p-4">
		<div class="fb-lead flex gap-4 items-start group">
			<div
				class="fb-title-chip bg-gradient-to-br from-green-500 to-green-700 p-2.5 rounded-xl text-white shadow-xl flex-shrink-0"
			>
				<MapPin class="w-5 h-5" />
			</div>
			<div class="flex-1 min-w-0">
				<h4
					v-if="content.locationLabelText"
					data-text-override="locationLabelOverride"
					class="font-black fb-title text-[length:calc(0.9375rem*var(--fb-title-scale,1))] uppercase text-[color:var(--fb-title-color)] tracking-[0.15em] mb-1.5"
				>
					{{ content.locationLabelText }}
				</h4>
				<p class="fb-emphasis text-[length:calc(1.125rem*var(--fb-emphasis-scale,1))] font-black text-[color:var(--fb-emphasis-color)] leading-tight">
					{{ content.communityName }}
				</p>
				<p class="fb-body text-[length:calc(0.875rem*var(--fb-body-scale,1))] text-[color:var(--fb-body-color)] leading-snug mt-1 font-medium opacity-90">
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
