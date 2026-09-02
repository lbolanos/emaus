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
			<div
				class="absolute inset-0 bg-gradient-to-br from-white/20 via-white/5 to-black/10 pointer-events-none"
			></div>

			<div class="relative z-10 grid grid-cols-2 gap-x-3 items-start">
				<div class="flex flex-col gap-3">
					<component
						v-for="block in blocksInSlot.left"
						:key="block.id"
						:is="FLYER_BLOCK_COMPONENTS[block.id]"
						:content="content"
						:data-flyer-block="block.id"
					/>
				</div>
				<div class="flex flex-col gap-3">
					<component
						v-for="block in blocksInSlot.right"
						:key="block.id"
						:is="FLYER_BLOCK_COMPONENTS[block.id]"
						:content="content"
						:data-flyer-block="block.id"
					/>
				</div>
			</div>

			<div v-if="blocksInSlot.wide.length" class="relative z-10 mt-3 flex flex-col gap-3">
				<component
					v-for="block in blocksInSlot.wide"
					:key="block.id"
					:is="FLYER_BLOCK_COMPONENTS[block.id]"
					:content="content"
					:data-flyer-block="block.id"
				/>
			</div>
		</div>

		<FlyerFooter :content="content" :background-image="images.footerBackground" />
	</div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { FlyerBlockLayout, FlyerImages, FlyerSlot } from '@repo/types';
import { useFlyerContent } from '@/composables/useFlyerContent';
import FlyerHeader from './FlyerHeader.vue';
import FlyerBanner from './FlyerBanner.vue';
import FlyerFooter from './FlyerFooter.vue';
import { FLYER_BLOCK_COMPONENTS, FLYER_DEFAULT_LAYOUT, FLYER_PRESET_IMAGES } from './blockRegistry';

const props = withDefaults(
	defineProps<{
		retreat: any;
		flyerOptions?: any;
		/** Block arrangement; falls back to the default layout. */
		layout?: FlyerBlockLayout[];
		/** Image overrides; each missing key falls back to its preset. */
		imageOverrides?: FlyerImages;
		registrationLink?: string;
		/** Mobile downscale of the fixed 850px design. */
		scale?: number;
	}>(),
	{ scale: 1 },
);

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
