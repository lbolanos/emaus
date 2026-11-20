<template>
	<div class="p-4">
		<div class="fb-lead flex gap-4 items-start group">
			<div
				class="bg-gradient-to-br from-purple-500 to-purple-700 p-2.5 rounded-xl text-white shadow-xl flex-shrink-0"
			>
				<FileText class="w-5 h-5" />
			</div>
			<div class="flex-1 min-w-0">
				<h4
					v-if="content.descriptionLabelText"
					class="font-black fb-title text-[length:calc(0.9375rem*var(--fb-title-scale,1))] uppercase text-[color:var(--fb-title-color)] tracking-[0.15em] mb-2"
				>
					{{ content.descriptionLabelText }}
				</h4>
				<!-- The meeting's template keeps its own line breaks and bullets -->
				<div class="fb-body text-[length:calc(1rem*var(--fb-body-scale,1))] text-[color:var(--fb-body-color)] leading-relaxed whitespace-pre-line">
					{{ content.descriptionText }}
				</div>
			</div>
		</div>
	</div>
</template>

<script setup lang="ts">
import { FileText } from 'lucide-vue-next';
import type { MeetingFlyerContent } from '@/composables/useMeetingFlyerContent';

defineProps<{ content: MeetingFlyerContent }>();
</script>
