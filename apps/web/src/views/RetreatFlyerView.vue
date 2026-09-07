<template>
	<div class="bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 py-6 print:p-0 print:bg-white">
		<!-- Actions Menu -->
		<div class="absolute top-2 right-2 z-50 print:hidden">
			<div class="relative" ref="menuRef">
				<button
					@click="showMenu = !showMenu"
					class="p-2 rounded-full bg-white/80 hover:bg-white shadow-lg border border-gray-200 text-gray-600 hover:text-gray-900 transition-all"
				>
					<EllipsisVertical class="w-5 h-5" />
				</button>
				<div
					v-if="showMenu"
					class="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-xl border border-gray-200 py-1 overflow-hidden"
				>
					<router-link
						:to="{ name: 'retreat-flyer-edit', params: { id: retreatId } }"
						class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
						@click="showMenu = false"
					>
						<Pencil class="w-4 h-4" />
						{{ t('retreatFlyerEditor.title') }}
					</router-link>
					<div class="my-1 border-t border-gray-100"></div>
					<button
						@click="
							handlePrint();
							showMenu = false;
						"
						class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
					>
						<Printer class="w-4 h-4" />
						{{ t('retreatFlyer.printButton') }}
					</button>
					<button
						@click="
							handleCopyToClipboard();
							showMenu = false;
						"
						class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
					>
						<component :is="copyIcon" class="w-4 h-4" />
						{{ copyLabel }}
					</button>
					<button
						@click="
							handleDownloadPdf();
							showMenu = false;
						"
						:disabled="isDownloadingPdf"
						class="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
					>
						<Loader2 v-if="isDownloadingPdf" class="w-4 h-4 animate-spin" />
						<FileDown v-else class="w-4 h-4" />
						{{ isDownloadingPdf ? t('retreatFlyer.exportingPdf') : t('retreatFlyer.exportPdf') }}
					</button>
				</div>
			</div>
		</div>

		<!-- Flyer Container -->
		<div
			ref="flyerWrapperRef"
			class="mx-auto px-4 print:max-w-none print:w-full print:mx-0 print:px-0"
			:style="{
				maxWidth: '850px',
				height: isPrinting ? undefined : wrapperHeight,
				'--flyer-print-scale': printScale,
			}"
		>
			<RetreatFlyerCanvas
				ref="canvasRef"
				:retreat="retreatData"
				:flyer-options="flyerOptions"
				:layout="savedLayout.blocks"
				:image-overrides="savedLayout.images"
				:theme="flyerOptions?.theme"
				:block-styles="flyerOptions?.blockStyles"
				:registration-link="walkerRegistrationLink"
				:scale="effectiveScale"
			/>
		</div>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useRetreatStore } from '@/stores/retreatStore';
import { EllipsisVertical, Printer, Copy, Check, FileDown, Loader2, Pencil } from 'lucide-vue-next';
import RetreatFlyerCanvas from '@/components/flyer/RetreatFlyerCanvas.vue';
import { resolveFlyerLayout } from '@/utils/flyerLayout';

const route = useRoute();
const retreatStore = useRetreatStore();
const { t } = useI18n();
const selectedRetreat = computed(() => retreatStore.selectedRetreat);
const walkerRegistrationLink = computed(() => retreatStore.walkerRegistrationLink);

const retreatId = computed(() => route.params.id as string);

// Cast to any: `house` exists at runtime/API but not in the stricter Zod schema
const retreatData = computed(() => (selectedRetreat.value as any) || null);
const flyerOptions = computed(() => retreatData.value?.flyer_options);

/**
 * The design saved by the editor. Without this the flyer that gets printed, copied and
 * exported would quietly be the stock one: the canvas falls back to its defaults for
 * every prop it is not given, so a missing prop looks like "nothing was customised"
 * rather than like a bug. Handles v1 options too — see resolveFlyerLayout.
 */
const savedLayout = computed(() => resolveFlyerLayout(flyerOptions.value ?? null));

// Menu state
const showMenu = ref(false);
const menuRef = ref<HTMLElement>();
const flyerWrapperRef = ref<HTMLElement>();
const canvasRef = ref<{ $el: HTMLElement }>();

// Scale factor for responsive mobile display
const scaleFactor = ref(1);
const flyerActualHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;

/** Print CSS takes full control of sizing, so the mobile downscale must be off then. */
const effectiveScale = computed(() => (isPrinting.value ? 1 : scaleFactor.value));

const updateScaleFactor = () => {
	if (!flyerWrapperRef.value) return;
	scaleFactor.value = Math.min(flyerWrapperRef.value.clientWidth / 850, 1);
	const el = canvasRef.value?.$el;
	if (el) {
		flyerActualHeight.value = el.scrollHeight;
	}
};

/** A scaled element keeps its unscaled layout box, so the wrapper has to shrink too. */
const wrapperHeight = computed(() => {
	if (scaleFactor.value >= 1 || !flyerActualHeight.value) return undefined;
	return `${flyerActualHeight.value * scaleFactor.value}px`;
});

// A4 minus the 3mm @page margin, in CSS px at 96dpi (1mm = 96/25.4 px).
const A4_USABLE_WIDTH_PX = (210 - 6) * (96 / 25.4);
const A4_USABLE_HEIGHT_PX = (297 - 6) * (96 / 25.4);
const FLYER_DESIGN_WIDTH_PX = 850;

/**
 * Shrink-to-fit for print: the block layout grows and shrinks with the retreat's
 * content, so a fixed scale would spill onto a second page. A flyer is a one-page
 * document, so the limiting dimension decides the scale.
 */
const printScale = computed(() => {
	const widthScale = A4_USABLE_WIDTH_PX / FLYER_DESIGN_WIDTH_PX;
	const heightScale = flyerActualHeight.value
		? A4_USABLE_HEIGHT_PX / flyerActualHeight.value
		: widthScale;
	// Truncate (never round up) and keep 1% of slack: browsers disagree slightly on
	// the px→mm mapping when printing, and rounding up spills onto a second page.
	return (Math.floor(Math.min(widthScale, heightScale) * 0.99 * 1000) / 1000).toFixed(3);
});

const handleClickOutside = (e: MouseEvent) => {
	if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
		showMenu.value = false;
	}
};

// Print functionality — temporarily remove mobile scale so print CSS takes full control
const isPrinting = ref(false);
const onBeforePrint = () => {
	isPrinting.value = true;
};
const onAfterPrint = () => {
	isPrinting.value = false;
};
const handlePrint = () => {
	isPrinting.value = true;
	nextTick(() => {
		window.print();
		isPrinting.value = false;
	});
};

// Copy flyer as image to clipboard
const copiedRecently = ref(false);
const copyIcon = computed(() => (copiedRecently.value ? Check : Copy));
const copyLabel = computed(() =>
	copiedRecently.value ? t('retreatFlyer.copied') : t('retreatFlyer.copyImage'),
);

/** The canvas root is the printable area; prefer the ref over a global id lookup. */
const printableEl = () => canvasRef.value?.$el ?? document.getElementById('printable-area');

const handleCopyToClipboard = async () => {
	const el = printableEl();
	if (!el) return;

	try {
		// Ensure custom fonts are fully loaded before rendering
		if (document.fonts && document.fonts.ready) {
			await document.fonts.ready;
		}

		const { toBlob } = await import('html-to-image');

		// ClipboardItem with a promise preserves the user activation context, which
		// otherwise expires mid-render and fails with "Document is not focused"
		const blobPromise = toBlob(el, {
			pixelRatio: 2,
			cacheBust: true,
			fetchRequestInit: { mode: 'cors' },
		}).then((blob) => blob || new Blob([], { type: 'image/png' }));

		try {
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
			copiedRecently.value = true;
			setTimeout(() => {
				copiedRecently.value = false;
			}, 2000);
		} catch {
			// Fallback: download the image
			const blob = await blobPromise;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = 'flyer.png';
			a.click();
			URL.revokeObjectURL(url);
		}
	} catch (err) {
		console.error('Failed to copy flyer to clipboard', err);
	}
};

// Export flyer as PDF (client-side: html-to-image + jsPDF)
const isDownloadingPdf = ref(false);

const handleDownloadPdf = async () => {
	const el = printableEl();
	if (!el) return;
	isDownloadingPdf.value = true;
	try {
		if (document.fonts && document.fonts.ready) {
			await document.fonts.ready;
		}

		const { toJpeg } = await import('html-to-image');
		const { default: jsPDF } = await import('jspdf');

		// JPEG, not PNG: the flyer is a full-page photographic composition, so a lossless
		// capture lands around 15MB — too big to send by email or WhatsApp — while this is
		// under 2MB with no visible difference in print. The white background matters
		// because JPEG has no alpha channel.
		const dataUrl = await toJpeg(el, {
			pixelRatio: 2,
			quality: 0.95,
			backgroundColor: '#ffffff',
			cacheBust: true,
			fetchRequestInit: { mode: 'cors' },
		});

		const img = new Image();
		img.src = dataUrl;
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error('Failed to decode flyer image'));
		});

		const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
		const pageWidthMm = pdf.internal.pageSize.getWidth();
		const pageHeightMm = pdf.internal.pageSize.getHeight();

		// A flyer is a one-page document: fit it inside the page by whichever
		// dimension binds, and centre it. Slicing it across pages would cut a card
		// in half, and the block layout's height varies with the retreat's content.
		const fit = Math.min(pageWidthMm / img.width, pageHeightMm / img.height);
		const targetWidthMm = img.width * fit;
		const targetHeightMm = img.height * fit;
		const offsetXMm = (pageWidthMm - targetWidthMm) / 2;
		const offsetYMm = (pageHeightMm - targetHeightMm) / 2;

		pdf.addImage(dataUrl, 'JPEG', offsetXMm, offsetYMm, targetWidthMm, targetHeightMm);

		const parishSlug = (retreatData.value?.parish || 'retiro').toString();
		const numberSlug = retreatData.value?.retreat_number_version
			? `-${retreatData.value.retreat_number_version}`
			: '';
		const filename = `flyer-${parishSlug}${numberSlug}.pdf`
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9.-]/g, '');
		pdf.save(filename);
	} catch (err) {
		console.error('Failed to export flyer as PDF', err);
	} finally {
		isDownloadingPdf.value = false;
	}
};

onMounted(async () => {
	if (retreatId.value) {
		// Always fetch fresh retreat data (includes house with address2, etc.)
		await retreatStore.fetchRetreat(retreatId.value);
	}
	await nextTick();
	document.addEventListener('click', handleClickOutside);
	window.addEventListener('beforeprint', onBeforePrint);
	window.addEventListener('afterprint', onAfterPrint);

	if (flyerWrapperRef.value) {
		updateScaleFactor();
		resizeObserver = new ResizeObserver(() => {
			updateScaleFactor();
		});
		resizeObserver.observe(flyerWrapperRef.value);
		const el = canvasRef.value?.$el;
		if (el) {
			resizeObserver.observe(el);
		}
	}
});

onUnmounted(() => {
	document.removeEventListener('click', handleClickOutside);
	window.removeEventListener('beforeprint', onBeforePrint);
	window.removeEventListener('afterprint', onAfterPrint);
	if (resizeObserver) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
});

// Reload retreat data when the :id param changes (sidebar retreat switch)
watch(
	() => route.params.id,
	async (newId, oldId) => {
		if (newId && newId !== oldId) {
			await retreatStore.fetchRetreat(newId as string);
			await nextTick();
			updateScaleFactor();
		}
	},
);
</script>

<style>
/* Global print styles: the flyer must escape every ancestor's overflow/scroll container */
@media print {
	@page {
		size: A4;
		margin: 3mm;
	}

	body {
		margin: 0 !important;
		padding: 0 !important;
		background: white !important;
	}

	/* Hide everything except the flyer */
	body * {
		visibility: hidden;
	}

	#printable-area,
	#printable-area * {
		visibility: visible;
		-webkit-print-color-adjust: exact !important;
		print-color-adjust: exact !important;
		color-adjust: exact !important;
	}

	/* position:fixed breaks out of ALL ancestor overflow/scroll containers */
	#printable-area {
		position: fixed;
		left: 0;
		top: 0;
		max-width: none;
		margin: 0;
		padding: 0;
		overflow: visible;
		z-index: 99999;
		/* Shrink-to-fit one A4 page; the view computes the factor from the actual height */
		transform: scale(var(--flyer-print-scale, 0.907)) !important;
		transform-origin: top left !important;
		width: 850px !important;
	}

	/* Force colored backgrounds in print via box-shadow (browsers always print box-shadows
     even when they strip background-color and background-image) */
	#printable-area header {
		box-shadow: inset 0 0 0 9999px #1e3a8a !important; /* blue-900 */
	}
	#printable-area [data-banner] {
		box-shadow: inset 0 0 0 9999px #1e3a8a !important; /* blue-900 */
	}
	#printable-area footer {
		box-shadow: inset 0 0 0 9999px #111827 !important; /* gray-900 */
	}

	/* Hide sidebar, nav, and other app chrome */
	nav,
	aside,
	.sidebar,
	[class*='Sidebar'],
	.ai-chat-widget,
	[class*='AiChat'] {
		display: none !important;
	}
}
</style>
