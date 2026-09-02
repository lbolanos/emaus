<template>
	<section class="rounded-lg border">
		<button
			type="button"
			class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted/50"
			:aria-expanded="open"
			:data-section="name"
			@click="emit('update:open', !open)"
		>
			<ChevronRight
				class="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform"
				:class="open ? 'rotate-90' : ''"
			/>
			<span class="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{{ title }}
			</span>
			<!-- What the section would be saying if it were open -->
			<slot name="summary" />
		</button>

		<!-- v-show, not v-if: collapsing must not lose what is typed inside -->
		<div v-show="open" class="space-y-3 border-t p-3">
			<slot />
		</div>
	</section>
</template>

<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next';

defineProps<{
	/** Identifies the section for tests and for remembering which one was open. */
	name: string;
	title: string;
	open: boolean;
}>();

const emit = defineEmits<{
	'update:open': [open: boolean];
}>();
</script>
