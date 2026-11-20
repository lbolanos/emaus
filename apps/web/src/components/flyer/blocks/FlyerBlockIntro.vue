<template>
	<div class="p-4">
		<p
			v-if="content.encounterDescriptionHtml"
			data-text-override="encounterDescriptionOverride"
			class="fb-body text-[length:calc(1.125rem*var(--fb-body-scale,1))] text-[color:var(--fb-body-color)] leading-relaxed font-medium"
		>
			<span class="font-bold" v-html="content.encounterDescriptionHtml"></span>
		</p>
		<div v-if="content.dareToLiveItText" class="mt-3">
			<!-- block w-fit + data-emphasis-box: text-align cannot move an inline
			     box, so the badge lines up by the emphasis slot's auto margins -->
			<span
				data-text-override="dareToLiveItOverride"
				data-emphasis-box
				class="block w-fit font-black fb-emphasis text-[color:var(--fb-emphasis-color)] text-[length:calc(1.625rem*var(--fb-emphasis-scale,1))] px-5 py-2 rounded-xl tracking-wide border-2 border-current/30"
			>
				{{ content.dareToLiveItText }}
			</span>
		</div>
	</div>
</template>

<script setup lang="ts">
import type { FlyerContent } from '@/composables/useFlyerContent';

defineProps<{ content: FlyerContent }>();
</script>
