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
			:data-align="stylesById[block.id]?.align"
			:data-highlight-slot="highlightFor(block.id)"
			:data-title-align="stylesById[block.id]?.titleAlign"
			:data-body-align="stylesById[block.id]?.bodyAlign"
			:style="{ ...styleFor(block.id), ...widthStyleFor(block) }"
			class="relative bg-[color:var(--fb-bg)] rounded-[length:var(--fb-radius)] text-[color:var(--fb-text)]"
			:class="[
				stylesById[block.id]?.hasBox ? 'shadow-md backdrop-blur-sm print:backdrop-blur-none' : '',
				editable && !resizingId ? 'cursor-grab active:cursor-grabbing' : '',
				editable && selectedBlockId === block.id ? 'outline outline-2 outline-offset-2 outline-blue-500' : '',
				editable && dropIndicator === block.id ? 'before:absolute before:-top-1.5 before:left-0 before:right-0 before:h-1 before:rounded-full before:bg-blue-500' : '',
				block.width && block.width < 100 ? 'shrink-0' : '',
			]"
			:draggable="editable && !resizingId"
			@dragstart="emit('dragBlockStart', block.id)"
			@dragend="emit('dragBlockEnd')"
			@dragover="onBlockDragOver($event, block.id, index)"
			@drop="onBlockDrop($event, index)"
			@click="onBlockClick(block.id)"
		>
			<component :is="components[block.id]" :content="content" />

			<!-- Move affordance: the block was always draggable, now it says so -->
			<div
				v-if="editable && selectedBlockId === block.id"
				class="absolute -top-2.5 -left-2.5 z-10 flex h-6 w-6 cursor-grab items-center justify-center rounded-md border border-blue-300 bg-blue-500 text-white shadow select-none"
				:title="'Arrastra para mover'"
				data-move-handle
			>
				<svg viewBox="0 0 24 24" class="h-3.5 w-3.5 fill-current">
					<circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
					<circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
					<circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
				</svg>
			</div>

			<!-- Resize edge: grab and drag sideways; double-click restores 100% -->
			<div
				v-if="editable && selectedBlockId === block.id"
				class="absolute top-1/2 -right-2 z-10 flex h-10 w-3.5 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border border-blue-300 bg-blue-500/90 shadow select-none"
				:title="'Arrastra para cambiar el ancho · doble clic restaura'"
				data-resize-handle
				@pointerdown.prevent="startResize($event, block)"
				@dblclick.stop="emit('resizeBlock', block.id, 100)"
				@click.stop
				@dragstart.prevent
			>
				<span class="h-5 w-0.5 rounded bg-white/90"></span>
			</div>
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
import type { Component } from 'vue';
import type { FlyerSlot, FlyerTheme, FlyerBlockStyle } from '@repo/types';
import type { AnyBlockLayout } from '@/utils/flyerLayout';
import { resolveBlockStyle } from '@/utils/flyerStyle';
import { FLYER_BLOCK_COMPONENTS, FLYER_BLOCK_STYLE_DEFAULTS } from './blockRegistry';

const props = withDefaults(
	defineProps<{
		slotName: FlyerSlot;
		blocks: AnyBlockLayout[];
		/** Opaque payload the flavour's blocks read; the column only moves it around. */
		content: Record<string, any>;
		theme?: FlyerTheme | null;
		blockStyles?: Partial<Record<string, FlyerBlockStyle>> | null;
		/** Which flavour's block components and built-in styles to use. */
		components?: Record<string, Component>;
		styleDefaults?: Record<string, FlyerBlockStyle>;
		editable?: boolean;
		selectedBlockId?: string | null;
		highlightSlot?: { slot: string; blockId: string | null } | null;
		emptyLabel?: string;
	}>(),
	{
		editable: false,
		emptyLabel: '',
		components: () => FLYER_BLOCK_COMPONENTS,
		styleDefaults: () => FLYER_BLOCK_STYLE_DEFAULTS,
	},
);

const emit = defineEmits<{
	/** Where the drop landed. The canvas knows which block is being dragged. */
	dropAt: [slot: FlyerSlot, index: number];
	selectBlock: [blockId: string];
	dragBlockStart: [blockId: string];
	dragBlockEnd: [];
	/** Edge-drag resize: the new width in percent of the column. */
	resizeBlock: [blockId: string, width: number];
}>();

/** Which block currently shows the "it lands here" line. */
const dropIndicator = ref<string | null>(null);

/** Block whose resize edge is being dragged; suppresses the drag-and-drop
 *  machinery so grabbing the edge never starts a move. */
const resizingId = ref<string | null>(null);

/** Width as CSS: percent of the column, lined up by the block's alignment
 *  (a shrunk block floats to the side its own words are on). */
function widthStyleFor(block: AnyBlockLayout): Record<string, string> {
	if (!block.width || block.width >= 100) return {};
	const margins: Record<string, [string, string]> = {
		left: ['0', 'auto'],
		center: ['auto', 'auto'],
		right: ['auto', '0'],
	};
	const [marginLeft, marginRight] = margins[stylesById.value[block.id]?.align ?? 'left'];
	return {
		width: `${block.width}%`,
		marginLeft,
		marginRight,
	};
}

/**
 * Edge resize: pointer-captured, in column-width percent, in 5% steps, so the
 * stored value is stable no matter how sloppy the drag is. happy-dom tests
 * only assert the emitted percent, never the pixels.
 */
function startResize(event: PointerEvent, block: AnyBlockLayout) {
	const column = (event.target as HTMLElement).closest('[data-flyer-slot]') as HTMLElement | null;
	if (!column) return;
	const columnWidth = column.clientWidth || 1;
	const startWidth = block.width ?? 100;
	const startX = event.clientX;
	resizingId.value = block.id;
	(event.target as HTMLElement).setPointerCapture(event.pointerId);

	const onMove = (moveEvent: PointerEvent) => {
		const pct = ((startWidth * columnWidth) / 100 + moveEvent.clientX - startX) / columnWidth * 100;
		emit('resizeBlock', block.id, Math.round(pct / 5) * 5);
	};
	const onUp = () => {
		resizingId.value = null;
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
	};
	window.addEventListener('pointermove', onMove);
	window.addEventListener('pointerup', onUp);
}

const stylesById = computed(() => {
	const result: Record<string, ReturnType<typeof resolveBlockStyle>> = {};
	for (const block of props.blocks) {
		result[block.id] = resolveBlockStyle(block.id, props.theme, props.blockStyles, props.styleDefaults);
	}
	return result;
});

/** The hover glow only reaches its own block; the whole-flyer panel (null
 *  blockId) reaches every one of them. */
function highlightFor(blockId: string): string | null {
	const highlight = props.highlightSlot;
	if (!highlight) return null;
	return highlight.blockId && highlight.blockId !== blockId ? null : highlight.slot;
}

function styleFor(blockId: string) {
	const { hasBox: _hasBox, align: _align, titleAlign: _t, bodyAlign: _b, ...cssVars } =
		stylesById.value[blockId] ?? {};
	return cssVars as Record<string, string>;
}

// Insertion index is the index of the block being hovered — the same approach the
// side panel used. No getBoundingClientRect: it returns zeroes under happy-dom and
// would also have to account for the preview's transform: scale().
function onBlockDragOver(event: DragEvent, blockId: string, _index: number) {
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

function onBlockClick(blockId: string) {
	if (!props.editable) return;
	emit('selectBlock', blockId);
}
</script>
