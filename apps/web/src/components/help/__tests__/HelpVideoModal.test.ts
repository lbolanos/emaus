import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import HelpVideoModal from '../HelpVideoModal.vue';

let wrapper: VueWrapper | null = null;

function mountModal(videoId: string | null): VueWrapper {
	wrapper = mount(
		HelpVideoModal,
		{
			props: { videoId },
			// Keep the modal content inside the wrapper instead of teleporting to body
			global: { stubs: { teleport: true } },
		},
	);
	return wrapper;
}

afterEach(() => {
	wrapper?.unmount();
	wrapper = null;
	document.body.style.overflow = '';
	vi.restoreAllMocks();
});

describe('HelpVideoModal', () => {
	it('renders nothing when closed', () => {
		const w = mountModal(null);
		expect(w.find('iframe').exists()).toBe(false);
		expect(w.find('[role="dialog"]').exists()).toBe(false);
	});

	it('renders the youtube-nocookie player for the open video', () => {
		const w = mountModal('AHhyWbUv_Is');
		const iframe = w.find('iframe');
		expect(iframe.exists()).toBe(true);
		expect(iframe.attributes('src')).toBe(
			'https://www.youtube-nocookie.com/embed/AHhyWbUv_Is?autoplay=1&rel=0&modestbranding=1',
		);
		expect(iframe.attributes('allowfullscreen')).toBeDefined();
	});

	it('opens the watch URL in a new window with noopener when the button is clicked', async () => {
		const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
		const w = mountModal('AHhyWbUv_Is');

		const button = w.findAll('button').find((b) => b.text().includes('help.video.openInNewWindow'));
		expect(button).toBeTruthy();
		await button!.trigger('click');

		expect(openSpy).toHaveBeenCalledTimes(1);
		expect(openSpy).toHaveBeenCalledWith(
			'https://www.youtube.com/watch?v=AHhyWbUv_Is',
			'_blank',
			'noopener,noreferrer',
		);
	});

	it('emits close when the X button is clicked', async () => {
		const w = mountModal('AHhyWbUv_Is');
		const closeButton = w
			.findAll('button')
			.find((b) => b.attributes('aria-label') === 'common.close');
		expect(closeButton).toBeTruthy();
		await closeButton!.trigger('click');
		expect(w.emitted('close')).toHaveLength(1);
	});

	it('emits close on backdrop click and on Escape', async () => {
		const w = mountModal('AHhyWbUv_Is');

		await w.find('[role="dialog"]').trigger('click');
		expect(w.emitted('close')).toHaveLength(1);

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		expect(w.emitted('close')).toHaveLength(2);
	});

	it('unmounts the iframe when the video is closed, stopping playback', async () => {
		const w = mountModal('AHhyWbUv_Is');
		expect(w.find('iframe').exists()).toBe(true);

		await w.setProps({ videoId: null });
		expect(w.find('iframe').exists()).toBe(false);
	});
});
