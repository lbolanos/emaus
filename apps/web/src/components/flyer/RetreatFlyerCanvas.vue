<template>
	<div
		id="printable-area"
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
				:editable="editable"
				:selected-block-id="selectedBlockId"
				:empty-label="emptySlotLabel"
				@drop-at="onDropAt"
				@select-block="(id) => emit('selectBlock', id)"
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
		/** Turns the flyer into a drop target. Off for the read-only view. */
		editable?: boolean;
		selectedBlockId?: FlyerBlockId | null;
		emptySlotLabel?: string;
	}>(),
	{ scale: 1, editable: false, emptySlotLabel: '' },
);

const emit = defineEmits<{
	moveBlock: [blockId: FlyerBlockId, slot: FlyerSlot, index: number];
	selectBlock: [blockId: FlyerBlockId];
}>();

/** Which block the pointer is carrying; the columns only report where it landed. */
const draggingId = ref<FlyerBlockId | null>(null);

function onDropAt(slot: FlyerSlot, index: number) {
	if (!draggingId.value) return;
	emit('moveBlock', draggingId.value, slot, index);
	draggingId.value = null;
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
   Everything is anchored to #printable-area so nothing leaks into the rest of the app. */
@import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&family=Miltonian+Tattoo&family=Oswald:wght@300;400;500;700;900&family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400&display=swap');

#printable-area.print-optimized {
	width: 100%;
	max-width: 850px;
	margin: 0 auto;
}

/* Force browsers to print backgrounds and colors */
#printable-area .print-exact,
#printable-area.print-optimized {
	-webkit-print-color-adjust: exact !important;
	print-color-adjust: exact !important;
	color-adjust: exact !important;
}

#printable-area .font-display {
	font-family: 'Dancing Script', cursive;
}

#printable-area .font-header {
	font-family: 'Oswald', sans-serif;
}

#printable-area .flyer-title {
	text-shadow:
		5px 5px 15px rgba(0, 0, 0, 0.7),
		2px 2px 4px rgba(0, 0, 0, 0.5);
}

@media screen {
	#printable-area .flyer-title {
		filter: drop-shadow(5px 5px 10px rgba(0, 0, 0, 0.7));
	}
}

#printable-area .group:hover {
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

#printable-area .animate-pulse {
	animation: flyerPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Override AppLayout's mobile rule that hides every h1, which also kills the flyer title */
#printable-area h1 {
	display: block !important;
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
