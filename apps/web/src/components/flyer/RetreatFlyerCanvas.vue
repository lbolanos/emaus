<template>
	<div
		:id="printable ? 'printable-area' : undefined"
		@dblclick="onDoubleClick"
		class="print-optimized shadow-2xl print:shadow-none rounded-3xl overflow-hidden print:overflow-visible print:rounded-none relative bg-white border border-gray-200 print:border-none"
		:style="[
			{ fontFamily: `'Roboto', sans-serif`, width: '100%', maxWidth: '850px', margin: '0 auto' },
			scale < 1 ? { transform: `scale(${scale})`, transformOrigin: 'top left', width: '850px' } : {},
		]"
	>
		<FlyerHeader
			:content="content"
			:background-image="images.headerBackground"
			:logo="images.logo"
		/>

		<FlyerBanner :content="content" />

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
					:editable="editable"
					:selected-block-id="selectedBlockId"
					:highlight-slot="highlightSlot"
					:empty-label="emptySlotLabel"
					@drop-at="onDropAt"
					@select-block="(id) => emit('selectBlock', id)"
					@resize-block="(id, width) => emit('resizeBlock', id, width)"
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
				:editable="editable"
				:selected-block-id="selectedBlockId"
				:highlight-slot="highlightSlot"
				:empty-label="emptySlotLabel"
				@drop-at="onDropAt"
				@select-block="(id) => emit('selectBlock', id)"
				@resize-block="(id, width) => emit('resizeBlock', id, width)"
				@drag-block-start="draggingId = $event"
				@drag-block-end="draggingId = null"
			/>
		</div>

		<FlyerFooter :content="content" :background-image="images.footerBackground" />
	</div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type {
	FlyerBlockId,
	FlyerBlockLayout,
	FlyerBlockStyle,
	FlyerImages,
	FlyerSlot,
	FlyerTheme,
} from '@repo/types';
import { useFlyerContent } from '@/composables/useFlyerContent';
import { resolveScrim } from '@/utils/flyerStyle';
import FlyerHeader from './FlyerHeader.vue';
import FlyerBanner from './FlyerBanner.vue';
import FlyerFooter from './FlyerFooter.vue';
import FlyerSlotColumn from './FlyerSlotColumn.vue';
import { FLYER_DEFAULT_LAYOUT, FLYER_PRESET_IMAGES } from './blockRegistry';

const props = withDefaults(
	defineProps<{
		retreat: any;
		flyerOptions?: any;
		/** Block arrangement; falls back to the default layout. */
		layout?: FlyerBlockLayout[];
		/** Image overrides; each missing key falls back to its preset. */
		imageOverrides?: FlyerImages;
		/** Palette for every block, plus the wash over the background image. */
		theme?: FlyerTheme | null;
		/** Per-block overrides on top of the theme. */
		blockStyles?: Partial<Record<FlyerBlockId, FlyerBlockStyle>> | null;
		registrationLink?: string;
		/** Mobile downscale of the fixed 850px design. */
		scale?: number;
		/**
		 * Whether this is *the* flyer of the page. Print, copy and PDF all target
		 * #printable-area, so a second canvas on screen — a template preview, say —
		 * must not claim the same id.
		 */
		printable?: boolean;
		/** Turns the flyer into a drop target. Off for the read-only view. */
		editable?: boolean;
		selectedBlockId?: string | null;
		/** Slot whose panel row the pointer is on: its lines glow on canvas. The
		 *  blockId scopes the glow to one block; null means every block (the
		 *  whole-flyer panel). */
		highlightSlot?: { slot: string; blockId: string | null } | null;
		emptySlotLabel?: string;
	}>(),
	{ scale: 1, editable: false, emptySlotLabel: '', printable: true },
);

const emit = defineEmits<{
	moveBlock: [blockId: string, slot: FlyerSlot, index: number];
	selectBlock: [blockId: string];
	/** Double-clicked a text the Texts tab owns: jump to its field. */
	editText: [overrideKey: string];
	/** Edge-drag resize on a block. */
	resizeBlock: [blockId: string, width: number];
}>();

/** Which block the pointer is carrying; the columns only report where it landed. */
const draggingId = ref<string | null>(null);

function onDropAt(slot: FlyerSlot, index: number) {
	if (!draggingId.value) return;
	emit('moveBlock', draggingId.value, slot, index);
	draggingId.value = null;
}

/**
 * Double-clicking a piece of copy on the flyer is the shortest path to editing
 * it: report which override key it belongs to and the view focuses that field.
 */
function onDoubleClick(event: MouseEvent) {
	if (!props.editable) return;
	const target = (event.target as HTMLElement).closest('[data-text-override]');
	const key = target?.getAttribute('data-text-override');
	if (key) emit('editText', key);
}

const scrimColor = computed(() => resolveScrim(props.theme));

const content = useFlyerContent(
	() => props.retreat,
	() => props.flyerOptions,
	() => props.registrationLink,
);

const images = computed(() => ({
	bodyBackground: props.imageOverrides?.bodyBackground || FLYER_PRESET_IMAGES.bodyBackground,
	headerBackground: props.imageOverrides?.headerBackground || FLYER_PRESET_IMAGES.headerBackground,
	footerBackground: props.imageOverrides?.footerBackground || FLYER_PRESET_IMAGES.footerBackground,
	logo: props.imageOverrides?.logo || content.retreatTypeLogo,
}));

/**
 * Without an explicit layout we use the default one, but a v1 retreat may have
 * turned the registration QR off through the legacy toggles, so honour those.
 */
const defaultLayout = computed<FlyerBlockLayout[]>(() => {
	const legacyShowQr = props.flyerOptions?.showQrCodes ?? true;
	const showRegistrationQr = props.flyerOptions?.showQrCodesRegistration ?? legacyShowQr;
	return FLYER_DEFAULT_LAYOUT.map((block) =>
		block.id === 'registrationQr' ? { ...block, visible: showRegistrationQr } : block,
	);
});

const blocksInSlot = computed(() => {
	const layout = props.layout ?? defaultLayout.value;
	const bySlot: Record<FlyerSlot, FlyerBlockLayout[]> = { left: [], right: [], wide: [] };

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
   Anchored to .print-optimized, the canvas root, so nothing leaks into the rest of the
   app — and so a template preview, which cannot claim the printable-area id, still
   gets the fonts and shadows. */
@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Miltonian+Tattoo&family=Oswald:wght@300;400;500;700;900&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&display=swap');

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
 * Alignment inside a block.
 *
 * `text-align` alone gets the text but not the furniture: the icon chips, the list
 * bullets and the capped boxes are laid out with flex and auto margins, and they would
 * stay put on the left while the words moved. So each block marks its rows:
 *
 *   .fb-lead  the block's main row — its icon and the text beside it. Centred, it
 *             stacks so the icon sits above; right-aligned, it flips so the icon
 *             ends up on the outer edge, which is where the original put contact's.
 *   .fb-row   a secondary row (a list item, the QR plate). Follows the alignment
 *             without stacking; flips its icon on the right.
 *   .fb-box   a width-capped box, which lines up by auto margin instead.
 */
.print-optimized [data-flyer-block] {
	text-align: var(--fb-align, left);
	/* The "sombra en el texto" switch: one flag the whole block's text inherits.
	   It used to write a variable nothing consumed — a switch with no wire. */
	text-shadow: var(--fb-shadow, none);
}

/* The slot's own veil: behind this role's lines only (highlight the date,
   the price), separate from the block-wide background. */
.print-optimized .fb-title {
	background-color: var(--fb-title-bg, transparent);
	border-radius: var(--fb-title-radius, 0);
	padding: var(--fb-title-pad, 0);
}

.print-optimized .fb-emphasis {
	background-color: var(--fb-emphasis-bg, transparent);
	border-radius: var(--fb-emphasis-radius, 0);
	padding: var(--fb-emphasis-pad, 0);
}

.print-optimized .fb-body {
	background-color: var(--fb-body-bg, transparent);
	border-radius: var(--fb-body-radius, 0);
	padding: var(--fb-body-pad, 0);
}

/* Per-slot lettering: family, colour, alignment and shadow ride the slot class;
   the size travels with each element (its calc class). */
.print-optimized .fb-title {
	font-family: var(--fb-title-font, inherit);
	color: var(--fb-title-color, var(--fb-heading));
	text-align: var(--fb-title-align, var(--fb-align, left));
	text-shadow: var(--fb-title-shadow, var(--fb-shadow, none));
}

.print-optimized .fb-emphasis {
	font-family: var(--fb-emphasis-font, inherit);
	color: var(--fb-emphasis-color, var(--fb-heading));
	text-align: var(--fb-emphasis-align, var(--fb-align, left));
	text-shadow: var(--fb-emphasis-shadow, var(--fb-shadow, none));
}

.print-optimized .fb-body {
	font-family: var(--fb-body-font, inherit);
	color: var(--fb-body-color, var(--fb-text));
	text-align: var(--fb-body-align, var(--fb-align, left));
	text-shadow: var(--fb-body-shadow, var(--fb-shadow, none));
}

/* Width-capped emphasis boxes (the domain plate, the intro badge, the price
   pill) are not running text: text-align cannot move them, so they line up by
   auto margins driven by the emphasis slot's alignment — the same trick the
   block-level fb-box uses. */
.print-optimized [data-registration-domain],
.print-optimized [data-emphasis-box] {
	margin-left: var(--fb-emph-ml, 0);
	margin-right: var(--fb-emph-mr, auto);
}

.print-optimized .fb-lead,
.print-optimized .fb-row {
	justify-content: var(--fb-justify, flex-start);
}

/* The furniture follows its slot: the lead row (icon + title) the title slot,
   list rows and notes the body slot. Falls back to the block-wide alignment.
   The [data-flyer-block] anchor buys specificity over the block-wide rules
   above — without it, a block whose flat alignment is 'center' (intro, QR,
   payment) ignored its slot alignment: the flat rule came later and won. */
.print-optimized .fb-lead {
	justify-content: var(--fb-title-justify, var(--fb-justify, flex-start));
}

.print-optimized .fb-row {
	justify-content: var(--fb-body-justify, var(--fb-justify, flex-start));
}

.print-optimized [data-flyer-block][data-title-align='center'] .fb-lead,
.print-optimized [data-flyer-block][data-body-align='center'] .fb-row {
	flex-direction: column;
	align-items: center;
}

/* Stacked, the child that used to take the leftover width would grow in height
   instead — same fix the block-wide centring already applies. */
.print-optimized [data-flyer-block][data-title-align='center'] .fb-lead > .flex-1 {
	flex: none;
	width: 100%;
}

.print-optimized [data-flyer-block][data-title-align='left'] .fb-lead {
	flex-direction: row;
	justify-content: flex-start;
}

.print-optimized [data-flyer-block][data-body-align='left'] .fb-row {
	flex-direction: row;
	justify-content: flex-start;
}

.print-optimized [data-flyer-block][data-title-align='right'] .fb-lead,
.print-optimized [data-flyer-block][data-body-align='right'] .fb-row {
	flex-direction: row-reverse;
	justify-content: flex-start;
}

.print-optimized [data-align='center'] .fb-lead {
	flex-direction: column;
	align-items: center;
}

/* Stacked, the child that used to take the leftover width would grow in height
   instead. Only that one: the icon chip has to keep its own size. */
.print-optimized [data-align='center'] .fb-lead > .flex-1 {
	flex: none;
	width: 100%;
}

/* Flipping the row flips the main axis with it, so flex-end becomes the LEFT edge.
   Right-aligned rows therefore justify to flex-start. */
.print-optimized [data-align='right'] .fb-lead,
.print-optimized [data-align='right'] .fb-row {
	flex-direction: row-reverse;
	justify-content: flex-start;
}

.print-optimized .fb-box {
	margin-left: var(--fb-box-ml, 0);
	margin-right: var(--fb-box-mr, auto);
}

/* A grid whose cells hug their contents instead of stretching to the column width,
   and line up on the side the block is aligned to. */
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

.print-optimized .group:hover {
	transform: translateY(-2px);
}

@keyframes flyerPulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.8;
	}
}

.print-optimized .animate-pulse {
	animation: flyerPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Override AppLayout's mobile rule that hides every h1, which also kills the flyer title */
.print-optimized h1 {
	display: block !important;
}


/* Pointer over a slot section in the panel: glow exactly the lines that slot
   drives, so "Destacado" stops being a guess. */
@keyframes fbSlotGlow {
	0%,
	100% {
		outline-color: rgba(59, 130, 246, 0.9);
	}
	50% {
		outline-color: rgba(59, 130, 246, 0.35);
	}
}

.print-optimized [data-highlight-slot='title'] .fb-title,
.print-optimized [data-highlight-slot='emphasis'] .fb-emphasis,
.print-optimized [data-highlight-slot='body'] .fb-body {
	outline: 2px dashed rgba(59, 130, 246, 0.9);
	outline-offset: 3px;
	border-radius: 4px;
	animation: fbSlotGlow 1.2s ease-in-out infinite;
}

@media print {
	#printable-area.print-optimized {
		width: 850px !important;
		max-width: none !important;
		margin: 0 !important;
		overflow: visible !important;
	}

	/* Chrome's print pipeline drops CSS filter: drop-shadow(), so restate them as text-shadow */
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

	#printable-area .font-header.drop-shadow-xl {
		text-shadow: 3px 3px 10px rgba(0, 0, 0, 0.6);
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
