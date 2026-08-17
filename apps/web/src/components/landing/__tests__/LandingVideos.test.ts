import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, VueWrapper, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import LandingVideos from '../LandingVideos.vue';

vi.mock('lucide-vue-next', () => ({
	ChevronRight: { template: '<div data-icon="ChevronRight" />' },
	Play: { template: '<div data-icon="Play" />' },
	X: { template: '<div data-icon="X" />' },
}));

const mountComponent = () =>
	mount(LandingVideos, {
		global: {
			mocks: { $t: (key: string) => key },
			stubs: { Teleport: true },
		},
	});

describe('LandingVideos', () => {
	let wrapper: VueWrapper<any>;

	beforeEach(() => {
		wrapper = mountComponent();
	});

	afterEach(() => {
		wrapper?.unmount();
		document.body.removeAttribute('style');
	});

	// happy-dom quirk: once `body.style.overflow` has been set back to '' anywhere
	// in the file, the `style.overflow` getter keeps returning '' even though the
	// style attribute is updated. Reading the attribute is reliable in both states.
	const bodyStyle = () => document.body.getAttribute('style') ?? '';

	it('is the anchor target the nav links to', () => {
		expect(wrapper.find('section#inscripcion').exists()).toBe(true);
	});

	it('shows only the walker-facing registration video', () => {
		const cards = wrapper.findAll('button[type="button"]');
		expect(cards).toHaveLength(1);
		expect(cards[0].text()).toContain('landing.videos.items.registration');

		const thumbnail = wrapper.find('img');
		// Thumbnails are served from public/, never hotlinked from i.ytimg.com
		expect(thumbnail.attributes('src')).toBe('/videos/jQb3q-mUG-8.webp');
		expect(thumbnail.attributes('loading')).toBe('lazy');
		expect(wrapper.text()).toContain('0:59');
	});

	it('does not send walkers to the channel, which is team material', () => {
		const links = wrapper.findAll('a').map((a) => a.attributes('href'));
		expect(links.some((href) => href?.includes('youtube.com'))).toBe(false);
		// The only call to action points at the retreat list
		expect(links).toContain('#retreats');
	});

	it('does not mount any iframe until the video is opened', async () => {
		expect(wrapper.find('iframe').exists()).toBe(false);

		await wrapper.find('button[type="button"]').trigger('click');
		await nextTick();

		const iframe = wrapper.find('iframe');
		expect(iframe.exists()).toBe(true);
		expect(iframe.attributes('src')).toBe(
			'https://www.youtube-nocookie.com/embed/jQb3q-mUG-8?autoplay=1&rel=0&modestbranding=1',
		);
	});

	it('closes the player with Escape and releases the body scroll lock', async () => {
		await wrapper.find('button[type="button"]').trigger('click');
		await flushPromises();
		expect(bodyStyle()).toContain('overflow: hidden');

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await flushPromises();

		expect(wrapper.find('iframe').exists()).toBe(false);
		expect(bodyStyle()).not.toContain('overflow: hidden');
	});
});
