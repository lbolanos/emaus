/**
 * PreparationsHelpDialog: smoke tests. El contenido no está i18n'd (español),
 * así que se asertan palabras literales de cada sección. Clave conceptual:
 * las Preparaciones son reuniones del EQUIPO DE SERVIDORES (no de los caminantes).
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PreparationsHelpDialog from '../PreparationsHelpDialog.vue';

vi.mock('@repo/ui', () => ({
	Dialog: {
		template: '<div class="dialog" v-if="open"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div class="dialog-content"><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
}));

vi.mock('lucide-vue-next', () => ({
	HelpCircle: { template: '<svg />' },
}));

const mount_ = (open: boolean) => mount(PreparationsHelpDialog, { props: { open } });

describe('PreparationsHelpDialog', () => {
	it('renders when open=true', () => {
		expect(mount_(true).find('.dialog').exists()).toBe(true);
	});

	it('does not render when open=false', () => {
		expect(mount_(false).find('.dialog').exists()).toBe(false);
	});

	it('shows the title "Cómo usar las Preparaciones"', () => {
		expect(mount_(true).text()).toContain('Cómo usar las Preparaciones');
	});

	it('explains the feature is for the SERVANT team, not the walkers', () => {
		const text = mount_(true).text();
		expect(text).toContain('equipo de servidores');
		expect(text).toContain('No son para los caminantes');
	});

	it('mentions the specific talk objectives', () => {
		const text = mount_(true).text();
		expect(text).toContain('Servicio');
		expect(text).toContain('Sanación y Perdón');
		expect(text).toContain('El Amor del Padre');
	});

	it('covers the key sections of the feature', () => {
		const text = mount_(true).text();
		expect(text).toContain('¿Qué son las Preparaciones?');
		expect(text).toContain('El calendario');
		expect(text).toContain('Documentos de cada charla');
		expect(text).toContain('Saltar una fecha por festivo');
		expect(text).toContain('Enlace público para el equipo');
	});

	it('explains the holiday skip moves earlier meetings back, not the retreat', () => {
		const text = mount_(true).text();
		expect(text).toContain('las reuniones anteriores se adelantan');
		expect(text).toContain('La fecha del retiro nunca se mueve');
	});
});
