<template>
	<span
		class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
		:style="{ backgroundColor: badgeColor, color: textColor }"
	>
		{{ tag.name }}
		<button
			v-if="removable"
			@click="$emit('remove')"
			class="hover:opacity-70 ml-1"
			:title="$t('tags.remove')"
		>
			<X class="w-3 h-3" />
		</button>
	</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import type { Tag } from '@repo/types';

const props = defineProps<{
	tag: Tag;
	removable?: boolean;
}>();

defineEmits<{
	remove: [];
}>();

// Calculate background color (use tag color or default gray)
const badgeColor = computed(() => props.tag.color || '#E5E7EB');

// Calculate text color (black or white based on background brightness)
const textColor = computed(() => {
	if (!props.tag.color) return '#374151';
	// Simple brightness calculation
	const hex = props.tag.color.replace('#', '');
	const r = parseInt(hex.substr(0, 2), 16);
	const g = parseInt(hex.substr(2, 2), 16);
	const b = parseInt(hex.substr(4, 2), 16);
	const brightness = (r * 299 + g * 587 + b * 114) / 1000;
	return brightness > 128 ? '#000000' : '#FFFFFF';
});
</script>
