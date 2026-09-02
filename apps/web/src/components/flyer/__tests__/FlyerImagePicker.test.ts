import { describe, it, expect, beforeEach, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

// vi.hoisted: vi.mock factories are hoisted above the file, so a plain top-level
// const would blow up with "Cannot access before initialization".
const { uploadFlyerAsset, resizeImageToDataUrl } = vi.hoisted(() => ({
	uploadFlyerAsset: vi.fn(),
	resizeImageToDataUrl: vi.fn(),
}));

vi.mock('@/services/api', () => ({ uploadFlyerAsset }));
vi.mock('@/utils/imageResize', () => ({ resizeImageToDataUrl }));

import FlyerImagePicker from '../editor/FlyerImagePicker.vue';
import { FLYER_PRESET_ASSETS } from '../flyerPresetAssets';

function mountPicker(props: Record<string, unknown> = {}) {
	return mount(FlyerImagePicker, {
		props: { imageKey: 'bodyBackground', ...props },
	});
}

const pickFile = async (wrapper: ReturnType<typeof mountPicker>, file: File) => {
	const input = wrapper.find('input[type="file"]');
	// happy-dom keeps `files` read-only, so define it the way the browser would
	Object.defineProperty(input.element, 'files', { value: [file], configurable: true });
	await input.trigger('change');
	await flushPromises();
};

describe('FlyerImagePicker', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resizeImageToDataUrl.mockResolvedValue('data:image/jpeg;base64,zzz');
		uploadFlyerAsset.mockResolvedValue('https://cdn.example.com/uploaded.webp');
	});

	it('offers the presets for its own image slot', () => {
		const wrapper = mountPicker({ imageKey: 'logo' });
		const srcs = wrapper.findAll('button img').map((img) => img.attributes('src'));

		expect(srcs).toEqual(FLYER_PRESET_ASSETS.logo.map((p) => p.url));
	});

	it('emits the preset url when one is picked', async () => {
		const wrapper = mountPicker();
		await wrapper.findAll('button')[0].trigger('click');

		expect(wrapper.emitted('update')?.[0]).toEqual([FLYER_PRESET_ASSETS.bodyBackground[0].url]);
	});

	it('marks the preset in use', () => {
		const url = FLYER_PRESET_ASSETS.bodyBackground[1].url;
		const wrapper = mountPicker({ modelValue: url });

		const selected = wrapper
			.findAll('button')
			.filter((b) => b.attributes('aria-pressed') === 'true');
		expect(selected).toHaveLength(1);
		expect(selected[0].find('img').attributes('src')).toBe(url);
	});

	it('resizes before uploading, and emits the stored url', async () => {
		const wrapper = mountPicker();
		await pickFile(wrapper, new File(['x'], 'fondo.png', { type: 'image/png' }));

		// Backgrounds are exported at pixelRatio 2, so 512 (the default) is not enough
		expect(resizeImageToDataUrl).toHaveBeenCalledWith(expect.any(File), {
			maxSide: 1600,
			quality: 0.9,
		});
		expect(uploadFlyerAsset).toHaveBeenCalledWith('bodyBackground', 'data:image/jpeg;base64,zzz');
		expect(wrapper.emitted('update')?.[0]).toEqual(['https://cdn.example.com/uploaded.webp']);
	});

	it('keeps logos at 512px', async () => {
		const wrapper = mountPicker({ imageKey: 'logo' });
		await pickFile(wrapper, new File(['x'], 'logo.png', { type: 'image/png' }));

		expect(resizeImageToDataUrl).toHaveBeenCalledWith(expect.any(File), {
			maxSide: 512,
			quality: 0.9,
		});
	});

	it("surfaces the server's reason when the upload fails, and emits nothing", async () => {
		uploadFlyerAsset.mockRejectedValue({
			response: { data: { message: 'La imagen es demasiado grande' } },
		});
		const wrapper = mountPicker();
		await pickFile(wrapper, new File(['x'], 'fondo.png', { type: 'image/png' }));

		expect(wrapper.text()).toContain('La imagen es demasiado grande');
		expect(wrapper.emitted('update')).toBeUndefined();
	});

	it('falls back to a generic message when the failure carries none', async () => {
		uploadFlyerAsset.mockRejectedValue({});
		const wrapper = mountPicker();
		await pickFile(wrapper, new File(['x'], 'fondo.png', { type: 'image/png' }));

		expect(wrapper.text()).toContain('retreatFlyerEditor.images.failed');
	});

	it('offers to go back to the default only when an image is set', async () => {
		expect(mountPicker().text()).not.toContain('retreatFlyerEditor.images.useDefault');

		const wrapper = mountPicker({ modelValue: 'https://cdn.example.com/x.webp' });
		expect(wrapper.text()).toContain('retreatFlyerEditor.images.useDefault');

		await wrapper.find('button').trigger('click');
		expect(wrapper.emitted('update')?.[0]).toEqual([undefined]);
	});

	it('previews an uploaded image, which is not in the gallery', () => {
		const wrapper = mountPicker({ modelValue: 'https://cdn.example.com/custom.webp' });
		expect(wrapper.text()).toContain('retreatFlyerEditor.images.current');
	});
});
