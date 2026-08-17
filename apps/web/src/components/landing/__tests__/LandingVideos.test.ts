import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, VueWrapper, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import LandingVideos from '../LandingVideos.vue';

vi.mock('lucide-vue-next', () => ({
	ChevronRight: { template: '<div data-icon="ChevronRight" />' },
	ExternalLink: { template: '<div data-icon="ExternalLink" />' },
	Play: { template: '<div data-icon="Play" />' },
	X: { template: '<div data-icon="X" />' },
	Youtube: { template: '<div data-icon="Youtube" />' },
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

	it('renders one card per featured video with a local thumbnail', () => {
		const cards = wrapper.findAll('button[type="button"]');
		expect(cards).toHaveLength(6);

		const thumbnails = wrapper.findAll('img');
		expect(thumbnails).toHaveLength(6);
		thumbnails.forEach((img) => {
			// Thumbnails are served from public/, never hotlinked from i.ytimg.com
			expect(img.attributes('src')).toMatch(/^\/videos\/[\w-]+\.webp$/);
			expect(img.attributes('loading')).toBe('lazy');
		});
	});

	it('shows the real duration of each video', () => {
		const text = wrapper.text();
		// 254s tour, 59s registration, 241s communities
		expect(text).toContain('4:14');
		expect(text).toContain('0:59');
		expect(text).toContain('4:01');
	});

	it('links to the channel', () => {
		const channelLink = wrapper.find('a[href="https://www.youtube.com/@emaus-retiros"]');
		expect(channelLink.exists()).toBe(true);
		expect(channelLink.attributes('target')).toBe('_blank');
		expect(channelLink.attributes('rel')).toContain('noopener');
	});

	it('does not mount any iframe until a video is opened', async () => {
		expect(wrapper.find('iframe').exists()).toBe(false);

		await wrapper.findAll('button[type="button"]')[0].trigger('click');
		await nextTick();

		const iframe = wrapper.find('iframe');
		expect(iframe.exists()).toBe(true);
		expect(iframe.attributes('src')).toBe(
			'https://www.youtube-nocookie.com/embed/AHhyWbUv_Is?autoplay=1&rel=0&modestbranding=1',
		);
	});

	it('closes the player with Escape and releases the body scroll lock', async () => {
		await wrapper.findAll('button[type="button"]')[0].trigger('click');
		await flushPromises();
		expect(bodyStyle()).toContain('overflow: hidden');

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await flushPromises();

		expect(wrapper.find('iframe').exists()).toBe(false);
		expect(bodyStyle()).not.toContain('overflow: hidden');
	});
});
