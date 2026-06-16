/**
 * Tests para WhatsAppSendQueue.vue — la cola de envío de WhatsApp ASISTIDA.
 *
 * Cubre:
 *  - Filtra destinatarios sin teléfono válido (no se listan como enviables).
 *  - Al seleccionar una plantilla, el mensaje base se llena.
 *  - Al pulsar "Abrir WhatsApp" en una fila: abre el deep link api.whatsapp.com
 *    con el teléfono sanitizado y el mensaje con variables resueltas, y registra
 *    la comunicación en el historial (participant_communications, whatsapp).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';

const createCommunication = vi.fn().mockResolvedValue({ id: 'c1' });

vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({
		selectedRetreat: { id: 'r1', parish: 'San Juan', cost: '$1000' },
	}),
}));

vi.mock('@/stores/participantCommunicationStore', () => ({
	useParticipantCommunicationStore: () => ({ createCommunication }),
}));

// @repo/ui local: Button debe propagar `disabled` y el click al <button> nativo.
vi.mock('@repo/ui', () => ({
	Button: {
		name: 'Button',
		template: '<button :disabled="disabled"><slot /></button>',
		props: ['variant', 'size', 'disabled'],
	},
	useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('lucide-vue-next', () => ({
	X: { name: 'X', template: '<svg></svg>' },
	MessageSquare: { name: 'MessageSquare', template: '<svg></svg>' },
	Check: { name: 'Check', template: '<svg></svg>' },
	ExternalLink: { name: 'ExternalLink', template: '<svg></svg>' },
}));

import WhatsAppSendQueue from '../WhatsAppSendQueue.vue';

const participants = [
	{ id: '1', firstName: 'Juan', lastName: 'Pérez', cellPhone: '+52 55 1234 5678' },
	{ id: '2', firstName: 'María', lastName: 'García', cellPhone: '5544332211' },
	{ id: '3', firstName: 'Sin', lastName: 'Teléfono', cellPhone: '' },
];

const templates = [
	{ id: 't1', name: 'Bienvenida', type: 'WALKER_WELCOME', message: 'Hola {participant.firstName}' },
];

function mountQueue() {
	return mount(WhatsAppSendQueue, {
		props: { open: true, participants, retreatId: 'r1', templates },
	});
}

const sendButtons = (wrapper: ReturnType<typeof mountQueue>) =>
	wrapper.findAll('button').filter((b) => b.text().includes('whatsappQueue.openWhatsApp'));

describe('WhatsAppSendQueue.vue', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubGlobal('open', vi.fn());
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: vi.fn().mockResolvedValue(undefined) },
			configurable: true,
		});
	});

	it('solo lista destinatarios con teléfono válido (2 de 3)', async () => {
		const wrapper = mountQueue();
		await nextTick();
		expect(wrapper.text()).toContain('whatsappQueue.progress');
		expect(sendButtons(wrapper).length).toBe(2);
	});

	it('al pulsar enviar abre wa.me y registra la comunicación', async () => {
		const wrapper = mountQueue();
		await nextTick();

		// Seleccionar plantilla → llena el mensaje base.
		await wrapper.find('select').setValue('t1');
		await nextTick();

		await sendButtons(wrapper)[0].trigger('click');
		await flushPromises();

		// Abrió el deep link con teléfono sanitizado de Juan (525512345678).
		expect(window.open).toHaveBeenCalledTimes(1);
		const url = (window.open as any).mock.calls[0][0] as string;
		expect(url).toContain('https://api.whatsapp.com/send?phone=525512345678');
		expect(decodeURIComponent(url)).toContain('Hola Juan');

		// Registró la comunicación como whatsapp.
		expect(createCommunication).toHaveBeenCalledTimes(1);
		expect(createCommunication.mock.calls[0][0]).toMatchObject({
			participantId: '1',
			retreatId: 'r1',
			messageType: 'whatsapp',
			templateId: 't1',
			templateName: 'Bienvenida',
		});
	});

	it('no envía si no hay mensaje (botón deshabilitado)', async () => {
		const wrapper = mountQueue();
		await nextTick();
		expect((sendButtons(wrapper)[0].element as HTMLButtonElement).disabled).toBe(true);
	});
});
