/**
 * The meeting photo picked in the form is shrunk in the browser before it is
 * kept for upload: the server takes at most 2MB and a phone photo weighs 3-8MB.
 * While it is being shrunk, saving is blocked: a save in that window would
 * create the meeting without the photo and say nothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const createMeeting = vi.fn(async () => ({ id: 'new-meeting' }));
const setMeetingPhoto = vi.fn(async () => ({}));
const storeState = vi.hoisted(() => ({ community: null as any }));

vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		createMeeting,
		updateMeeting: vi.fn(),
		setMeetingPhoto,
		deleteMeetingPhoto: vi.fn(),
		deleteMeeting: vi.fn(),
		fetchCommunity: vi.fn(),
		get currentCommunity() {
			return storeState.community;
		},
	}),
}));

const mockToast = vi.fn();
vi.mock('@repo/ui', () => new Proxy(
	{},
	{
		get: (_t, name) => {
			const n = String(name);
			if (n === '__esModule') return false;
			if (n === 'useToast') return () => ({ toast: mockToast });
			if (n.startsWith('use')) return () => ({});
			return { name: n, template: '<div><slot /></div>' };
		},
		has: () => true,
	},
));

vi.mock('lucide-vue-next', () => new Proxy(
	{},
	{
		get: (_t, name) => (name === '__esModule' ? false : { name: String(name), template: '<svg />' }),
		has: () => true,
	},
));

const mockPickFile = vi.fn();
vi.mock('@/utils/filePicker', () => ({ pickFile: (...a: any[]) => mockPickFile(...a) }));

// The real resize draws on a <canvas>, which happy-dom lacks.
const mockResize = vi.fn();
const mockResizeAnalysis = vi.fn();
vi.mock('@/utils/imageResize', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/utils/imageResize')>()),
	resizeImageToDataUrl: (...a: any[]) => mockResize(...a),
	resizeImageForAnalysis: (...a: any[]) => mockResizeAnalysis(...a),
}));

import MeetingFormModal from '../MeetingFormModal.vue';

const MB = 1024 * 1024;
const makeFile = (name: string, size: number) => {
	const file = new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
	Object.defineProperty(file, 'size', { value: size });
	return file;
};

const factory = () =>
	mount(MeetingFormModal, {
		props: { open: true, communityId: 'comm-1' },
		global: { mocks: { $t: (key: string) => key } },
	});

const addPhotoButton = (wrapper: any) =>
	wrapper.findAll('button').find((b: any) => /Agregar foto|Procesando foto/.test(b.text()));

describe('MeetingFormModal — meeting photo', () => {
	beforeEach(() => {
		createMeeting.mockClear();
		setMeetingPhoto.mockClear();
		mockToast.mockReset();
		mockPickFile.mockReset();
		mockResize.mockReset();
		mockResizeAnalysis.mockReset();
		storeState.community = null;
	});

	it('shrinks the chosen photo to 1600px, blocks saving meanwhile, and uploads the shrunk version', async () => {
		let finishResize: (value: string) => void = () => {};
		mockResize.mockReturnValue(new Promise<string>((resolve) => (finishResize = resolve)));
		const big = makeFile('celular.jpg', 8 * MB);
		mockPickFile.mockResolvedValue(big);

		const wrapper = factory();
		await flushPromises();
		// A valid form first, so a disabled submit can only come from the photo.
		wrapper.vm.form.title = 'Reunión con foto';
		wrapper.vm.form.date = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
		wrapper.vm.form.time = '20:00';
		await flushPromises();
		// The stubbed Button is a <div>, so Vue writes the boolean prop as text.
		const submitDisabled = () => wrapper.find('[type="submit"]').attributes('disabled');
		expect(submitDisabled()).toBe('false');

		await addPhotoButton(wrapper).trigger('click');
		await flushPromises();

		// Still shrinking: the submit button is disabled and the tile says so.
		expect(mockResize).toHaveBeenCalledWith(big, { maxSide: 1600 });
		expect(submitDisabled()).toBe('true');
		expect(addPhotoButton(wrapper).text()).toContain('Procesando foto');

		finishResize('data:image/jpeg;base64,SMALL');
		await flushPromises();

		expect(submitDisabled()).toBe('false');
		expect(wrapper.find('img[src="data:image/jpeg;base64,SMALL"]').exists()).toBe(true);

		await wrapper.vm.handleSubmit();
		await flushPromises();

		expect(setMeetingPhoto).toHaveBeenCalledWith('new-meeting', 'data:image/jpeg;base64,SMALL');
	});

	it('rejects a file larger than 30MB without shrinking it', async () => {
		mockPickFile.mockResolvedValue(makeFile('enorme.jpg', 31 * MB));

		const wrapper = factory();
		await flushPromises();
		await addPhotoButton(wrapper).trigger('click');
		await flushPromises();

		expect(mockResize).not.toHaveBeenCalled();
		expect(mockToast).toHaveBeenCalledWith(
			expect.objectContaining({ description: 'La imagen no puede exceder 30MB' }),
		);
	});

	describe('face review after the cover (D1)', () => {
		const saveWithPhoto = async () => {
			mockResize.mockResolvedValue('data:cover');
			mockResizeAnalysis.mockResolvedValue('data:analysis');
			mockPickFile.mockResolvedValue(makeFile('grupo.jpg', 5 * MB));
			const wrapper = factory();
			await flushPromises();
			wrapper.vm.form.title = 'Reunión con foto';
			wrapper.vm.form.date = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
			wrapper.vm.form.time = '20:00';
			await flushPromises();
			await addPhotoButton(wrapper).trigger('click');
			await flushPromises();
			await wrapper.vm.handleSubmit();
			await flushPromises();
			return wrapper;
		};

		it('emits photo-saved with the 3200 px version when face recognition is on', async () => {
			storeState.community = { id: 'comm-1', faceRecognitionEnabled: true };
			const wrapper = await saveWithPhoto();

			expect(setMeetingPhoto).toHaveBeenCalledWith('new-meeting', 'data:cover');
			expect(wrapper.emitted('photo-saved')).toEqual([[{ meetingId: 'new-meeting', analysisImage: 'data:analysis' }]]);
		});

		it('only saves the cover when face recognition is off', async () => {
			storeState.community = { id: 'comm-1', faceRecognitionEnabled: false };
			const wrapper = await saveWithPhoto();

			expect(setMeetingPhoto).toHaveBeenCalledTimes(1);
			expect(mockResizeAnalysis).not.toHaveBeenCalled();
			expect(wrapper.emitted('photo-saved')).toBeUndefined();
		});

		it('keeps the cover and warns when the analysis version cannot be made', async () => {
			storeState.community = { id: 'comm-1', faceRecognitionEnabled: true };
			vi.spyOn(console, 'error').mockImplementation(() => {});
			mockResizeAnalysis.mockReset();
			mockResize.mockResolvedValue('data:cover');
			mockPickFile.mockResolvedValue(makeFile('grupo.jpg', 5 * MB));
			mockResizeAnalysis.mockRejectedValue(new Error('too big'));
			const wrapper = factory();
			await flushPromises();
			wrapper.vm.form.title = 'Reunión con foto';
			wrapper.vm.form.date = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
			wrapper.vm.form.time = '20:00';
			await flushPromises();
			await addPhotoButton(wrapper).trigger('click');
			await flushPromises();
			await wrapper.vm.handleSubmit();
			await flushPromises();

			expect(setMeetingPhoto).toHaveBeenCalled();
			expect(wrapper.emitted('photo-saved')).toBeUndefined();
			expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'No se pudo analizar la foto' }));
		});
	});
});
