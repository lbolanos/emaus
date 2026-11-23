import { nextTick, onBeforeUnmount, onMounted, watch, type Ref, type WatchSource } from 'vue';

/**
 * A veiled line is a box that hugs its words (see the `[data-veils]` rules in
 * the canvases). CSS gets that right for a single line, but a paragraph that
 * wraps is as wide as its column whatever the length of its lines — CSS has
 * no "shrink to the longest wrapped line" — so its veil stayed a full-width
 * bar and "aligned right" only moved the words inside it.
 *
 * This measures each veiled block-level line and sets its width to the
 * longest line it actually renders, so the box hugs the text and its role's
 * auto margins can place it. Widths are in layout px (the canvas may be
 * scaled by a transform), so print and the PNG capture keep them.
 */

const VEILED_LINES = (['title', 'emphasis', 'body'] as const)
	.map((slot) => `[data-veils~="${slot}"] .fb-${slot}`)
	.join(', ');

/** Elements this module sized, so a re-run can give them their natural width back. */
const MARK = 'shrinkWrapped';

/** Widest rendered line of an element's text, in viewport px (0 when unknown). */
function longestLineWidth(el: HTMLElement): number {
	const range = document.createRange();
	// Test DOMs (happy-dom) have no layout: nothing to measure, nothing to size
	if (typeof range.getClientRects !== 'function') return 0;
	range.selectNodeContents(el);
	const rects = [...range.getClientRects()]
		.filter((r) => r.width > 0 && r.height > 0)
		.sort((a, b) => a.top - b.top);
	if (!rects.length) return 0;

	// Fragments of the same line share (roughly) a top; a new line starts
	// once a fragment begins below the middle of the current one
	let longest = 0;
	let line = { top: rects[0].top, height: rects[0].height, left: rects[0].left, right: rects[0].right };
	for (const rect of rects.slice(1)) {
		if (rect.top < line.top + line.height / 2) {
			line.left = Math.min(line.left, rect.left);
			line.right = Math.max(line.right, rect.right);
		} else {
			longest = Math.max(longest, line.right - line.left);
			line = { top: rect.top, height: rect.height, left: rect.left, right: rect.right };
		}
	}
	return Math.max(longest, line.right - line.left);
}

/** Sizes every veiled block-level line inside `root` to its longest line. */
export function shrinkWrapVeiledLines(root: HTMLElement) {
	const lines = [...root.querySelectorAll<HTMLElement>(VEILED_LINES)];

	// Natural width first, all at once: measuring one after resizing another
	// would read a layout that is about to change
	for (const el of lines) {
		if (el.dataset[MARK]) {
			el.style.width = '';
			delete el.dataset[MARK];
		}
	}

	for (const el of lines) {
		const style = getComputedStyle(el);
		// Inline spans hug their words already; flex rows are not text boxes
		if (style.display !== 'block' || !el.offsetWidth) continue;

		const viewportLongest = longestLineWidth(el);
		if (!viewportLongest) continue;
		// getClientRects is in viewport px; offsetWidth is layout px
		const scale = el.getBoundingClientRect().width / el.offsetWidth || 1;
		const chrome =
			parseFloat(style.paddingLeft) +
			parseFloat(style.paddingRight) +
			parseFloat(style.borderLeftWidth) +
			parseFloat(style.borderRightWidth);
		// +1: sub-pixel rounding must not push the last word onto a new line
		const target = Math.ceil(viewportLongest / scale + chrome) + 1;
		if (target < el.offsetWidth - 1) {
			el.style.width = `${target}px`;
			el.dataset[MARK] = '1';
		}
	}
}

/**
 * Keeps a canvas's veiled lines shrink-wrapped: after mount, after every
 * change of the given sources (styles, texts, layout, scale), when the
 * canvas is resized, and once the web fonts are in (they change line widths).
 */
export function useShrinkWrapVeils(root: Ref<HTMLElement | undefined>, sources: WatchSource[]) {
	let frame = 0;
	const schedule = () => {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(() => {
			if (root.value) shrinkWrapVeiledLines(root.value);
		});
	};

	let observer: ResizeObserver | null = null;
	onMounted(() => {
		nextTick(schedule);
		// `ready` is often settled before the flyer's fonts even start loading
		// (a face loads when first used): measured with the fallback face, the
		// lines came out wrong and nothing re-ran. loadingdone fires per batch.
		document.fonts?.ready.then(schedule).catch(() => {});
		document.fonts?.addEventListener?.('loadingdone', schedule);
		if (typeof ResizeObserver !== 'undefined' && root.value) {
			// Width only: the height changes when this very module resizes lines
			let lastWidth = root.value.offsetWidth;
			observer = new ResizeObserver(() => {
				const width = root.value?.offsetWidth ?? 0;
				if (width !== lastWidth) {
					lastWidth = width;
					schedule();
				}
			});
			observer.observe(root.value);
		}
	});
	watch(sources, schedule, { deep: true, flush: 'post' });
	onBeforeUnmount(() => {
		document.fonts?.removeEventListener?.('loadingdone', schedule);
		cancelAnimationFrame(frame);
		observer?.disconnect();
	});
}
