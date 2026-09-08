/**
 * Contrato del tipo de reunión en el formulario.
 *
 *   - Una reunión nueva nace como 'general' y se manda tal cual.
 *   - Al editar, el tipo guardado se precarga (si no, guardar sin tocar el
 *     campo lo devolvería a 'general' y borraría la clasificación).
 *   - Un anuncio manda siempre 'general': no pasa lista, así que su tipo no
 *     significaría nada en el reporte, y el selector se oculta.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const createMeeting = vi.fn(async () => ({ id: 'new-meeting' }));
const updateMeeting = vi.fn(async () => ({ id: 'meeting-1' }));

vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		createMeeting,
		updateMeeting,
		setMeetingPhoto: vi.fn(),
		deleteMeetingPhoto: vi.fn(),
		deleteMeeting: vi.fn(),
		fetchCommunity: vi.fn(),
		currentCommunity: null,
	}),
}));

vi.mock('@repo/ui', () => new Proxy(
	{},
	{
		get: (_t, name) => {
			const n = String(name);
			if (n === '__esModule') return false;
			if (n === 'useToast') return () => ({ toast: vi.fn() });
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

import MeetingFormModal from '../MeetingFormModal.vue';

const factory = (props: Record<string, unknown> = {}) =>
	mount(MeetingFormModal, {
		props: { open: true, communityId: 'comm-1', ...props },
		global: { mocks: { $t: (key: string) => key } },
	});

const fillRequiredFields = async (wrapper: any) => {
	wrapper.vm.form.title = 'Preparación semana 1';
	wrapper.vm.form.date = '2026-09-10';
	wrapper.vm.form.time = '20:00';
	await flushPromises();
};

describe('MeetingFormModal — tipo de reunión', () => {
	beforeEach(() => {
		createMeeting.mockClear();
		updateMeeting.mockClear();
	});

	it('una reunión nueva se manda como general', async () => {
		const wrapper = factory();
		await fillRequiredFields(wrapper);

		await wrapper.vm.handleSubmit();

		expect(createMeeting).toHaveBeenCalledWith(
			'comm-1',
			expect.objectContaining({ meetingType: 'general' }),
		);
	});

	it('manda el tipo elegido', async () => {
		const wrapper = factory();
		await fillRequiredFields(wrapper);
		wrapper.vm.form.meetingType = 'preparation';

		await wrapper.vm.handleSubmit();

		expect(createMeeting).toHaveBeenCalledWith(
			'comm-1',
			expect.objectContaining({ meetingType: 'preparation' }),
		);
	});

	it('precarga el tipo guardado al editar', async () => {
		const wrapper = factory();
		// El padre monta el modal y DESPUÉS le pasa la reunión a editar, así que
		// el watch no es `immediate`: montar con la prop puesta no lo dispararía.
		await wrapper.setProps({
			meetingToEdit: {
				id: 'meeting-1',
				communityId: 'comm-1',
				title: 'Preparacion Retiro',
				startDate: new Date('2026-09-03T01:45:00.000Z'),
				durationMinutes: 90,
				isAnnouncement: false,
				meetingType: 'preparation',
				isRecurrenceTemplate: false,
			},
		});
		await flushPromises();

		expect(wrapper.vm.form.meetingType).toBe('preparation');

		await wrapper.vm.handleSubmit();
		expect(updateMeeting).toHaveBeenCalledWith(
			'meeting-1',
			expect.objectContaining({ meetingType: 'preparation' }),
			'this',
		);
	});

	it('un anuncio manda general aunque el formulario traiga otro tipo', async () => {
		const wrapper = factory();
		await fillRequiredFields(wrapper);
		wrapper.vm.form.meetingType = 'preparation';
		wrapper.vm.form.isAnnouncement = true;

		await wrapper.vm.handleSubmit();

		expect(createMeeting).toHaveBeenCalledWith(
			'comm-1',
			expect.objectContaining({ meetingType: 'general', isAnnouncement: true }),
		);
	});
});
