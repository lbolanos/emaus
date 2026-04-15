import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import TablesHelpDialog from '../TablesHelpDialog.vue';

vi.mock('@repo/ui', () => ({
	Button: { template: '<button><slot /></button>' },
	Dialog: {
		template: '<div class="dialog" v-if="open"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div class="dialog-content"><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	DialogFooter: { template: '<div><slot /></div>' },
}));

vi.mock('lucide-vue-next', () => ({
	HelpCircle: { template: '<svg />' },
}));

describe('TablesHelpDialog', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	const mount_ = (open: boolean) =>
		mount(TablesHelpDialog, {
			props: { open },
			global: {
				plugins: [createPinia()],
				mocks: { $t: (key: string) => key },
			},
		});

	it('renders when open=true', () => {
		const w = mount_(true);
		expect(w.find('.dialog').exists()).toBe(true);
	});

	it('does not render when open=false', () => {
		const w = mount_(false);
		expect(w.find('.dialog').exists()).toBe(false);
	});

	it('emits update:open when close button is clicked', async () => {
		const w = mount_(true);
		await w.find('button').trigger('click');
		expect(w.emitted('update:open')).toBeTruthy();
		expect(w.emitted('update:open')![0]).toEqual([false]);
	});

	it('renders santisimo section i18n key', () => {
		const w = mount_(true);
		expect(w.text()).toContain('tables.help.santisimo.title');
	});

	it('renders all 4 santisimo steps', () => {
		const w = mount_(true);
		const text = w.text();
		expect(text).toContain('tables.help.santisimo.step1Title');
		expect(text).toContain('tables.help.santisimo.step2Title');
		expect(text).toContain('tables.help.santisimo.step3Title');
		expect(text).toContain('tables.help.santisimo.step4Title');
	});

	it('renders methods section', () => {
		const w = mount_(true);
		const text = w.text();
		expect(text).toContain('tables.help.methods.dragDrop.title');
		expect(text).toContain('tables.help.methods.tap.title');
		expect(text).toContain('tables.help.methods.photo.title');
		expect(text).toContain('tables.help.methods.chatbot.title');
	});

	it('renders colors section', () => {
		const w = mount_(true);
		expect(w.text()).toContain('tables.help.colors.title');
	});

	it('renders unassign section', () => {
		const w = mount_(true);
		expect(w.text()).toContain('tables.help.unassign.title');
	});
});
