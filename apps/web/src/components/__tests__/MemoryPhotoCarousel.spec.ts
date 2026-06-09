import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MemoryPhotoCarousel from '../social/MemoryPhotoCarousel.vue';

const photo = (id: string, url: string, isPrimary = false, sortOrder = 0) => ({
	id,
	retreatId: 'r1',
	url,
	isPrimary,
	sortOrder,
	createdAt: new Date(),
});

describe('MemoryPhotoCarousel', () => {
	it('muestra la foto principal primero, sin importar el sortOrder', () => {
		const wrapper = mount(MemoryPhotoCarousel, {
			props: {
				photos: [
					photo('a', 'urlA', false, 0),
					photo('b', 'urlB', true, 5), // principal aunque tenga mayor sortOrder
				],
			},
		});
		expect(wrapper.find('img').attributes('src')).toBe('urlB');
		expect(wrapper.text()).toContain('1/2');
		// Dos dots
		expect(wrapper.findAll('[aria-label^="Ir a la foto"]')).toHaveLength(2);
	});

	it('navega con siguiente/anterior y hace wrap', async () => {
		const wrapper = mount(MemoryPhotoCarousel, {
			props: {
				photos: [photo('a', 'urlA', true, 0), photo('b', 'urlB', false, 1)],
			},
		});
		expect(wrapper.find('img').attributes('src')).toBe('urlA');

		await wrapper.find('[aria-label="Foto siguiente"]').trigger('click');
		expect(wrapper.find('img').attributes('src')).toBe('urlB');

		// wrap: siguiente desde la última vuelve a la primera
		await wrapper.find('[aria-label="Foto siguiente"]').trigger('click');
		expect(wrapper.find('img').attributes('src')).toBe('urlA');

		// anterior desde la primera va a la última
		await wrapper.find('[aria-label="Foto anterior"]').trigger('click');
		expect(wrapper.find('img').attributes('src')).toBe('urlB');
	});

	it('usa fallbackUrl cuando no hay fotos en galería y oculta controles', () => {
		const wrapper = mount(MemoryPhotoCarousel, {
			props: { photos: [], fallbackUrl: 'legacy.jpg' },
		});
		expect(wrapper.find('img').attributes('src')).toBe('legacy.jpg');
		expect(wrapper.find('[aria-label="Foto siguiente"]').exists()).toBe(false);
	});

	it('no renderiza nada cuando no hay fotos ni fallback', () => {
		const wrapper = mount(MemoryPhotoCarousel, { props: { photos: [] } });
		expect(wrapper.find('img').exists()).toBe(false);
	});

	it('al hacer clic en la foto abre el lightbox y se puede cerrar', async () => {
		const wrapper = mount(MemoryPhotoCarousel, {
			props: { photos: [photo('a', 'urlA', true, 0)] },
			attachTo: document.body,
		});
		// Sin lightbox al inicio.
		expect(document.body.querySelector('[role="dialog"]')).toBeNull();

		await wrapper.find('img').trigger('click');
		const dialog = document.body.querySelector('[role="dialog"]');
		expect(dialog).not.toBeNull();
		expect(dialog!.querySelector('img')?.getAttribute('src')).toBe('urlA');

		// Cerrar con el botón X.
		await wrapper.find('[aria-label="Cerrar"]').trigger('click');
		expect(document.body.querySelector('[role="dialog"]')).toBeNull();

		wrapper.unmount();
	});
});
