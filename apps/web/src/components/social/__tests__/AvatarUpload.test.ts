import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import es from '@/locales/es.json';

const { mockToast, mockPickFile, mockResize, mockReadAsDataUrl } = vi.hoisted(() => ({
	mockToast: vi.fn(),
	mockPickFile: vi.fn(),
	mockResize: vi.fn(),
	mockReadAsDataUrl: vi.fn(),
}));

// Toast assertions need a mock the test can reach: the global @repo/ui mock
// mints a fresh vi.fn() per useToast() call. useToast is all this component uses.
vi.mock('@repo/ui', () => ({
	useToast: () => ({ toast: mockToast }),
}));

// The params are kept in the translated string so a test can read them.
const translate = (key: string, params?: Record<string, unknown>) =>
	params ? `${key}:${JSON.stringify(params)}` : key;
vi.mock('vue-i18n', () => ({
	useI18n: () => ({ t: translate }),
}));

vi.mock('@/utils/filePicker', () => ({
	pickFile: (...args: any[]) => mockPickFile(...args),
}));

// The real resize draws on a <canvas>, which happy-dom lacks; the size
// constants stay real because the component imports them from the same module.
vi.mock('@/utils/imageResize', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/utils/imageResize')>()),
	resizeImageToDataUrl: (...args: any[]) => mockResize(...args),
	readAsDataUrl: (...args: any[]) => mockReadAsDataUrl(...args),
}));

import AvatarUpload from '../AvatarUpload.vue';

const imageFile = (name: string, type: string, size: number) => {
	const file = new File([new Uint8Array([1, 2, 3])], name, { type });
	Object.defineProperty(file, 'size', { value: size });
	return file;
};

const mountAvatar = () =>
	mount(AvatarUpload, {
		props: { displayName: 'Ana Pérez', size: 'xl' },
		global: { mocks: { $t: translate } },
	});

const cameraButton = (wrapper: ReturnType<typeof mountAvatar>) =>
	wrapper.find('button[aria-label="social.avatar.upload"]');

describe('AvatarUpload', () => {
	beforeEach(() => {
		mockToast.mockReset();
		mockPickFile.mockReset();
		mockResize.mockReset().mockResolvedValue('data:image/jpeg;base64,SMALL');
		mockReadAsDataUrl.mockReset().mockResolvedValue('data:image/png;base64,ORIGINAL');
	});

	it('shrinks a phone photo over 2MB to 512px and emits the shrunk version', async () => {
		const wrapper = mountAvatar();
		const photo = imageFile('selfie.jpg', 'image/jpeg', 8 * 1024 * 1024);
		mockPickFile.mockResolvedValue(photo);

		await cameraButton(wrapper).trigger('click');
		await flushPromises();

		// No maxSide: the 512px default, so processAvatar neither re-crops nor enlarges it.
		expect(mockResize).toHaveBeenCalledWith(photo);
		expect(wrapper.emitted('upload')).toEqual([['data:image/jpeg;base64,SMALL']]);
		expect(wrapper.find('img').attributes('src')).toBe('data:image/jpeg;base64,SMALL');
	});

	it('emits an image of 2MB or less as is, keeping a PNG transparency', async () => {
		const wrapper = mountAvatar();
		const png = imageFile('logo.png', 'image/png', 1024 * 1024);
		mockPickFile.mockResolvedValue(png);

		await cameraButton(wrapper).trigger('click');
		await flushPromises();

		expect(mockResize).not.toHaveBeenCalled();
		expect(mockReadAsDataUrl).toHaveBeenCalledWith(png);
		expect(wrapper.emitted('upload')).toEqual([['data:image/png;base64,ORIGINAL']]);
	});

	it('disables the camera button while the photo is being shrunk', async () => {
		const wrapper = mountAvatar();
		let finishResize!: (dataUrl: string) => void;
		mockResize.mockReturnValue(new Promise((resolve) => (finishResize = resolve)));
		mockPickFile.mockResolvedValue(imageFile('selfie.jpg', 'image/jpeg', 8 * 1024 * 1024));

		await cameraButton(wrapper).trigger('click');
		await flushPromises();

		expect(cameraButton(wrapper).attributes('disabled')).toBeDefined();
		expect(wrapper.emitted('upload')).toBeUndefined();

		finishResize('data:image/jpeg;base64,SMALL');
		await flushPromises();
		expect(cameraButton(wrapper).attributes('disabled')).toBeUndefined();
		expect(wrapper.emitted('upload')).toHaveLength(1);
	});

	it('rejects an image over 30MB without shrinking or emitting it', async () => {
		const wrapper = mountAvatar();
		mockPickFile.mockResolvedValue(imageFile('enorme.jpg', 'image/jpeg', 31 * 1024 * 1024));

		await cameraButton(wrapper).trigger('click');
		await flushPromises();

		expect(mockToast).toHaveBeenCalledWith(
			expect.objectContaining({
				description: 'social.avatar.fileTooLarge:{"maxSize":30}',
				variant: 'destructive',
			}),
		);
		expect(mockResize).not.toHaveBeenCalled();
		expect(wrapper.emitted('upload')).toBeUndefined();
	});

	it('shows a read error when the photo cannot be shrunk', async () => {
		const wrapper = mountAvatar();
		mockResize.mockRejectedValue(new Error('No se pudo leer la imagen'));
		mockPickFile.mockResolvedValue(imageFile('rota.jpg', 'image/jpeg', 8 * 1024 * 1024));

		await cameraButton(wrapper).trigger('click');
		await flushPromises();

		expect(mockToast).toHaveBeenCalledWith(
			expect.objectContaining({ description: 'social.avatar.readError', variant: 'destructive' }),
		);
		expect(wrapper.emitted('upload')).toBeUndefined();
		expect(cameraButton(wrapper).attributes('disabled')).toBeUndefined();
	});

	it('the Spanish copy no longer promises a 2MB limit and states the cap in MB', () => {
		expect(es.social.avatar.uploadInfo).not.toMatch(/\d\s*MB/);
		expect(es.social.avatar.fileTooLarge).toContain('{maxSize}MB');
	});
});
