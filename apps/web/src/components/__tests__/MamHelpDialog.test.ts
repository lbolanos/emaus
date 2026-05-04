/**
 * MamHelpDialog: smoke tests covering open/close emits and presence of the
 * 8 main sections that explain the MaM features. The content itself isn't
 * i18n'd (Spanish only), so we assert on literal keywords from each section.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MamHelpDialog from '../MamHelpDialog.vue';

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
	mount(MamHelpDialog, {
		props: { open },
	});

describe('MamHelpDialog', () => {
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

	it('shows the title "Cómo usar el Minuto a Minuto"', () => {
		const w = mount_(true);
		expect(w.text()).toContain('Cómo usar el Minuto a Minuto');
	});

	it('contains the 8 key sections of MaM functionality', () => {
		const w = mount_(true);
		const text = w.text();
		// Each section header is unique and required for the help to be useful.
		expect(text).toContain('¿Qué es el Minuto a Minuto?');
		expect(text).toContain('Durante el retiro');
		expect(text).toContain('Reordenar items');
		expect(text).toContain('Más acciones');
		expect(text).toContain('Pantalla pública');
		expect(text).toContain('Documentos por responsabilidad');
		expect(text).toContain('Atajos');
		expect(text).toContain('Tips operativos');
	});

	it('lists the per-row controls (▶ ✓ −5/+5 📎)', () => {
		const w = mount_(true);
		const text = w.text();
		expect(text).toContain('Iniciar');
		expect(text).toContain('Completar');
		expect(text).toContain('Ajustar ±5 min');
		expect(text).toContain('Documentos');
	});

	it('mentions all "⋮ Más acciones" menu items', () => {
		const w = mount_(true);
		const text = w.text();
		expect(text).toContain('Tocar campana');
		expect(text).toContain('Imprimir');
		expect(text).toContain('Descargar guiones');
		expect(text).toContain('Copiar link de pantalla pública');
		expect(text).toContain('Mover día');
		expect(text).toContain('Re-vincular responsabilidades');
		expect(text).toContain('Auto-asignar angelitos');
		expect(text).toContain('Importar desde template');
	});

	it('explains keyboard shortcuts', () => {
		const w = mount_(true);
		const text = w.text();
		expect(text).toContain('Ctrl/Cmd+P');
		expect(text).toContain('ESC');
	});
});
