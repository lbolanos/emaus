import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MemoryUploadForm from '../social/MemoryUploadForm.vue';

const photo = (id: string, url: string, isPrimary = false, sortOrder = 0) => ({
	id,
	retreatId: 'r1',
	url,
	isPrimary,
	sortOrder,
	createdAt: new Date(),
});
const song = (
	id: string,
	url: string,
	isPrimary = false,
	sortOrder = 0,
	title: string | null = null,
	source: 'manual' | 'mam' = 'manual',
) => ({
	id,
	retreatId: 'r1',
	url,
	title,
	source,
	isPrimary,
	sortOrder,
	createdAt: new Date(),
});

// Far future / far past relative to any test run.
const FUTURE = '2999-01-01';
const PAST = '2000-01-01';

const mocks = {
	getRetreatMemories: vi.fn(),
	addRetreatMemoryPhoto: vi.fn(),
	deleteRetreatMemoryPhoto: vi.fn(),
	setPrimaryRetreatMemoryPhoto: vi.fn(),
	addRetreatMemorySong: vi.fn(),
	updateRetreatMemorySong: vi.fn(),
	deleteRetreatMemorySong: vi.fn(),
	setPrimaryRetreatMemorySong: vi.fn(),
	importRetreatMemorySongsFromMam: vi.fn(),
};

vi.mock('@/services/api', () => ({
	getRetreatMemories: (...a: any[]) => mocks.getRetreatMemories(...a),
	addRetreatMemoryPhoto: (...a: any[]) => mocks.addRetreatMemoryPhoto(...a),
	deleteRetreatMemoryPhoto: (...a: any[]) => mocks.deleteRetreatMemoryPhoto(...a),
	setPrimaryRetreatMemoryPhoto: (...a: any[]) => mocks.setPrimaryRetreatMemoryPhoto(...a),
	addRetreatMemorySong: (...a: any[]) => mocks.addRetreatMemorySong(...a),
	updateRetreatMemorySong: (...a: any[]) => mocks.updateRetreatMemorySong(...a),
	deleteRetreatMemorySong: (...a: any[]) => mocks.deleteRetreatMemorySong(...a),
	setPrimaryRetreatMemorySong: (...a: any[]) => mocks.setPrimaryRetreatMemorySong(...a),
	importRetreatMemorySongsFromMam: (...a: any[]) => mocks.importRetreatMemorySongsFromMam(...a),
}));

// The global `@repo/ui` mock hands out a fresh `vi.fn()` per `useToast()` call,
// so the toasts could not be asserted. The component only uses `useToast`.
const mockToast = vi.fn();
vi.mock('@repo/ui', () => ({ useToast: () => ({ toast: mockToast }) }));

const mockPickFiles = vi.fn();
vi.mock('@/utils/filePicker', () => ({ pickFiles: (...a: any[]) => mockPickFiles(...a) }));

// The real resize draws on a <canvas>, which happy-dom lacks. What matters here
// is that every upload goes through it, and with which bound. The size
// constants stay real: the form imports them from the same module.
const mockResize = vi.fn();
vi.mock('@/utils/imageResize', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/utils/imageResize')>()),
	resizeImageToDataUrl: (...a: any[]) => mockResize(...a),
}));

const MB = 1024 * 1024;
/** A `File` that reports `size` without allocating it. */
const makeFile = (name: string, size = 1 * MB, type = 'image/jpeg') => {
	const file = new File([new Uint8Array([1, 2, 3])], name, { type });
	Object.defineProperty(file, 'size', { value: size });
	return file;
};

const importBtn = (wrapper: any) =>
	wrapper.findAll('button').find((b: any) => b.text().includes('Importar música del minuto a minuto'));
const addPhotoBtn = (wrapper: any) =>
	wrapper.findAll('button').find((b: any) => b.text().includes('Agregar'));

/** Mounts the form, picks `files` through the add tile and waits for the batch. */
const uploadFiles = async (files: File[]) => {
	const wrapper = mount(MemoryUploadForm, { props: { retreatId: 'r1' } });
	await flushPromises();
	mockPickFiles.mockResolvedValueOnce(files);
	await addPhotoBtn(wrapper).trigger('click');
	await flushPromises();
	return wrapper;
};

describe('MemoryUploadForm', () => {
	beforeEach(() => {
		Object.values(mocks).forEach((m) => m.mockReset());
		mockToast.mockReset();
		mockPickFiles.mockReset();
		mockResize.mockReset();
		mockResize.mockImplementation(async (file: File) => `data:image/jpeg;base64,SMALL-${file.name}`);
		mocks.addRetreatMemoryPhoto.mockResolvedValue(photo('new', 'urlNew'));
		mocks.getRetreatMemories.mockResolvedValue({
			photos: [photo('p1', 'urlA', true, 0)],
			songs: [song('s1', 'https://a.com', true, 0, 'Cantos')],
		});
	});

	it('carga y renderiza fotos y canciones existentes al montar', async () => {
		const wrapper = mount(MemoryUploadForm, { props: { retreatId: 'r1' } });
		await flushPromises();

		expect(mocks.getRetreatMemories).toHaveBeenCalledWith('r1');
		expect(wrapper.find('img[src="urlA"]').exists()).toBe(true);
		// La foto principal muestra el badge "Principal".
		expect(wrapper.text()).toContain('Principal');
		// El input de la canción existente tiene su url.
		const urlInputs = wrapper.findAll('input[type="url"]');
		expect(urlInputs.some((i) => (i.element as HTMLInputElement).value === 'https://a.com')).toBe(true);
	});

	it('agrega una canción llamando a la API y recarga', async () => {
		mocks.addRetreatMemorySong.mockResolvedValue(song('s2', 'https://new.com'));
		const wrapper = mount(MemoryUploadForm, { props: { retreatId: 'r1' } });
		await flushPromises();

		// El último input url es el de "nueva canción".
		const urlInputs = wrapper.findAll('input[type="url"]');
		const newInput = urlInputs[urlInputs.length - 1];
		await newInput.setValue('https://new.com');

		mocks.getRetreatMemories.mockResolvedValueOnce({
			photos: [photo('p1', 'urlA', true, 0)],
			songs: [
				song('s1', 'https://a.com', true, 0, 'Cantos'),
				song('s2', 'https://new.com', false, 1),
			],
		});

		// El botón "Agregar" canción está junto al input nuevo.
		await newInput.trigger('keyup.enter');
		await flushPromises();

		expect(mocks.addRetreatMemorySong).toHaveBeenCalledWith('r1', {
			url: 'https://new.com',
			title: undefined,
		});
	});

	it('marca una foto como principal vía API', async () => {
		mocks.getRetreatMemories.mockResolvedValue({
			photos: [photo('p1', 'urlA', true, 0), photo('p2', 'urlB', false, 1)],
			songs: [],
		});
		mocks.setPrimaryRetreatMemoryPhoto.mockResolvedValue({
			photos: [photo('p1', 'urlA', false, 0), photo('p2', 'urlB', true, 1)],
			songs: [],
		});
		const wrapper = mount(MemoryUploadForm, { props: { retreatId: 'r1' } });
		await flushPromises();

		// El botón de marcar principal aparece solo en la foto no-principal (p2).
		const starButtons = wrapper.findAll('button[title="Marcar como principal"]');
		expect(starButtons.length).toBeGreaterThan(0);
		await starButtons[0].trigger('click');
		await flushPromises();

		expect(mocks.setPrimaryRetreatMemoryPhoto).toHaveBeenCalledWith('r1', 'p2');
	});

	it('deshabilita el botón de importar MAM si el retiro no ha terminado', async () => {
		const wrapper = mount(MemoryUploadForm, {
			props: { retreatId: 'r1', retreatEndDate: FUTURE },
		});
		await flushPromises();
		const btn = importBtn(wrapper);
		expect(btn).toBeTruthy();
		expect(btn.attributes('disabled')).toBeDefined();
	});

	it('importa la música del MAM cuando el retiro ya terminó', async () => {
		mocks.importRetreatMemorySongsFromMam.mockResolvedValue({
			imported: 2,
			skipped: 0,
			songs: [
				song('s1', 'https://a.com', true, 0, 'Cantos', 'manual'),
				song('m1', 'https://mam1.com', false, 0, 'Charla', 'mam'),
			],
		});
		const wrapper = mount(MemoryUploadForm, {
			props: { retreatId: 'r1', retreatEndDate: PAST },
		});
		await flushPromises();

		const btn = importBtn(wrapper);
		expect(btn.attributes('disabled')).toBeUndefined();
		await btn.trigger('click');
		await flushPromises();

		expect(mocks.importRetreatMemorySongsFromMam).toHaveBeenCalledWith('r1');
		// La canción del MAM aparece en la lista read-only.
		expect(wrapper.text()).toContain('Música del minuto a minuto');
		expect(wrapper.find('a[href="https://mam1.com"]').exists()).toBe(true);
	});

	describe('photo upload', () => {
		it('shrinks a photo larger than 5MB to 1600px and uploads the shrunk version', async () => {
			const big = makeFile('celular.jpg', 8 * MB);
			await uploadFiles([big]);

			expect(mockResize).toHaveBeenCalledWith(big, { maxSide: 1600 });
			expect(mocks.addRetreatMemoryPhoto).toHaveBeenCalledWith('r1', 'data:image/jpeg;base64,SMALL-celular.jpg');
			expect(mockToast).not.toHaveBeenCalled();
			// Mount + reload after the batch.
			expect(mocks.getRetreatMemories).toHaveBeenCalledTimes(2);
		});

		it('rejects a file larger than 30MB without shrinking or uploading it', async () => {
			await uploadFiles([makeFile('enorme.jpg', 31 * MB)]);

			expect(mockResize).not.toHaveBeenCalled();
			expect(mocks.addRetreatMemoryPhoto).not.toHaveBeenCalled();
			expect(mockToast).toHaveBeenCalledWith(
				expect.objectContaining({ title: 'Archivo muy grande', description: 'enorme.jpg supera los 30MB' }),
			);
		});

		it('rejects a format other than JPG, PNG or WebP', async () => {
			await uploadFiles([makeFile('animada.gif', 1 * MB, 'image/gif')]);

			expect(mocks.addRetreatMemoryPhoto).not.toHaveBeenCalled();
			expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Formato no válido' }));
		});

		it('keeps uploading the rest of the batch when one photo fails, and reloads the gallery', async () => {
			mocks.addRetreatMemoryPhoto
				.mockResolvedValueOnce(photo('a', 'urlA2'))
				.mockRejectedValueOnce(new Error('boom'))
				.mockResolvedValueOnce(photo('c', 'urlC'));

			await uploadFiles([makeFile('uno.jpg'), makeFile('dos.jpg'), makeFile('tres.jpg')]);

			expect(mocks.addRetreatMemoryPhoto).toHaveBeenCalledTimes(3);
			expect(mocks.addRetreatMemoryPhoto).toHaveBeenLastCalledWith('r1', 'data:image/jpeg;base64,SMALL-tres.jpg');
			expect(mockToast).toHaveBeenCalledTimes(1);
			expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'No se pudo subir dos.jpg' }));
			expect(mocks.getRetreatMemories).toHaveBeenCalledTimes(2);
		});

		it('reports several failures in a single toast instead of one per photo', async () => {
			mocks.addRetreatMemoryPhoto.mockRejectedValue(new Error('Sesión expirada'));

			await uploadFiles([makeFile('uno.jpg'), makeFile('dos.jpg'), makeFile('tres.jpg')]);

			expect(mocks.addRetreatMemoryPhoto).toHaveBeenCalledTimes(3);
			expect(mockToast).toHaveBeenCalledTimes(1);
			expect(mockToast).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'No se pudieron subir 3 fotos',
					description: 'uno.jpg, dos.jpg, tres.jpg. Sesión expirada',
				}),
			);
		});

		it('also keeps going when shrinking a photo fails', async () => {
			mockResize.mockRejectedValueOnce(new Error('No se pudo leer la imagen'));

			await uploadFiles([makeFile('dañada.jpg'), makeFile('buena.jpg')]);

			expect(mocks.addRetreatMemoryPhoto).toHaveBeenCalledTimes(1);
			expect(mocks.addRetreatMemoryPhoto).toHaveBeenCalledWith('r1', 'data:image/jpeg;base64,SMALL-buena.jpg');
			expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'No se pudo subir dañada.jpg' }));
		});

		it('uploads only as many photos as there are free slots', async () => {
			mocks.getRetreatMemories.mockResolvedValue({
				photos: Array.from({ length: 29 }, (_, i) => photo(`p${i}`, `url${i}`, i === 0, i)),
				songs: [],
			});

			await uploadFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);

			expect(mocks.addRetreatMemoryPhoto).toHaveBeenCalledTimes(1);
			expect(mocks.addRetreatMemoryPhoto).toHaveBeenCalledWith('r1', 'data:image/jpeg;base64,SMALL-a.jpg');
			// The two left out are reported, not dropped silently.
			expect(mockToast).toHaveBeenCalledWith(
				expect.objectContaining({
					title: 'Máximo 30 fotos por retiro',
					description: 'No se subieron 2 foto(s) por falta de espacio.',
				}),
			);
		});
	});
});
