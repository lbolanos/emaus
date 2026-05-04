/**
 * ScheduleTemplateHelpDialog: smoke tests that verify the help dialog opens,
 * closes, and contains the canonical sections explaining template editing.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import ScheduleTemplateHelpDialog from '../ScheduleTemplateHelpDialog.vue';

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

const mount_ = (open: boolean) =>
	mount(ScheduleTemplateHelpDialog, {
		props: { open },
	});

describe('ScheduleTemplateHelpDialog', () => {
	it('renders when open=true', () => {
		const w = mount_(true);
		expect(w.find('.dialog').exists()).toBe(true);
	});

	it('does not render when open=false', () => {
		const w = mount_(false);
		expect(w.find('.dialog').exists()).toBe(false);
	});

	it('emits update:open(false) when close button is clicked', async () => {
		const w = mount_(true);
		await w.find('button').trigger('click');
		expect(w.emitted('update:open')).toBeTruthy();
		expect(w.emitted('update:open')![0]).toEqual([false]);
	});

	it('shows the title for template editor help', () => {
		const w = mount_(true);
		expect(w.text()).toContain('Cómo usar el editor de Templates');
	});

	it('lists all 6 main sections', () => {
		const w = mount_(true);
		const text = w.text();
		expect(text).toContain('¿Qué es un Template?');
		expect(text).toContain('Templates incluidos');
		expect(text).toContain('Editar items del template');
		expect(text).toContain('Editar documentos');
		expect(text).toContain('Workflow recomendado');
		expect(text).toContain('Cuidados');
	});

	it('mentions both default templates by name', () => {
		const w = mount_(true);
		const text = w.text();
		expect(text).toContain('Emaús — México');
		expect(text).toContain('Emaús — Colombia');
	});

	it('mentions document features: edit/print/history/restore', () => {
		const w = mount_(true);
		const text = w.text();
		expect(text).toContain('Subir archivo');
		expect(text).toContain('Crear texto (Markdown)');
		expect(text).toContain('Imprimir');
		expect(text).toContain('Versiones');
		expect(text).toContain('Restaurar');
	});

	it('warns about destructive actions', () => {
		const w = mount_(true);
		const text = w.text();
		// The "Cuidados" section warns about deleting templates and renaming roles.
		expect(text).toContain('Eliminar template');
		expect(text).toContain('Cambiar nombre del rol');
	});
});
