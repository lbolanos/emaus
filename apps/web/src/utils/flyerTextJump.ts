import { nextTick } from 'vue';

/**
 * Double-clicked copy on a flyer: once the Texts tab is open, scroll its field
 * into view, focus it and flash it once. Shared by the retreat and the meeting
 * editors.
 *
 * The field mounts when the Tabs content does — later than nextTick — and
 * something along the way (remount, the Tabs transition) hands focus back to
 * <body>, so this retries on animation frames, bounded, until the field
 * exists AND holds focus.
 *
 * The flash is a Web Animation, not a CSS class: the field lives inside
 * FlyerTextPanel, where a class styled in the calling view's SCOPED <style>
 * never matched — the flash was invisible.
 */
export function focusFlyerTextField(overrideKey: string, attempts = 24) {
	const settle = (left: number) => {
		const field = document.getElementById(`flyer-text-${overrideKey}`);
		if (!field) {
			if (left > 0) requestAnimationFrame(() => settle(left - 1));
			return;
		}
		field.scrollIntoView({ block: 'center', behavior: 'smooth' });
		field.focus();
		if (document.activeElement === field || left <= 0) {
			field.animate?.(
				[
					{ boxShadow: '0 0 0 0 rgba(59, 130, 246, 0)' },
					{ boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.45)', offset: 0.3 },
					{ boxShadow: '0 0 0 0 rgba(59, 130, 246, 0)' },
				],
				{ duration: 1600, easing: 'ease-out' },
			);
			return;
		}
		requestAnimationFrame(() => settle(left - 1));
	};
	nextTick(() => settle(attempts));
}
