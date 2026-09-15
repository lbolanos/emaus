/**
 * Two-phase member creation: the 409 conflict codes drive the modal's state
 * machine (form → confirm-candidates / already-member), and the admin's choice
 * re-sends the SAME payload plus exactly one flag (linkParticipantId or
 * forceNewParticipant) — never both, never a stale form.
 *
 * The @repo/ui mock mirrors the real reka-ui contract (modelValue in,
 * update:modelValue out) like ImportMembersModal.test.ts does.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import CreateMemberModal from '../CreateMemberModal.vue';

const { createMemberMock, toastMock } = vi.hoisted(() => ({
	createMemberMock: vi.fn(),
	toastMock: vi.fn(),
}));

vi.mock('@repo/ui', () => {
	const passthrough = (tag = 'div') => ({ template: `<${tag}><slot /></${tag}>` });
	return {
		Dialog: { props: ['open'], template: '<div><slot /></div>' },
		DialogContent: passthrough(),
		DialogHeader: passthrough(),
		DialogTitle: passthrough('h2'),
		DialogDescription: passthrough('p'),
		DialogFooter: passthrough(),
		Button: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
		Input: {
			props: ['modelValue'],
			emits: ['update:modelValue'],
			template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		},
		Label: passthrough('label'),
		Badge: passthrough('span'),
		useToast: () => ({ toast: toastMock }),
	};
});

vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({ createMember: createMemberMock }),
}));

vi.mock('../BirthdayFields.vue', () => ({
	default: { name: 'BirthdayFields', template: '<div data-testid="birthday-fields" />' },
}));

/** Axios-shaped 409 as the axios interceptor hands it to the component. */
const err409 = (code: string, extra: Record<string, unknown> = {}, message = code) => ({
	response: { status: 409, data: { code, message, ...extra } },
});

const CANDIDATES = [
	{ participantId: 'cand-1', firstName: 'Ana', lastName: 'López', matchedBy: 'email' },
	{ participantId: 'cand-2', firstName: 'Beto', lastName: 'Ruiz', matchedBy: 'phone' },
];

const mountModal = () =>
	mount(CreateMemberModal, { props: { open: true, communityId: 'community-1' } });

const buttonByText = (wrapper: ReturnType<typeof mount>, text: string) =>
	wrapper.findAll('button').find((b) => b.text().includes(text));

const fillForm = async (wrapper: ReturnType<typeof mount>) => {
	await wrapper.find('#firstName').setValue('Juan');
	await wrapper.find('#lastName').setValue('Pérez');
	await wrapper.find('#email').setValue('juan@example.com');
	await wrapper.find('#cellPhone').setValue('555-1111');
};

/** Fills the form and clicks the main submit; leaves promises flushed. */
const submitForm = async (wrapper: ReturnType<typeof mount>) => {
	await fillForm(wrapper);
	await buttonByText(wrapper, 'Crear miembro')!.trigger('click');
	await flushPromises();
};

describe('CreateMemberModal — two-phase flow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('success without flags posts the plain payload and closes', async () => {
		createMemberMock.mockResolvedValue({ id: 'member-1' });
		const wrapper = mountModal();

		await submitForm(wrapper);

		expect(createMemberMock).toHaveBeenCalledTimes(1);
		const [communityId, payload] = createMemberMock.mock.calls[0];
		expect(communityId).toBe('community-1');
		expect(payload).toEqual({
			firstName: 'Juan',
			lastName: 'Pérez',
			email: 'juan@example.com',
			cellPhone: '555-1111',
		});
		expect(payload.linkParticipantId).toBeUndefined();
		expect(payload.forceNewParticipant).toBeUndefined();
		expect(wrapper.emitted('created')).toBeTruthy();
		expect(toastMock).toHaveBeenCalledWith(
			expect.objectContaining({ title: 'Miembro creado' }),
		);
	});

	it('EXISTING_PARTICIPANT_FOUND lists candidates, preselects the first, and "Agregar existente" re-sends with linkParticipantId', async () => {
		createMemberMock
			.mockRejectedValueOnce(err409('EXISTING_PARTICIPANT_FOUND', { candidates: CANDIDATES }))
			.mockResolvedValueOnce({ id: 'member-2', linked: true });
		const wrapper = mountModal();

		await submitForm(wrapper);

		// Both candidates rendered with their match badge; no contact data exists here.
		expect(wrapper.text()).toContain('Ana López');
		expect(wrapper.text()).toContain('Beto Ruiz');
		expect(wrapper.text()).toContain('coincide por correo');
		expect(wrapper.text()).toContain('coincide por teléfono');

		// First candidate preselected (card highlighted, link button enabled).
		expect(wrapper.find('[data-participant-id="cand-1"]').attributes('class')).toContain('border-primary');
		expect(wrapper.find('[data-participant-id="cand-2"]').attributes('class')).not.toContain('border-primary');
		expect(buttonByText(wrapper, 'Agregar existente')!.attributes('disabled')).toBeUndefined();

		await buttonByText(wrapper, 'Agregar existente')!.trigger('click');
		await flushPromises();

		expect(createMemberMock).toHaveBeenCalledTimes(2);
		const [, linkPayload] = createMemberMock.mock.calls[1];
		expect(linkPayload).toEqual({
			firstName: 'Juan',
			lastName: 'Pérez',
			email: 'juan@example.com',
			cellPhone: '555-1111',
			linkParticipantId: 'cand-1',
		});
		expect(linkPayload.forceNewParticipant).toBeUndefined();
		expect(wrapper.emitted('created')).toBeTruthy();
		// Al vincular manda la ficha existente: el toast muestra el nombre del
		// candidato confirmado (Ana López), no lo tecleado en el form (Juan Pérez).
		expect(toastMock).toHaveBeenCalledWith(
			expect.objectContaining({
				title: 'Miembro agregado',
				description: 'Ana López se vinculó a su ficha existente',
			}),
		);
	});

	it('selecting the second candidate links to it instead', async () => {
		createMemberMock
			.mockRejectedValueOnce(err409('EXISTING_PARTICIPANT_FOUND', { candidates: CANDIDATES }))
			.mockResolvedValueOnce({ id: 'member-3', linked: true });
		const wrapper = mountModal();

		await submitForm(wrapper);

		await wrapper.find('[data-participant-id="cand-2"]').trigger('click');
		await buttonByText(wrapper, 'Agregar existente')!.trigger('click');
		await flushPromises();

		expect(createMemberMock.mock.calls[1][1].linkParticipantId).toBe('cand-2');
	});

	it('"Es otra persona" from the candidates step re-sends with forceNewParticipant', async () => {
		createMemberMock
			.mockRejectedValueOnce(err409('EXISTING_PARTICIPANT_FOUND', { candidates: CANDIDATES }))
			.mockResolvedValueOnce({ id: 'member-4' });
		const wrapper = mountModal();

		await submitForm(wrapper);

		await buttonByText(wrapper, 'Es otra persona, crear nueva')!.trigger('click');
		await flushPromises();

		const [, forcePayload] = createMemberMock.mock.calls[1];
		expect(forcePayload.forceNewParticipant).toBe(true);
		expect(forcePayload.linkParticipantId).toBeUndefined();
		expect(wrapper.emitted('created')).toBeTruthy();
	});

	it('ALREADY_MEMBER shows the overlay name and offers forceNew', async () => {
		createMemberMock
			.mockRejectedValueOnce(
				err409('ALREADY_MEMBER', {
					member: { memberId: 'm-9', firstName: 'Anita', lastName: 'de la López' },
				}),
			)
			.mockResolvedValueOnce({ id: 'member-5' });
		const wrapper = mountModal();

		await submitForm(wrapper);

		expect(wrapper.text()).toContain('Ya es miembro de esta comunidad');
		expect(wrapper.text()).toContain('Anita de la López');

		await buttonByText(wrapper, 'Es otra persona, crear nueva')!.trigger('click');
		await flushPromises();

		expect(createMemberMock.mock.calls[1][1].forceNewParticipant).toBe(true);
		expect(wrapper.emitted('created')).toBeTruthy();
	});

	it('LINK_TARGET_MISMATCH toasts and returns to the form', async () => {
		createMemberMock
			.mockRejectedValueOnce(err409('EXISTING_PARTICIPANT_FOUND', { candidates: CANDIDATES }))
			.mockRejectedValueOnce(err409('LINK_TARGET_MISMATCH'));
		const wrapper = mountModal();

		await submitForm(wrapper);
		expect(wrapper.text()).toContain('¿Ya conocemos a esta persona?');

		await buttonByText(wrapper, 'Agregar existente')!.trigger('click');
		await flushPromises();

		expect(toastMock).toHaveBeenCalledWith(
			expect.objectContaining({ title: 'La coincidencia cambió' }),
		);
		// Back to the form step, dialog still open, nothing emitted.
		expect(wrapper.text()).toContain('Crear nuevo miembro');
		expect(wrapper.emitted('created')).toBeFalsy();
	});

	it('PHONE_DUPLICATE after forceNew toasts without crashing or closing', async () => {
		createMemberMock
			.mockRejectedValueOnce(err409('ALREADY_MEMBER', {
				member: { memberId: 'm-9', firstName: 'Ana', lastName: 'López' },
			}))
			.mockRejectedValueOnce(err409('PHONE_DUPLICATE_IN_COMMUNITY', {}, 'Ya existe un miembro con ese teléfono'));
		const wrapper = mountModal();

		await submitForm(wrapper);

		await buttonByText(wrapper, 'Es otra persona, crear nueva')!.trigger('click');
		await flushPromises();

		expect(toastMock).toHaveBeenCalledWith(
			expect.objectContaining({
				variant: 'destructive',
				description: 'Ya existe un miembro con ese teléfono',
			}),
		);
		// Still on the already-member step — not closed, no crash.
		expect(wrapper.text()).toContain('Ya es miembro de esta comunidad');
		expect(wrapper.emitted('created')).toBeFalsy();
		expect(wrapper.emitted('update:open')).toBeFalsy();
	});

	it('disables submit buttons while a request is in flight', async () => {
		// Never settles: isSubmitting stays true (the label turns to "Creando...").
		createMemberMock.mockReturnValue(new Promise(() => {}));
		const wrapper = mountModal();

		await fillForm(wrapper);
		const submit = buttonByText(wrapper, 'Crear miembro')!;
		expect(submit.attributes('disabled')).toBeUndefined();

		await submit.trigger('click');
		await flushPromises();

		expect(submit.attributes('disabled')).toBeDefined();
		expect(wrapper.emitted('created')).toBeFalsy();
	});
});
