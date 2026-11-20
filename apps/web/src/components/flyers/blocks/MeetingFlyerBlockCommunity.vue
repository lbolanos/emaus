<template>
	<div class="p-4">
		<div class="fb-lead flex-col items-center justify-center gap-1 text-center">
			<p
				v-if="content.communityBrandText"
				class="fb-title text-[length:calc(0.8125rem*var(--fb-title-scale,1))] font-black uppercase tracking-[0.2em] text-[color:var(--fb-title-color)]"
			>
				{{ content.communityBrandText }}
			</p>
			<!-- Dropped when the community's own name already starts with Emaús -->
			<p
				v-if="content.showEmausLine"
				class="fb-emphasis text-[length:calc(1.375rem*var(--fb-emphasis-scale,1))] font-black uppercase tracking-[0.35em] text-[color:var(--fb-emphasis-color)] leading-none"
			>
				{{ content.emausLine }}
			</p>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { MeetingFlyerContent } from '@/composables/useMeetingFlyerContent';

defineProps<{ content: MeetingFlyerContent }>();
</script>
