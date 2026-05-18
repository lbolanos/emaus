import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import EditCommunityMemberDialog from '../EditCommunityMemberDialog.vue';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@repo/ui', () => ({
	Dialog: {
		template: '<div class="dialog" v-if="open"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	DialogDescription: { template: '<p><slot /></p>' },
	DialogFooter: { template: '<div><slot /></div>' },
	Button: {
		template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
		props: ['variant', 'size', 'disabled', 'type'],
		emits: ['click'],
	},
	Input: {
		template:
			'<input :id="id" :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: ['modelValue', 'id', 'type', 'placeholder', 'autocomplete', 'required'],
		emits: ['update:modelValue'],
	},
	Label: { template: '<label :for="$attrs.for"><slot /></label>' },
	useToast: () => ({ toast: vi.fn() }),
}));

const mockUpdateMemberProfile = vi.fn();

vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		updateMemberProfile: mockUpdateMemberProfile,
	}),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const buildMember = (overrides: any = {}) => ({
	id: 'member-1',
	communityId: 'community-1',
	participantId: 'participant-1',
	state: 'active_member',
	// Overlay (puede estar null o setear)
	firstName: null,
	lastName: null,
	email: null,
	cellPhone: null,
	// Relación participant
	participant: {
		id: 'participant-1',
		firstName: 'Joseph',
		lastName: 'Perez',
		email: 'joseph@example.com',
		cellPhone: '5550000000',
	},
	...overrides,
});

const mountDialog = (props: any = {}) =>
	mount(EditCommunityMemberDialog, {
		props: {
			open: true,
			communityId: 'community-1',
			member: buildMember(),
			...props,
		},
		global: {
			plugins: [createPinia()],
		},
	});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('EditCommunityMemberDialog', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		mockUpdateMemberProfile.mockReset();
	});

	it('carga el form con el perfil efectivo: participant cuando overlay es null', async () => {
		const wrapper = mountDialog({
			member: buildMember({
				firstName: null,
				lastName: null,
				participant: {
					id: 'p1',
					firstName: 'Joseph',
					lastName: 'Perez',
					email: 'joseph@example.com',
					cellPhone: '5550000000',
				},
			}),
		});
		await nextTick();

		const inputs = wrapper.findAll('input');
		expect((inputs[0].element as HTMLInputElement).value).toBe('Joseph');
		expect((inputs[1].element as HTMLInputElement).value).toBe('Perez');
		expect((inputs[2].element as HTMLInputElement).value).toBe('joseph@example.com');
		expect((inputs[3].element as HTMLInputElement).value).toBe('5550000000');
	});

	it('carga el form con el overlay cuando existe (gana sobre participant)', async () => {
		const wrapper = mountDialog({
			member: buildMember({
				firstName: 'JuanOverlay',
				lastName: 'PerezOverlay',
				email: 'overlay@example.com',
				cellPhone: '5551111111',
				participant: {
					id: 'p1',
					firstName: 'JosephReal',
					lastName: 'PerezReal',
					email: 'joseph@example.com',
					cellPhone: '5550000000',
				},
			}),
		});
		await nextTick();

		const inputs = wrapper.findAll('input');
		expect((inputs[0].element as HTMLInputElement).value).toBe('JuanOverlay');
		expect((inputs[1].element as HTMLInputElement).value).toBe('PerezOverlay');
		expect((inputs[2].element as HTMLInputElement).value).toBe('overlay@example.com');
		expect((inputs[3].element as HTMLInputElement).value).toBe('5551111111');
	});

	it('submit manda SOLO los campos que cambiaron (diff partial update)', async () => {
		mockUpdateMemberProfile.mockResolvedValue(buildMember({ lastName: 'NewLastName' }));
		const wrapper = mountDialog({ member: buildMember() });
		await nextTick();

		// Cambiar solo lastName
		const inputs = wrapper.findAll('input');
		await inputs[1].setValue('NewLastName');

		// Submit via form (el botón es type=submit pero el mock no propaga)
		await wrapper.find('form').trigger('submit.prevent');
		await flushPromises();

		expect(mockUpdateMemberProfile).toHaveBeenCalledWith('community-1', 'member-1', {
			lastName: 'NewLastName',
		});
	});

	it('submit no-op cierra el diálogo sin llamar API', async () => {
		const wrapper = mountDialog({ member: buildMember() });
		await nextTick();

		// Sin cambios
		await wrapper.find('form').trigger('submit.prevent');
		await flushPromises();

		expect(mockUpdateMemberProfile).not.toHaveBeenCalled();
		// Emit de cierre
		expect(wrapper.emitted('update:open')?.[0]).toEqual([false]);
	});

	it('rechaza firstName vacío con error inline', async () => {
		const wrapper = mountDialog({ member: buildMember() });
		await nextTick();

		const inputs = wrapper.findAll('input');
		await inputs[0].setValue('   '); // whitespace only

		await wrapper.find('form').trigger('submit.prevent');
		await flushPromises();

		expect(mockUpdateMemberProfile).not.toHaveBeenCalled();
		expect(wrapper.text()).toContain('El nombre no puede quedar vacío');
	});

	it('mapea EMAIL_DUPLICATE_IN_COMMUNITY a mensaje específico', async () => {
		mockUpdateMemberProfile.mockRejectedValue({
			response: { data: { code: 'EMAIL_DUPLICATE_IN_COMMUNITY' } },
		});
		const wrapper = mountDialog({ member: buildMember() });
		await nextTick();

		const inputs = wrapper.findAll('input');
		await inputs[2].setValue('duplicate@example.com');

		await wrapper.find('form').trigger('submit.prevent');
		await flushPromises();

		expect(wrapper.text()).toContain('Ya existe otro miembro de esta comunidad con ese correo');
	});

	it('detecta y avisa cuando el email es placeholder generado por el bot', async () => {
		const wrapper = mountDialog({
			member: buildMember({
				email: 'phone-5551234567@placeholder.local',
				participant: {
					id: 'p1',
					firstName: 'Bot',
					lastName: 'Member',
					email: 'phone-5551234567@placeholder.local',
					cellPhone: '5551234567',
				},
			}),
		});
		await nextTick();

		expect(wrapper.text()).toContain('Correo placeholder generado');
	});
});
