import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, DOMWrapper, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import SidebarMenuItem from '../layout/SidebarMenuItem.vue';

/**
 * The favorite toggle lives in a menu that unfolds after dwelling on the row
 * (hover 1s / touch long-press 500ms) — the component is presentational: the
 * menu only emits toggle-favorite. The menu is portaled to body, so the
 * assertions read it from the document (real Teleport, not stubbed).
 *
 * $t is the createTestWrapper mock that returns the key, so button labels
 * assert as i18n keys.
 */

const item = {
	name: 'walkers',
	routeName: 'walkers',
	icon: { name: 'DummyIcon', template: '<i class="dummy-icon" />' },
	label: 'sidebar.walkers',
};

let wrapper: VueWrapper<any> | null = null;

// createTestWrapper silently drops options.props (it never forwards them to
// mount), so mount directly with the globals this component needs.
function mountItem(props: Record<string, any> = {}) {
	wrapper = mount(SidebarMenuItem, {
		props: {
			item,
			isCollapsedView: false,
			isFocused: false,
			globalIndex: 3,
			routeWithParams: { name: 'walkers', params: { id: 'retreat-1' } },
			isFavorite: false,
			...props,
		},
		global: {
			// Real Teleport: the menu must land in document.body.
			stubs: { teleport: false, 'router-link': true },
			mocks: { $t: (key: string) => key },
		},
	});
	return wrapper;
}

const row = () => wrapper!.find('div.flex');
const menu = () => document.querySelector('[data-testid="favorite-item-menu"]');
const menuButton = () =>
	new DOMWrapper(menu()!.querySelector('[data-testid="favorite-item-toggle"]')!);

async function openByDwell() {
	await row().trigger('mouseenter');
	await vi.advanceTimersByTimeAsync(1000);
}

afterEach(() => {
	vi.useRealTimers();
	wrapper?.unmount();
	wrapper = null;
	document.body.innerHTML = '';
});

describe('SidebarMenuItem — favorite hover menu', () => {
	it('opens after dwelling a second on the row and toggles from the menu', async () => {
		vi.useFakeTimers();
		mountItem();

		await row().trigger('mouseenter');
		await vi.advanceTimersByTimeAsync(600);
		expect(menu()).toBeNull(); // not before the full second of dwell

		await vi.advanceTimersByTimeAsync(400);
		expect(menu()).not.toBeNull();

		await menuButton().trigger('click');
		expect(wrapper!.emitted('toggleFavorite')).toHaveLength(1);
		expect(menu()).toBeNull(); // the action closes the menu
	});

	it('does not open when the pointer leaves before the second', async () => {
		vi.useFakeTimers();
		mountItem();

		await row().trigger('mouseenter');
		await vi.advanceTimersByTimeAsync(500);
		await row().trigger('mouseleave');
		await vi.advanceTimersByTimeAsync(1000);

		expect(menu()).toBeNull();
	});

	it('offers the remove action for a pinned item', async () => {
		vi.useFakeTimers();
		mountItem({ isFavorite: true });

		await openByDwell();
		expect(menu()!.textContent).toContain('sidebar.removeFavorite');

		await menuButton().trigger('click');
		expect(wrapper!.emitted('toggleFavorite')).toHaveLength(1);
	});

	it('stays open while crossing into the menu, closes after leaving it', async () => {
		vi.useFakeTimers();
		mountItem();
		await openByDwell();

		// Leaving the row starts the grace timer…
		await row().trigger('mouseleave');
		await vi.advanceTimersByTimeAsync(200);
		expect(menu()).not.toBeNull(); // …but the menu is reachable in time.

		// Dwelling on the menu itself cancels the close.
		menu()!.dispatchEvent(new MouseEvent('mouseenter'));
		await vi.advanceTimersByTimeAsync(5000);
		expect(menu()).not.toBeNull();

		// Leaving the menu closes it after the grace.
		menu()!.dispatchEvent(new MouseEvent('mouseleave'));
		await vi.advanceTimersByTimeAsync(300);
		expect(menu()).toBeNull();
	});

	it('opens on touch long-press and stays open for the tap', async () => {
		vi.useFakeTimers();
		mountItem();

		await row().trigger('touchstart', { touches: [{ clientX: 10, clientY: 10 }] });
		await vi.advanceTimersByTimeAsync(500);
		expect(menu()).not.toBeNull();

		// The releasing finger must not navigate nor close the menu.
		await row().trigger('touchend');
		expect(menu()).not.toBeNull();
	});

	it('closes on Escape', async () => {
		vi.useFakeTimers();
		mountItem();
		await openByDwell();
		expect(menu()).not.toBeNull();

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await nextTick();
		expect(menu()).toBeNull();
	});

	it('closes when clicking anywhere else', async () => {
		vi.useFakeTimers();
		mountItem();
		await openByDwell();

		document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await nextTick();
		expect(menu()).toBeNull();
	});

	it('never opens in rail mode (the tooltip owns hover there)', async () => {
		vi.useFakeTimers();
		mountItem({ isCollapsedView: true });

		await row().trigger('mouseenter');
		await vi.advanceTimersByTimeAsync(1500);
		expect(menu()).toBeNull();
	});
});
