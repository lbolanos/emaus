import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';

// The global @repo/ui mock has no DropdownMenu*: stub them here. The item emits
// `select` on click, like reka-ui's DropdownMenuItem does.
vi.mock('@repo/ui', () => {
	const pass = { template: '<div><slot /></div>' };
	return {
		Button: { inheritAttrs: true, template: '<button v-bind="$attrs"><slot /></button>' },
		Tooltip: pass,
		TooltipTrigger: pass,
		TooltipContent: { template: '<div class="tooltip"><slot /></div>' },
		DropdownMenu: pass,
		DropdownMenuTrigger: pass,
		DropdownMenuContent: { template: '<div class="menu"><slot /></div>' },
		DropdownMenuItem: {
			emits: ['select'],
			template: '<div role="menuitem" @click="$emit(\'select\')"><slot /></div>',
		},
		DropdownMenuSeparator: { template: '<hr />' },
	};
});

vi.mock('lucide-vue-next', () => {
	const stub = (name: string) => ({ name, template: `<svg data-icon="${name}"></svg>` });
	return Object.fromEntries(
		[
			'CheckCircle2',
			'Circle',
			'ClipboardCheck',
			'MessageSquare',
			'MoreVertical',
			'FileText',
			'History',
			'Pencil',
			'UserMinus',
			'Camera',
		].map((n) => [n, stub(n)]),
	);
});

import MemberActions from '../MemberActions.vue';

const mountActions = (props: Partial<{ isOwner: boolean; isContacted: boolean; contactedAt: string }> = {}) =>
	mount(MemberActions, { props: { isOwner: false, isContacted: false, ...props } });

const item = (wrapper: ReturnType<typeof mountActions>, text: string) => {
	const found = wrapper.findAll('[role="menuitem"]').find((i) => i.text().includes(text));
	if (!found) throw new Error(`No menu item "${text}"`);
	return found;
};

describe('MemberActions', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('keeps only Mensajes and the ⋮ menu as buttons in the row', () => {
		const wrapper = mountActions();
		const buttons = wrapper.findAll('button');
		expect(buttons.map((b) => b.attributes('aria-label'))).toEqual(['Mensajes', 'Más acciones']);
	});

	it('opens attendance from the menu after the menu closes (deferOpen)', async () => {
		vi.useFakeTimers();
		const wrapper = mountActions();

		await item(wrapper, 'Registrar asistencia').trigger('click');
		expect(wrapper.emitted('attendance')).toBeUndefined();

		vi.advanceTimersByTime(100);
		expect(wrapper.emitted('attendance')).toHaveLength(1);
	});

	it('toggles the contacted mark right away, without waiting', async () => {
		const wrapper = mountActions();

		await item(wrapper, 'Marcar como contactado').trigger('click');

		expect(wrapper.emitted('toggle-contacted')).toHaveLength(1);
	});

	it('offers to remove the mark when the member is already contacted', () => {
		const wrapper = mountActions({ isContacted: true, contactedAt: new Date().toISOString() });

		expect(item(wrapper, 'Quitar marca de contactado').text()).toContain('Marcado ahora');
		expect(wrapper.text()).not.toContain('Marcar como contactado');
	});

	it('shows Editar and Eliminar only to the owner', () => {
		expect(mountActions().text()).not.toContain('Eliminar miembro');
		const owner = mountActions({ isOwner: true });
		expect(owner.text()).toContain('Editar datos');
		expect(owner.text()).toContain('Eliminar miembro');
	});
});
