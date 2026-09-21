<template>
	<div
		:id="printable ? 'printable-area' : undefined"
		:data-custom-canvas="printable ? '' : undefined"
		class="print-optimized shadow-2xl print:shadow-none rounded-3xl overflow-hidden print:overflow-visible print:rounded-none relative bg-white border border-gray-200 print:border-none"
		:style="[
			{ fontFamily: `'Roboto', sans-serif`, width: '100%', maxWidth: '850px', margin: '0 auto' },
			scale < 1 ? { transform: `scale(${scale})`, transformOrigin: 'top left', width: '850px' } : {},
		]"
	>
		<MeetingFlyerHeader
			:content="content"
			:background-image="images.headerBackground"
			:logo="images.logo"
		/>

		<!-- Body: managed grid of blocks -->
		<div
			class="print-exact relative p-4 min-h-[380px]"
			data-main-content
			:style="{
				backgroundImage: `url(${images.bodyBackground})`,
				backgroundSize: 'cover',
				backgroundPosition: 'center',
			}"
		>
			<!-- Wash between the artwork and the text; how strong it is comes from the theme -->
			<div
				class="print-exact absolute inset-0 pointer-events-none"
				:style="{ backgroundColor: scrimColor }"
			></div>

			<div class="relative z-10 grid grid-cols-2 gap-x-3 items-start">
				<FlyerSlotColumn
					v-for="slotName in ['left', 'right'] as const"
					:key="slotName"
					:slot-name="slotName"
					:blocks="blocksInSlot[slotName]"
					:content="content"
					:theme="theme"
					:block-styles="blockStyles"
					:components="MEETING_FLYER_BLOCK_COMPONENTS"
					:style-defaults="MEETING_FLYER_BLOCK_STYLE_DEFAULTS"
					:editable="editable"
					:selected-block-id="selectedBlockId"
					:empty-label="emptySlotLabel"
					@drop-at="onDropAt"
					@select-block="(id) => emit('selectBlock', id)"
					@drag-block-start="draggingId = $event"
					@drag-block-end="draggingId = null"
				/>
			</div>

			<FlyerSlotColumn
				v-if="blocksInSlot.wide.length || editable"
				slot-name="wide"
				class="relative z-10 mt-3"
				:blocks="blocksInSlot.wide"
				:content="content"
				:theme="theme"
				:block-styles="blockStyles"
				:components="MEETING_FLYER_BLOCK_COMPONENTS"
				:style-defaults="MEETING_FLYER_BLOCK_STYLE_DEFAULTS"
				:editable="editable"
				:selected-block-id="selectedBlockId"
				:empty-label="emptySlotLabel"
				@drop-at="onDropAt"
				@select-block="(id) => emit('selectBlock', id)"
				@drag-block-start="draggingId = $event"
				@drag-block-end="draggingId = null"
			/>
		</div>

		<MeetingFlyerFooter :content="content" :background-image="images.footerBackground" />
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
	FlyerBlockStyle,
	FlyerImages,
	FlyerSlot,
	FlyerTheme,
	MeetingFlyerBlockLayout,
} from '@repo/types';
import { useMeetingFlyerContent } from '@/composables/useMeetingFlyerContent';
import { resolveScrim } from '@/utils/flyerStyle';
import FlyerSlotColumn from '../flyer/FlyerSlotColumn.vue';
import MeetingFlyerHeader from './MeetingFlyerHeader.vue';
import MeetingFlyerFooter from './MeetingFlyerFooter.vue';
import {
	MEETING_FLYER_BLOCK_COMPONENTS,
	MEETING_FLYER_BLOCK_STYLE_DEFAULTS,
	MEETING_FLYER_DEFAULT_LAYOUT,
	MEETING_FLYER_PRESET_IMAGES,
} from './meetingBlockRegistry';

const props = withDefaults(
	defineProps<{
		meeting: any;
		community: any;
		flyerOptions?: any;
		/** Block arrangement; falls back to the default layout. */
		layout?: MeetingFlyerBlockLayout[];
		/** Image overrides; each missing key falls back to its preset. */
		imageOverrides?: FlyerImages;
		/** Palette for every block, plus the wash over the background image. */
		theme?: FlyerTheme | null;
		/** Per-block overrides on top of the theme. */
		blockStyles?: Partial<Record<string, FlyerBlockStyle>> | null;
		/** Mobile downscale of the fixed 850px design. */
		scale?: number;
		/**
		 * Whether this is *the* flyer of the page. Print, copy and PDF all target
		 * #printable-area, so a second canvas on screen — the editor's preview, say —
		 * must not claim the same id.
		 */
		printable?: boolean;
		/** Turns the flyer into a drop target. Off for the read-only view. */
		editable?: boolean;
		selectedBlockId?: string | null;
		emptySlotLabel?: string;
	}>(),
	{ scale: 1, editable: false, emptySlotLabel: '', printable: true },
);

const emit = defineEmits<{
	moveBlock: [blockId: string, slot: FlyerSlot, index: number];
	selectBlock: [blockId: string];
}>();

/** Which block the pointer is carrying; the columns only report where it landed. */
const draggingId = ref<string | null>(null);

function onDropAt(slot: FlyerSlot, index: number) {
	if (!draggingId.value) return;
	emit('moveBlock', draggingId.value, slot, index);
	draggingId.value = null;
}

const scrimColor = computed(() => resolveScrim(props.theme));

const content = useMeetingFlyerContent(
	() => props.meeting,
	() => props.community,
	() => props.flyerOptions,
);

const images = computed(() => ({
	bodyBackground:
		props.imageOverrides?.bodyBackground || MEETING_FLYER_PRESET_IMAGES.bodyBackground,
	headerBackground:
		props.imageOverrides?.headerBackground || MEETING_FLYER_PRESET_IMAGES.headerBackground,
	footerBackground:
		props.imageOverrides?.footerBackground || MEETING_FLYER_PRESET_IMAGES.footerBackground,
	logo: props.imageOverrides?.logo || MEETING_FLYER_PRESET_IMAGES.logo,
}));

const blocksInSlot = computed(() => {
	const layout = props.layout ?? MEETING_FLYER_DEFAULT_LAYOUT;
	const bySlot: Record<FlyerSlot, MeetingFlyerBlockLayout[]> = { left: [], right: [], wide: [] };

	for (const block of layout) {
		if (block.visible === false) continue;
		bySlot[block.slot]?.push(block);
	}
	for (const slot of Object.keys(bySlot) as FlyerSlot[]) {
		bySlot[slot].sort((a, b) => a.order - b.order);
	}
	return bySlot;
});
</script>

<style>
/* Not scoped: these rules must reach elements rendered by the child block components.
   Anchored to .print-optimized, the canvas root, so nothing leaks into the rest of
   the app. Same rules the retreat canvas carries — they are idempotent by class. */
@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Miltonian+Tattoo&family=Oswald:wght@300;400;500;700;900&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&display=swap');

.print-optimized {
	width: 100%;
	max-width: 850px;
	margin: 0 auto;
}

/* Force browsers to print backgrounds and colors */
.print-optimized .print-exact,
.print-optimized {
	-webkit-print-color-adjust: exact !important;
	print-color-adjust: exact !important;
	color-adjust: exact !important;
}

/*
 * Alignment inside a block: `text-align` alone gets the text but not the furniture
 * (icon chips, the QR plate), which is laid out with flex. Same contract as the
 * retreat canvas — see RetreatFlyerCanvas.vue for the long explanation.
 */
.print-optimized [data-flyer-block] {
	text-align: var(--fb-align, left);
}

.print-optimized .fb-lead,
.print-optimized .fb-row {
	justify-content: var(--fb-justify, flex-start);
}

.print-optimized [data-align='center'] .fb-lead {
	flex-direction: column;
	align-items: center;
}

.print-optimized [data-align='center'] .fb-lead > .flex-1 {
	flex: none;
	width: 100%;
}

.print-optimized [data-align='right'] .fb-lead,
.print-optimized [data-align='right'] .fb-row {
	flex-direction: row-reverse;
	justify-content: flex-start;
}

.print-optimized .fb-box {
	margin-left: var(--fb-box-ml, 0);
	margin-right: var(--fb-box-mr, auto);
}

.print-optimized .fb-stack {
	justify-items: var(--fb-justify, flex-start);
}

.print-optimized .font-display {
	font-family: 'Dancing Script', cursive;
}

.print-optimized .font-header {
	font-family: 'Oswald', sans-serif;
}

.print-optimized .flyer-title {
	text-shadow:
		5px 5px 15px rgba(0, 0, 0, 0.7),
		2px 2px 4px rgba(0, 0, 0, 0.5);
}

@media screen {
	.print-optimized .flyer-title {
		filter: drop-shadow(5px 5px 10px rgba(0, 0, 0, 0.7));
	}
}

/* Override AppLayout's mobile rule that hides every h1, which also kills the flyer title */
.print-optimized h1 {
	display: block !important;
}

@media print {
	#printable-area.print-optimized {
		width: 850px !important;
		max-width: none !important;
		margin: 0 !important;
		overflow: visible !important;
	}

	#printable-area .drop-shadow-2xl {
		text-shadow: 4px 4px 12px rgba(0, 0, 0, 0.6);
	}
	#printable-area .drop-shadow-xl {
		text-shadow: 3px 3px 8px rgba(0, 0, 0, 0.5);
	}
	#printable-area .drop-shadow-lg {
		text-shadow: 2px 2px 6px rgba(0, 0, 0, 0.5);
	}
	#printable-area .drop-shadow-md {
		text-shadow: 1px 1px 4px rgba(0, 0, 0, 0.4);
	}
	#printable-area .drop-shadow-sm {
		text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
	}

	#printable-area .font-display {
		text-shadow: 4px 4px 12px rgba(0, 0, 0, 0.6);
	}

	#flyer-title {
		text-shadow:
			5px 5px 15px rgba(0, 0, 0, 0.7),
			2px 2px 4px rgba(0, 0, 0, 0.5) !important;
	}

	#printable-area img.drop-shadow-2xl {
		text-shadow: none;
		filter: drop-shadow(3px 3px 6px rgba(0, 0, 0, 0.5)) !important;
	}
}
</style>
