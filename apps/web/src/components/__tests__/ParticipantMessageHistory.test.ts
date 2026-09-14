/**
 * Tests para ParticipantMessageHistory.vue — el sidebar "Historial de Mensajes"
 * del MessageDialog.
 *
 * Cubre el botón de WhatsApp del header:
 *  - Con teléfono del participante renderiza un anchor que abre el chat real
 *    (deep link SIN `text`, con la lada resuelta por el país).
 *  - Sin teléfono (o sin dígitos) no renderiza el anchor: nunca un link que dé
 *    "número inválido".
 */
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';

vi.mock('@/stores/participantCommunicationStore', () => {
	// storeToRefs sólo recoge propiedades que ya son ref: los seis campos de
	// estado van como ref; las funciones se destructuran directo del store.
	const state = () => ({
		communications: ref([]),
		loading: ref(false),
		error: ref(null),
		total: ref(0),
		limit: ref(20),
		offset: ref(0),
	});
	return {
		useParticipantCommunicationStore: () => ({
			...state(),
			fetchParticipantCommunications: vi.fn().mockResolvedValue(undefined),
			formatDate: (d: string) => String(d),
			formatMessageContent: (c: string) => c,
			getMessageTypeLabel: () => 'WhatsApp',
			getMessageTypeIcon: () => '📱',
			getMessageTypeColor: () => '',
			clearCommunications: vi.fn(),
		}),
	};
});

import ParticipantMessageHistory from '../ParticipantMessageHistory.vue';

function mountHistory(props: Record<string, unknown> = {}) {
	return mount(ParticipantMessageHistory, {
		props: {
			participantId: 'p1',
			retreatId: 'r1',
			...props,
		},
	});
}

function whatsappAnchor(wrapper: ReturnType<typeof mountHistory>) {
	return wrapper.findAll('a').find((a) => a.attributes('href')?.includes('api.whatsapp.com'));
}

describe('ParticipantMessageHistory — botón de WhatsApp', () => {
	it('renderiza el anchor con la lada resuelta y sin text precargado', () => {
		const wrapper = mountHistory({ phone: '5549442834', country: 'México' });
		const anchor = whatsappAnchor(wrapper);
		expect(anchor).toBeDefined();
		expect(anchor!.attributes('href')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834',
		);
		expect(anchor!.attributes('href')).not.toContain('text=');
		expect(anchor!.attributes('target')).toBe('_blank');
		expect(anchor!.attributes('rel')).toBe('noopener noreferrer');
	});

	it('abre en pestaña nueva con rel seguro', () => {
		const wrapper = mountHistory({ phone: '+52 55 4944 2834', country: 'MX' });
		const anchor = whatsappAnchor(wrapper)!;
		expect(anchor.attributes('target')).toBe('_blank');
		expect(anchor.attributes('rel')).toBe('noopener noreferrer');
	});

	it('sin teléfono no renderiza el anchor', () => {
		const wrapper = mountHistory({ phone: null, country: 'MX' });
		expect(whatsappAnchor(wrapper)).toBeUndefined();
	});

	it('teléfono sin dígitos tampoco renderiza el anchor', () => {
		const wrapper = mountHistory({ phone: 'sin número', country: 'MX' });
		expect(whatsappAnchor(wrapper)).toBeUndefined();
	});

	it('sin país asume México', () => {
		const wrapper = mountHistory({ phone: '5549442834' });
		expect(whatsappAnchor(wrapper)!.attributes('href')).toBe(
			'https://api.whatsapp.com/send?phone=525549442834',
		);
	});
});
