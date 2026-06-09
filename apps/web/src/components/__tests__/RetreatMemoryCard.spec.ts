import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RetreatMemoryCard from '../social/RetreatMemoryCard.vue';

const baseRetreat = {
	id: 'r1',
	parish: 'Parroquia San Judas',
	startDate: '2026-04-17',
	endDate: '2026-04-19',
	houseId: 'h1',
	isPublic: false,
};

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

const mountCard = (overrides: Record<string, unknown>) =>
	mount(RetreatMemoryCard, { props: { retreat: { ...baseRetreat, ...overrides } as any } });

describe('RetreatMemoryCard', () => {
	it('muestra la galería (foto principal primero) y la parroquia', () => {
		const wrapper = mountCard({
			memoryPhotos: [photo('a', 'urlA', false, 0), photo('b', 'urlB', true, 1)],
		});
		expect(wrapper.text()).toContain('Parroquia San Judas');
		expect(wrapper.find('img').attributes('src')).toBe('urlB');
	});

	it('lista las canciones, destaca la principal y muestra su título', () => {
		const wrapper = mountCard({
			memorySongs: [
				song('s1', 'https://a.com', true, 0, 'Cantos del viernes'),
				song('s2', 'https://b.com', false, 1),
			],
		});
		const links = wrapper.findAll('a[href^="https://"]');
		expect(links).toHaveLength(2);
		// La principal va primero con su título.
		expect(links[0].attributes('href')).toBe('https://a.com');
		expect(links[0].text()).toContain('Cantos del viernes');
		// La no-principal sin título usa el texto por defecto.
		expect(links[1].text()).toContain('Escuchar música del retiro');
	});

	it('separa la música del MAM en su propia sección', () => {
		const wrapper = mountCard({
			memorySongs: [
				song('s1', 'https://manual.com', true, 0, 'Playlist', 'manual'),
				song('m1', 'https://mam1.com', false, 0, 'Charla: La Rosa', 'mam'),
				song('m2', 'https://mam2.com', false, 1, 'Testimonio 1', 'mam'),
			],
		});
		expect(wrapper.text()).toContain('Música del minuto a minuto');
		expect(wrapper.text()).toContain('Charla: La Rosa');
		expect(wrapper.text()).toContain('Testimonio 1');
		// La manual sigue en su sección con su título.
		expect(wrapper.find('a[href="https://manual.com"]').text()).toContain('Playlist');
		// Hay 3 enlaces de canción en total.
		expect(wrapper.findAll('a[href^="https://"]')).toHaveLength(3);
	});

	it('cae a los campos legacy cuando no hay galería', () => {
		const wrapper = mountCard({
			memoryPhotoUrl: 'legacy.jpg',
			musicPlaylistUrl: 'https://legacy-playlist.com',
		});
		expect(wrapper.find('img').attributes('src')).toBe('legacy.jpg');
		const link = wrapper.find('a[href="https://legacy-playlist.com"]');
		expect(link.exists()).toBe(true);
	});

	it('muestra el estado vacío cuando no hay recuerdos', () => {
		const wrapper = mountCard({});
		expect(wrapper.text()).toContain('No hay recuerdos añadidos aún');
		expect(wrapper.find('img').exists()).toBe(false);
	});
});
