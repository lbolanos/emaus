import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import MemberAvatar from '../MemberAvatar.vue';

/**
 * El avatar tiene que aguantar los tres casos reales: hay foto, no hay foto, y
 * había foto pero la URL firmada de S3 caducó mientras la pestaña estaba
 * abierta. En los dos últimos debe verse algo, no un hueco roto.
 */
describe('MemberAvatar', () => {
	it('muestra la foto cuando hay URL', () => {
		const wrapper = mount(MemberAvatar, {
			props: { photoUrl: 'https://example.com/foto.webp', fullName: 'Juan Pérez' },
		});
		const img = wrapper.find('img');
		expect(img.exists()).toBe(true);
		expect(img.attributes('src')).toBe('https://example.com/foto.webp');
		expect(img.attributes('alt')).toBe('Foto de Juan Pérez');
	});

	it('cae a las iniciales cuando no hay foto', () => {
		const wrapper = mount(MemberAvatar, {
			props: { photoUrl: null, fullName: 'Juan Pérez' },
		});
		expect(wrapper.find('img').exists()).toBe(false);
		expect(wrapper.text()).toBe('JP');
	});

	it('cae a las iniciales si la imagen falla al cargar (URL firmada caducada)', async () => {
		const wrapper = mount(MemberAvatar, {
			props: { photoUrl: 'https://example.com/caducada.webp', fullName: 'Ana López' },
		});
		await wrapper.find('img').trigger('error');

		expect(wrapper.find('img').exists()).toBe(false);
		expect(wrapper.text()).toBe('AL');
	});

	it('vuelve a intentar cuando cambia la URL', async () => {
		const wrapper = mount(MemberAvatar, {
			props: { photoUrl: 'https://example.com/rota.webp', fullName: 'Ana López' },
		});
		await wrapper.find('img').trigger('error');
		expect(wrapper.find('img').exists()).toBe(false);

		await wrapper.setProps({ photoUrl: 'https://example.com/nueva.webp' });
		expect(wrapper.find('img').exists()).toBe(true);
	});

	it('usa una sola inicial cuando solo hay nombre', () => {
		const wrapper = mount(MemberAvatar, { props: { fullName: 'Madonna' } });
		expect(wrapper.text()).toBe('M');
	});

	it('no revienta sin nombre', () => {
		const wrapper = mount(MemberAvatar, { props: { fullName: '' } });
		expect(wrapper.text()).toBe('?');
	});
});
