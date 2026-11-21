import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import AddressAutocomplete from '../AddressAutocomplete.vue';
import type { PhotonAddress, PhotonSuggestion } from '@/services/photon';

vi.mock('@/services/photon', () => ({
	searchPhoton: vi.fn(),
}));

import { searchPhoton } from '@/services/photon';

const makeAddress = (address1: string): PhotonAddress => ({
	address1,
	city: 'Ciudad de México',
	state: 'Ciudad de México',
	zipCode: '06700',
	country: 'México',
	latitude: 19.42,
	longitude: -99.16,
	googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=19.42,-99.16',
});

const makeSuggestion = (address1: string): PhotonSuggestion => ({
	primary: address1,
	secondary: 'Ciudad de México, México',
	address: makeAddress(address1),
});

describe('AddressAutocomplete', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(searchPhoton).mockReset();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const mountComponent = () => mount(AddressAutocomplete, {
		props: { modelValue: '' },
		attachTo: document.body,
	});

	it('busca tras el debounce y muestra las sugerencias', async () => {
		vi.mocked(searchPhoton).mockResolvedValue([makeSuggestion('Calle Jalapa 75')]);
		const wrapper = mountComponent();

		await wrapper.find('input').setValue('Jalapa 75');
		expect(searchPhoton).not.toHaveBeenCalled();

		vi.advanceTimersByTime(300);
		await flushPromises();

		expect(searchPhoton).toHaveBeenCalledWith('Jalapa 75', expect.objectContaining({ limit: 6 }));
		const options = wrapper.findAll('[role="option"]');
		expect(options).toHaveLength(1);
		expect(options[0].text()).toContain('Calle Jalapa 75');
		wrapper.unmount();
	});

	it('no busca con menos de 3 caracteres', async () => {
		const wrapper = mountComponent();
		await wrapper.find('input').setValue('av');
		vi.advanceTimersByTime(300);
		await flushPromises();
		expect(searchPhoton).not.toHaveBeenCalled();
		wrapper.unmount();
	});

	it('al seleccionar emite select con la dirección completa y actualiza el texto', async () => {
		const suggestion = makeSuggestion('Calle Jalapa 75');
		vi.mocked(searchPhoton).mockResolvedValue([suggestion]);
		const wrapper = mountComponent();

		await wrapper.find('input').setValue('Jalapa 75');
		vi.advanceTimersByTime(300);
		await flushPromises();

		await wrapper.findAll('[role="option"]')[0].trigger('mousedown');

		const selectEvent = wrapper.emitted('select');
		expect(selectEvent).toHaveLength(1);
		expect(selectEvent![0][0]).toEqual(suggestion.address);

		const updateEvents = wrapper.emitted('update:modelValue');
		const lastUpdate = updateEvents![updateEvents!.length - 1];
		expect(lastUpdate[0]).toBe('Calle Jalapa 75');

		// La lista se cierra tras seleccionar
		expect(wrapper.findAll('[role="option"]')).toHaveLength(0);
		wrapper.unmount();
	});

	it('Enter selecciona la sugerencia activa', async () => {
		const suggestion = makeSuggestion('Av. Principal 123');
		vi.mocked(searchPhoton).mockResolvedValue([suggestion]);
		const wrapper = mountComponent();

		await wrapper.find('input').setValue('Av. Principal');
		vi.advanceTimersByTime(300);
		await flushPromises();

		await wrapper.find('input').trigger('keydown', { key: 'Enter' });
		expect(wrapper.emitted('select')![0][0]).toEqual(suggestion.address);
		wrapper.unmount();
	});

	it('Escape cierra la lista sin seleccionar', async () => {
		vi.mocked(searchPhoton).mockResolvedValue([makeSuggestion('Calle Jalapa 75')]);
		const wrapper = mountComponent();

		await wrapper.find('input').setValue('Jalapa 75');
		vi.advanceTimersByTime(300);
		await flushPromises();
		expect(wrapper.findAll('[role="option"]')).toHaveLength(1);

		await wrapper.find('input').trigger('keydown', { key: 'Escape' });
		expect(wrapper.findAll('[role="option"]')).toHaveLength(0);
		expect(wrapper.emitted('select')).toBeUndefined();
		wrapper.unmount();
	});
});
