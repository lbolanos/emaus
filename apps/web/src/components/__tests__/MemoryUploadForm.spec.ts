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

const importBtn = (wrapper: any) =>
	wrapper.findAll('button').find((b: any) => b.text().includes('Importar música del minuto a minuto'));

describe('MemoryUploadForm', () => {
	beforeEach(() => {
		Object.values(mocks).forEach((m) => m.mockReset());
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
});
