import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import RetreatBirthdaysDialog from '../RetreatBirthdaysDialog.vue';
import { getBirthdaysDuringRetreat } from '@/utils/retreatBirthdays';

// El mock global de @repo/ui renderiza el Dialog aunque esté cerrado; aquí
// interesa distinguir abierto de cerrado, así que se declara uno local.
vi.mock('@repo/ui', () => ({
	Dialog: {
		template: '<div class="dialog" v-if="open"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	DialogDescription: { template: '<p class="description"><slot /></p>' },
	DialogFooter: { template: '<div><slot /></div>' },
	Button: {
		template: '<button @click="$emit(\'click\', $event)"><slot /></button>',
		props: ['variant', 'type'],
		emits: ['click'],
	},
}));

const RETREAT_START = '2026-05-14';
const RETREAT_END = '2026-05-17';

const walkers = [
	{ id: '1', firstName: 'Ana', lastName: 'Ruiz', nickname: 'Anita', birthDate: '1990-05-15' },
	{ id: '2', firstName: 'Beto', lastName: 'Sosa', nickname: 'N/A', birthDate: '1985-05-17' },
	{ id: '3', firstName: 'Carla', lastName: 'Lara', nickname: null, birthDate: '1992-08-20' },
];

function mountDialog(open = true, birthdays = getBirthdaysDuringRetreat(walkers, RETREAT_START, RETREAT_END)) {
	return mount(RetreatBirthdaysDialog, { props: { open, birthdays } });
}

describe('RetreatBirthdaysDialog', () => {
	it('no renderiza nada mientras está cerrado', () => {
		expect(mountDialog(false).find('.dialog').exists()).toBe(false);
	});

	it('lista solo a quienes cumplen durante el retiro, en orden de fecha', () => {
		const items = mountDialog().findAll('li');
		expect(items).toHaveLength(2);
		expect(items[0].text()).toContain('Ana Ruiz');
		expect(items[1].text()).toContain('Beto Sosa');
		expect(mountDialog().text()).not.toContain('Carla');
	});

	it('muestra el apodo cuando es significativo y lo omite cuando no', () => {
		const items = mountDialog().findAll('li');
		expect(items[0].text()).toContain('(Anita)');
		expect(items[1].text()).not.toContain('(N/A)');
	});

	it('muestra el día del retiro en que cae cada cumpleaños', () => {
		const items = mountDialog().findAll('li');
		expect(items[0].text()).toContain('15');
		expect(items[0].text()).toContain('mayo');
		expect(items[1].text()).toContain('17');
	});

	it('avisa cuando nadie cumple años en esas fechas', () => {
		const wrapper = mountDialog(true, []);
		expect(wrapper.findAll('li')).toHaveLength(0);
		expect(wrapper.find('.description').text()).toBe('participants.birthdays.empty');
	});

	it('cierra al pulsar el botón', async () => {
		const wrapper = mountDialog();
		await wrapper.find('button').trigger('click');
		expect(wrapper.emitted('update:open')).toEqual([[false]]);
	});
});
