<template>
	<div
		class="flex flex-col gap-3"
		:class="editable ? 'min-h-[3rem] rounded-lg transition-colors' : ''"
		:data-flyer-slot="slotName"
		@dragover="onSlotDragOver"
		@drop="onSlotDrop"
	>
		<div
			v-for="(block, index) in blocks"
			:key="block.id"
			:data-flyer-block="block.id"
			:style="styleFor(block.id)"
			class="relative bg-[color:var(--fb-bg)] rounded-[length:var(--fb-radius)] text-[color:var(--fb-text)]"
			:class="[
				stylesById[block.id]?.hasBox ? 'shadow-md backdrop-blur-sm print:backdrop-blur-none' : '',
				editable ? 'cursor-grab active:cursor-grabbing' : '',
				editable && selectedBlockId === block.id ? 'outline outline-2 outline-offset-2 outline-blue-500' : '',
				editable && dropIndicator === block.id ? 'before:absolute before:-top-1.5 before:left-0 before:right-0 before:h-1 before:rounded-full before:bg-blue-500' : '',
			]"
			:draggable="editable"
			@dragstart="emit('dragBlockStart', block.id)"
			@dragend="emit('dragBlockEnd')"
			@dragover="onBlockDragOver($event, block.id, index)"
			@drop="onBlockDrop($event, index)"
			@click="onBlockClick(block.id)"
		>
			<component :is="FLYER_BLOCK_COMPONENTS[block.id]" :content="content" />
		</div>

		<p
			v-if="editable && !blocks.length"
			class="px-2 py-3 text-center text-[11px] text-white/70 select-none"
		>
			{{ emptyLabel }}
		</p>
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { FlyerBlockId, FlyerBlockLayout, FlyerSlot, FlyerTheme, FlyerBlockStyle } from '@repo/types';
import type { FlyerContent } from '@/composables/useFlyerContent';
import { resolveBlockStyle } from '@/utils/flyerStyle';
import { FLYER_BLOCK_COMPONENTS } from './blockRegistry';

const props = withDefaults(
	defineProps<{
		slotName: FlyerSlot;
		blocks: FlyerBlockLayout[];
		content: FlyerContent;
		theme?: FlyerTheme | null;
		blockStyles?: Partial<Record<FlyerBlockId, FlyerBlockStyle>> | null;
		editable?: boolean;
		selectedBlockId?: FlyerBlockId | null;
		emptyLabel?: string;
	}>(),
	{ editable: false, emptyLabel: '' },
);

const emit = defineEmits<{
	/** Where the drop landed. The canvas knows which block is being dragged. */
	dropAt: [slot: FlyerSlot, index: number];
	selectBlock: [blockId: FlyerBlockId];
	dragBlockStart: [blockId: FlyerBlockId];
	dragBlockEnd: [];
}>();

/** Which block currently shows the "it lands here" line. */
const dropIndicator = ref<FlyerBlockId | null>(null);

const stylesById = computed(() => {
	const result: Record<string, ReturnType<typeof resolveBlockStyle>> = {};
	for (const block of props.blocks) {
		result[block.id] = resolveBlockStyle(block.id, props.theme, props.blockStyles);
	}
	return result;
});

function styleFor(blockId: FlyerBlockId) {
	const { hasBox: _hasBox, ...cssVars } = stylesById.value[blockId] ?? {};
	return cssVars as Record<string, string>;
}

// Insertion index is the index of the block being hovered — the same approach the
// side panel used. No getBoundingClientRect: it returns zeroes under happy-dom and
// would also have to account for the preview's transform: scale().
function onBlockDragOver(event: DragEvent, blockId: FlyerBlockId, _index: number) {
	if (!props.editable) return;
	event.preventDefault();
	event.stopPropagation();
	dropIndicator.value = blockId;
}

function onBlockDrop(event: DragEvent, index: number) {
	if (!props.editable) return;
	event.preventDefault();
	event.stopPropagation();
	dropIndicator.value = null;
	emit('dropAt', props.slotName, index);
}

function onSlotDragOver(event: DragEvent) {
	if (!props.editable) return;
	event.preventDefault();
	dropIndicator.value = null;
}

/** Dropping on the column itself, past the last block, appends. */
function onSlotDrop(event: DragEvent) {
	if (!props.editable) return;
	event.preventDefault();
	dropIndicator.value = null;
	emit('dropAt', props.slotName, props.blocks.length);
}

function onBlockClick(blockId: FlyerBlockId) {
	if (!props.editable) return;
	emit('selectBlock', blockId);
}
</script>
