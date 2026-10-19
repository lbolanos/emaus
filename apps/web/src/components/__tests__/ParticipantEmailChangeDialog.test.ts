/**
 * Tests for ParticipantEmailChangeDialog.vue (D7 of
 * specs/participant-email-change).
 *
 * Covers:
 *  - Success: normalized email + contextRetreatId reach the API, the result
 *    panel renders and `saved` is emitted with the canonical result.
 *  - 409: the server's pedagogical message (who owns the address) is shown
 *    inline and `saved` is NOT emitted.
 *  - Type-to-confirm guards: submit stays disabled on mismatch, invalid
 *    address and same-as-current (the original typo must not repeat).
 *
 * @repo/ui is mocked locally so Input binds `disabled` and Button exposes it
 * (the global mock accepts any prop without rendering it).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// Hoisted: the vi.mock factory below runs before this file's body, so the
// mock fn cannot be a plain top-level const (TDZ).
const { mockChangeEmail } = vi.hoisted(() => ({
	mockChangeEmail: vi.fn(),
}));

vi.mock('@/services/api', () => ({
	changeParticipantEmail: mockChangeEmail,
}));

vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (key: string) => key,
		locale: { value: 'es' },
	}),
}));

vi.mock('@repo/ui', () => ({
	Dialog: { name: 'Dialog', template: '<div><slot /></div>', props: ['open'] },
	DialogContent: { name: 'DialogContent', template: '<div><slot /></div>' },
	DialogDescription: { name: 'DialogDescription', template: '<p><slot /></p>' },
	DialogFooter: { name: 'DialogFooter', template: '<div><slot /></div>' },
	DialogHeader: { name: 'DialogHeader', template: '<div><slot /></div>' },
	DialogTitle: { name: 'DialogTitle', template: '<h2><slot /></h2>' },
	Input: {
		name: 'Input',
		template:
			'<input :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		props: ['modelValue', 'type', 'id', 'disabled', 'class', 'autocomplete'],
		emits: ['update:modelValue'],
	},
	Label: { name: 'Label', template: '<label><slot /></label>', props: ['for', 'class'] },
	Button: {
		name: 'Button',
		template:
			'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
		props: ['variant', 'size', 'disabled'],
		emits: ['click'],
	},
}));

import ParticipantEmailChangeDialog from '../ParticipantEmailChangeDialog.vue';

const PARTICIPANT = {
	id: 'p-1',
	firstName: 'Ana',
	lastName: 'García',
	email: 'viejo@mail.test',
	retreatId: 'retreat-1',
};

const OK_RESULT = {
	participant: { id: 'p-1', email: 'nuevo@mail.test' },
	changed: true,
	effects: {
		userLinked: true,
		userWithOldEmail: false,
		overlaysCleared: 1,
		queueRegenerated: [{ retreatId: 'r-1', regenerated: 2, skipped: 1 }],
		spouseShareRetreats: [],
	},
};

function mountDialog() {
	return mount(ParticipantEmailChangeDialog, {
		props: { open: true, participant: PARTICIPANT },
	});
}

/** Fills the two inputs (order = template order: new, confirm). */
async function fillEmails(wrapper: ReturnType<typeof mountDialog>, newEmail: string, confirm: string) {
	const inputs = wrapper.findAll('input');
	await inputs[0].setValue(newEmail);
	await inputs[1].setValue(confirm);
}

function submitButton(wrapper: ReturnType<typeof mountDialog>) {
	const buttons = wrapper.findAll('button');
	return buttons[buttons.length - 1];
}

describe('ParticipantEmailChangeDialog', () => {
	beforeEach(() => {
		mockChangeEmail.mockReset();
	});

	it('submits the normalized email with the retreat context and shows the effects', async () => {
		mockChangeEmail.mockResolvedValue(OK_RESULT);
		const wrapper = mountDialog();
		await fillEmails(wrapper, '  nuevo@mail.test ', 'nuevo@mail.test');

		await submitButton(wrapper).trigger('click');
		await flushPromises();

		expect(mockChangeEmail).toHaveBeenCalledTimes(1);
		expect(mockChangeEmail).toHaveBeenCalledWith('p-1', 'nuevo@mail.test', 'retreat-1');

		// Result panel + the effects the server reported.
		expect(wrapper.text()).toContain('participants.emailChange.successTitle');
		expect(wrapper.text()).toContain('nuevo@mail.test');
		expect(wrapper.text()).toContain('participants.emailChange.effectUserLinked');
		expect(wrapper.text()).toContain('participants.emailChange.effectOverlaysCleared');
		expect(wrapper.text()).toContain('participants.emailChange.effectQueueRegenerated');

		expect(wrapper.emitted('saved')).toEqual([[OK_RESULT]]);
		wrapper.unmount();
	});

	it('shows the 409 owner message inline and does not emit saved', async () => {
		const message =
			'el correo ya es de María López, inscrito en este retiro. No se tocó la otra ficha.';
		mockChangeEmail.mockRejectedValue({
			response: { status: 409, data: { message, code: 'EMAIL_OWNED_BY_OTHER' } },
		});
		const wrapper = mountDialog();
		await fillEmails(wrapper, 'ajeno@mail.test', 'ajeno@mail.test');

		await submitButton(wrapper).trigger('click');
		await flushPromises();

		expect(wrapper.text()).toContain('el correo ya es de María López');
		expect(wrapper.emitted('saved')).toBeUndefined();
		// Still on the form state: the correction can be retried.
		expect(wrapper.text()).toContain('participants.emailChange.confirmEmail');
		wrapper.unmount();
	});

	it('keeps submit disabled on mismatch, invalid address and same-as-current', async () => {
		mockChangeEmail.mockResolvedValue(OK_RESULT);
		const wrapper = mountDialog();

		// Mismatch between the two fields.
		await fillEmails(wrapper, 'nuevo@mail.test', 'otro@mail.test');
		expect(submitButton(wrapper).attributes('disabled')).toBeDefined();

		// Invalid address.
		await fillEmails(wrapper, 'no-es-correo', 'no-es-correo');
		expect(submitButton(wrapper).attributes('disabled')).toBeDefined();

		// Same address the ficha already has (case-insensitive).
		await fillEmails(wrapper, 'VIEJO@mail.test', 'viejo@mail.test');
		expect(submitButton(wrapper).attributes('disabled')).toBeDefined();

		// A real correction enables it.
		await fillEmails(wrapper, 'nuevo@mail.test', 'nuevo@mail.test');
		expect(submitButton(wrapper).attributes('disabled')).toBeUndefined();

		expect(mockChangeEmail).not.toHaveBeenCalled();
		wrapper.unmount();
	});

	it('renders the no-op outcome when the server reports no change', async () => {
		mockChangeEmail.mockResolvedValue({
			...OK_RESULT,
			changed: false,
			effects: {
				userLinked: false,
				userWithOldEmail: false,
				overlaysCleared: 0,
				queueRegenerated: [],
				spouseShareRetreats: [],
			},
		});
		const wrapper = mountDialog();
		await fillEmails(wrapper, 'nuevo@mail.test', 'nuevo@mail.test');

		await submitButton(wrapper).trigger('click');
		await flushPromises();

		expect(wrapper.text()).toContain('participants.emailChange.successNoop');
		expect(wrapper.emitted('saved')).toHaveLength(1);
		wrapper.unmount();
	});
});
