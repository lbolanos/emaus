import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const { getPublicMeetingAlbum } = vi.hoisted(() => ({ getPublicMeetingAlbum: vi.fn() }));

vi.mock('@/services/api', () => ({ getPublicMeetingAlbum }));
vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { token: 'tok123' } }),
	useRouter: () => ({ push: vi.fn() }),
}));

import PublicMeetingAlbumView from '../PublicMeetingAlbumView.vue';

const album = {
	communityName: 'Emaús del Valle',
	meetingTitle: 'Reunión de octubre',
	startDate: '2026-10-22T01:00:00.000Z', // 21 Oct 19:00 in Mexico City
	timezone: 'America/Mexico_City',
	photoUrl: 'https://example.com/photo.jpg',
	tags: [
		{ name: 'José Pérez', box: [100, 200, 300, 400] },
		{ name: 'Ana López', box: [500, 600, 700, 800] },
	],
};

const mountView = async () => {
	const wrapper = mount(PublicMeetingAlbumView, { attachTo: document.body });
	await flushPromises();
	return wrapper;
};

describe('PublicMeetingAlbumView', () => {
	beforeEach(() => {
		getPublicMeetingAlbum.mockReset();
		sessionStorage.clear();
		document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove());
	});

	it('renders one positioned button per tag, eyebrow, count and title', async () => {
		getPublicMeetingAlbum.mockResolvedValue(album);
		const wrapper = await mountView();

		expect(getPublicMeetingAlbum).toHaveBeenCalledWith('tok123');
		const first = wrapper.get('[aria-label="Identificar José Pérez"]');
		expect(first.attributes('style')).toContain('left: 20%');
		expect(first.attributes('style')).toContain('top: 10%');
		expect(first.attributes('style')).toContain('width: 20%');
		expect(first.attributes('style')).toContain('height: 20%');
		expect(wrapper.findAll('[data-testid^="face-"]').filter((b) => b.element.tagName === 'BUTTON')).toHaveLength(2);
		expect(wrapper.get('[data-testid="album-count"]').text()).toBe('2 integrantes');
		expect(wrapper.get('[data-testid="album-eyebrow"]').text()).toBe('EMAÚS DEL VALLE · 21 DE OCTUBRE');
		expect(wrapper.text()).toContain('Conozcamos nuestros nombres');
		expect(document.title).toBe('Conozcamos nuestros nombres · Emaús del Valle');
		wrapper.unmount();
	});

	it('selecting a face shows its name in the status card', async () => {
		getPublicMeetingAlbum.mockResolvedValue(album);
		const wrapper = await mountView();

		expect(wrapper.get('[data-testid="album-status"]').text()).toContain('Seleccione un rostro o un nombre');
		await wrapper.get('[aria-label="Identificar Ana López"]').trigger('click');
		expect(wrapper.get('[data-testid="album-status"]').text()).toContain('Ana López');
		wrapper.unmount();
	});

	it('search filters the list (ignoring accents) and Enter selects the first match', async () => {
		vi.useFakeTimers();
		getPublicMeetingAlbum.mockResolvedValue(album);
		const wrapper = await mountView();

		const input = wrapper.get('[data-testid="album-search"]');
		await input.setValue('jose');
		expect(wrapper.find('[data-testid="list-item-0"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="list-item-1"]').exists()).toBe(false);

		await input.trigger('keydown', { key: 'Enter' });
		expect(wrapper.get('[data-testid="album-status"]').text()).toContain('José Pérez');
		vi.runAllTimers();
		vi.useRealTimers();
		wrapper.unmount();
	});

	it('toggles dots', async () => {
		getPublicMeetingAlbum.mockResolvedValue(album);
		const wrapper = await mountView();

		expect(wrapper.findAll('[data-testid="face-dot"]')).toHaveLength(0);
		const toggle = wrapper.get('[data-testid="toggle-dots"]');
		expect(toggle.text()).toBe('Mostrar puntos');
		await toggle.trigger('click');
		expect(wrapper.findAll('[data-testid="face-dot"]')).toHaveLength(2);
		expect(toggle.text()).toBe('Ocultar puntos');
		wrapper.unmount();
	});

	it('zooms in and out and resets with "Foto completa"', async () => {
		getPublicMeetingAlbum.mockResolvedValue(album);
		const wrapper = await mountView();

		expect(wrapper.get('[data-testid="zoom-label"]').text()).toBe('100 %');
		await wrapper.get('[data-testid="zoom-in"]').trigger('click');
		expect(wrapper.get('[data-testid="zoom-label"]').text()).toBe('150 %');
		const buttons = wrapper.findAll('button');
		await buttons.find((b) => b.text() === 'Foto completa')!.trigger('click');
		expect(wrapper.get('[data-testid="zoom-label"]').text()).toBe('100 %');
		wrapper.unmount();
	});

	it('shows a friendly message on 404', async () => {
		getPublicMeetingAlbum.mockRejectedValue({ response: { status: 404 } });
		const wrapper = await mountView();

		expect(wrapper.get('[data-testid="album-error"]').text()).toBe(
			'Este álbum no existe o ya no está disponible.',
		);
		wrapper.unmount();
	});

	it('shows the empty state when there are no tags', async () => {
		getPublicMeetingAlbum.mockResolvedValue({ ...album, tags: [] });
		const wrapper = await mountView();

		expect(wrapper.get('[data-testid="album-empty"]').text()).toBe('Aún no hay nombres en esta foto');
		expect(wrapper.get('[data-testid="album-count"]').text()).toBe('0 integrantes');
		wrapper.unmount();
	});

	it('adds noindex meta while mounted and removes it on unmount', async () => {
		getPublicMeetingAlbum.mockResolvedValue(album);
		const wrapper = await mountView();

		expect(document.head.querySelector('meta[name="robots"][content="noindex"]')).not.toBeNull();
		wrapper.unmount();
		expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
	});

	it('contains no text from the public-content blacklist', async () => {
		getPublicMeetingAlbum.mockResolvedValue(album);
		const wrapper = await mountView();

		const text = wrapper.text();
		expect(text).not.toMatch(/\bpalancas?\b|\bcartas?\b/i);
		expect(text).not.toMatch(/sant[ií]simo|angelitos?\b|misa de clausura/i);
		expect(text).not.toMatch(/beca[s]?\b/i);
		expect(text).not.toMatch(/\$\s?\d|\d+\s?(pesos|mxn|usd)/i);
		wrapper.unmount();
	});

	it('keeps the label inside the frame and hides horizontal overflow at 100 %', async () => {
		getPublicMeetingAlbum.mockResolvedValue({
			...album,
			tags: [{ name: 'Gerardo Peña', box: [113, 909, 239, 959] }],
		});
		const wrapper = await mountView();

		const label = wrapper.get('[data-testid="face-0"] span.whitespace-nowrap');
		expect(label.classes()).toContain('top-full');
		expect(label.classes()).toContain('right-0');
		const frame = wrapper.get('[data-testid="album-frame"]');
		expect(frame.classes()).toContain('overflow-x-hidden');
		await wrapper.get('[data-testid="zoom-in"]').trigger('click');
		expect(frame.classes()).toContain('overflow-x-auto');
		wrapper.unmount();
	});

	it('remembers the dots toggle across remounts', async () => {
		getPublicMeetingAlbum.mockResolvedValue(album);
		const first = await mountView();
		await first.get('[data-testid="toggle-dots"]').trigger('click');
		first.unmount();

		const second = await mountView();
		expect(second.findAll('[data-testid="face-dot"]')).toHaveLength(2);
		second.unmount();
	});
});
