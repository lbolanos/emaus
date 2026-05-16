import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';
import { useRekaDialogFix } from '../useRekaDialogFix';

function makeHost(options?: { poll?: boolean }) {
	return defineComponent({
		setup() {
			const { deferOpen, restoreBodyOverflow } = useRekaDialogFix(options);
			return { deferOpen, restoreBodyOverflow };
		},
		render() {
			return h('div');
		},
	});
}

/**
 * NOTE: happy-dom has a quirk where `style.foo = ''` followed by
 * `style.foo = 'value'` becomes a no-op in subsequent tests. To avoid
 * brittle tests, we don't read back individual style properties — we
 * verify behavior via spies on setStyle/removeAttribute and
 * querySelectorAll guards.
 */

describe('useRekaDialogFix', () => {
	let wrapper: VueWrapper | null = null;

	beforeEach(() => {
		document.body.innerHTML = '';
	});

	afterEach(() => {
		wrapper?.unmount();
		wrapper = null;
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe('restoreBodyOverflow', () => {
		it('does NOT clear when an open dialog is present', () => {
			const dialog = document.createElement('div');
			dialog.setAttribute('role', 'dialog');
			dialog.setAttribute('data-state', 'open');
			document.body.appendChild(dialog);

			const removeSpy = vi.spyOn(document.body, 'removeAttribute');
			wrapper = mount(makeHost({ poll: false }));
			wrapper.vm.restoreBodyOverflow();

			expect(removeSpy).not.toHaveBeenCalledWith('data-scroll-locked');
		});

		it('does NOT clear when an open menu is present', () => {
			const menu = document.createElement('div');
			menu.setAttribute('role', 'menu');
			menu.setAttribute('data-state', 'open');
			document.body.appendChild(menu);

			const removeSpy = vi.spyOn(document.body, 'removeAttribute');
			wrapper = mount(makeHost({ poll: false }));
			wrapper.vm.restoreBodyOverflow();

			expect(removeSpy).not.toHaveBeenCalledWith('data-scroll-locked');
		});

		it('removes data-scroll-locked when no overlays are open', () => {
			document.body.setAttribute('data-scroll-locked', '1');
			const removeSpy = vi.spyOn(document.body, 'removeAttribute');

			wrapper = mount(makeHost({ poll: false }));
			wrapper.vm.restoreBodyOverflow();

			expect(removeSpy).toHaveBeenCalledWith('data-scroll-locked');
		});

		it('ignores closed dialogs/menus and proceeds with cleanup', () => {
			const closedDialog = document.createElement('div');
			closedDialog.setAttribute('role', 'dialog');
			closedDialog.setAttribute('data-state', 'closed');
			document.body.appendChild(closedDialog);
			document.body.setAttribute('data-scroll-locked', '1');

			const removeSpy = vi.spyOn(document.body, 'removeAttribute');
			wrapper = mount(makeHost({ poll: false }));
			wrapper.vm.restoreBodyOverflow();

			expect(removeSpy).toHaveBeenCalledWith('data-scroll-locked');
		});
	});

	describe('deferOpen', () => {
		it('invokes the callback after 80ms, not synchronously', async () => {
			vi.useFakeTimers();
			const fn = vi.fn();
			wrapper = mount(makeHost({ poll: false }));

			wrapper.vm.deferOpen(fn);
			expect(fn).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(79);
			expect(fn).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(1);
			expect(fn).toHaveBeenCalledOnce();
		});

		it('schedules a second cleanup 50ms after the callback runs', async () => {
			vi.useFakeTimers();
			const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
			wrapper = mount(makeHost({ poll: false }));

			wrapper.vm.deferOpen(() => {});
			await vi.advanceTimersByTimeAsync(80);

			// Should have scheduled at least two: the 80ms outer and the 50ms inner cleanup.
			const delays = setTimeoutSpy.mock.calls.map((c) => c[1]);
			expect(delays).toContain(80);
			expect(delays).toContain(50);
		});
	});

	describe('polling lifecycle', () => {
		it('registers a setInterval(500) on mount when poll is default', () => {
			const intervalSpy = vi.spyOn(globalThis, 'setInterval');
			wrapper = mount(makeHost());

			const intervals = intervalSpy.mock.calls.map((c) => c[1]);
			expect(intervals).toContain(500);
		});

		it('does NOT register an interval when poll is false', () => {
			const intervalSpy = vi.spyOn(globalThis, 'setInterval');
			wrapper = mount(makeHost({ poll: false }));

			expect(intervalSpy).not.toHaveBeenCalled();
		});

		it('clears the interval and removes data-scroll-locked on unmount', () => {
			const clearSpy = vi.spyOn(globalThis, 'clearInterval');
			document.body.setAttribute('data-scroll-locked', '1');
			const removeSpy = vi.spyOn(document.body, 'removeAttribute');

			const local = mount(makeHost());
			local.unmount();

			expect(clearSpy).toHaveBeenCalled();
			expect(removeSpy).toHaveBeenCalledWith('data-scroll-locked');
		});
	});
});
