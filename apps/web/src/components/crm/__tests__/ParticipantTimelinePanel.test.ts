import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

const getParticipantNotes = vi.fn();
const getParticipantTimeline = vi.fn();
const createParticipantNote = vi.fn();
const deleteParticipantNote = vi.fn();

vi.mock('@/services/api', () => ({
	getFollowUps: vi.fn(() => Promise.resolve([])),
	upsertFollowUp: vi.fn(),
	getCrmTasks: vi.fn(() => Promise.resolve([])),
	createCrmTask: vi.fn(),
	updateCrmTask: vi.fn(),
	deleteCrmTask: vi.fn(),
	getParticipantNotes: (...a: any[]) => getParticipantNotes(...a),
	getParticipantTimeline: (...a: any[]) => getParticipantTimeline(...a),
	createParticipantNote: (...a: any[]) => createParticipantNote(...a),
	updateParticipantNote: vi.fn(),
	deleteParticipantNote: (...a: any[]) => deleteParticipantNote(...a),
}));

vi.mock('@/stores/authStore', async () => {
	const { defineStore } = await import('pinia');
	const { ref } = await import('vue');
	return {
		useAuthStore: defineStore('auth-mock', () => ({
			user: ref<any>({ id: 'u-me', displayName: 'Yo' }),
		})),
	};
});

import ParticipantTimelinePanel from '../ParticipantTimelinePanel.vue';

const walker = {
	id: 'p1',
	firstName: 'Andrei',
	lastName: 'Ibarra',
	cellPhone: '5551110000',
	emergencyContact1Name: 'Luz Ma Ibarra',
	emergencyContact1Relation: 'Mamá',
	emergencyContact1CellPhone: '5215579797705',
	emergencyContact2Name: 'Julio Cesar',
	emergencyContact2Relation: 'Papá',
	// Sin teléfono a propósito: no debe ofrecer botón de WhatsApp.
	emergencyContact2Email: 'julio@example.com',
};

const timeline = [
	{
		id: 'comm-1',
		type: 'message',
		at: '2026-06-05T14:00:00.000Z',
		title: 'WhatsApp enviado',
		detail: 'Petición de palanca para Andrei',
		contactKey: 'emergencyContact1',
		contactName: 'Luz Ma Ibarra',
		meta: { messageType: 'whatsapp', templateName: 'PALANCA_REQUEST' },
	},
	{
		id: 'comm-2',
		type: 'message',
		at: '2026-06-04T14:00:00.000Z',
		title: 'WhatsApp enviado',
		detail: 'Bienvenido al retiro',
		contactKey: 'participant',
		contactName: 'Andrei Ibarra',
		meta: { messageType: 'whatsapp' },
	},
	{
		id: 'note-n1',
		type: 'note',
		at: '2026-06-06T10:00:00.000Z',
		title: 'Nota',
		detail: 'La mamá está enojada, pide hablar con el coordinador',
		actorName: 'Yo',
		meta: { noteId: 'n1' },
	},
	{
		id: 'note-n2',
		type: 'note',
		at: '2026-06-06T11:00:00.000Z',
		title: 'Nota',
		detail: 'Nota de otra persona',
		actorName: 'Alguien',
		meta: { noteId: 'n2' },
	},
	{
		id: 'palancas-r1',
		type: 'palancas',
		at: null,
		title: 'Cartas recibidas: 4 de 3',
		meta: { count: 4, threshold: 3, milestone: 'met', currentState: true },
	},
];

const notes = [
	{ id: 'n1', kind: 'note', body: 'La mamá está enojada, pide hablar con el coordinador', createdBy: 'u-me' },
	{ id: 'n2', kind: 'note', body: 'Nota de otra persona', createdBy: 'u-otro' },
];

describe('ParticipantTimelinePanel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setActivePinia(createPinia());
		getParticipantNotes.mockResolvedValue(notes);
		getParticipantTimeline.mockResolvedValue(timeline);
		createParticipantNote.mockResolvedValue({});
		deleteParticipantNote.mockResolvedValue(undefined);
	});

	const mountPanel = async () => {
		const w = mount(ParticipantTimelinePanel, {
			props: { open: true, retreatId: 'r1', participant: walker },
		});
		await flushPromises();
		return w;
	};

	it('lista los interlocutores con contacto y omite los que no existen', async () => {
		const w = await mountPanel();
		const text = w.text();
		expect(text).toContain('Andrei Ibarra');
		expect(text).toContain('Luz Ma Ibarra');
		expect(text).toContain('Mamá');
		// Julio Cesar tiene email pero no teléfono: aparece, sin botón de WhatsApp.
		expect(text).toContain('Julio Cesar');
	});

	it('el enlace de WhatsApp del familiar abre el chat, sin texto precargado', async () => {
		const w = await mountPanel();
		const links = w.findAll('a[href^="https://api.whatsapp.com"]');
		const hrefs = links.map((l) => l.attributes('href'));
		expect(hrefs).toContain('https://api.whatsapp.com/send?phone=5215579797705');
		for (const h of hrefs) expect(h).not.toContain('text=');
		// Julio Cesar no tiene teléfono → un enlace menos que interlocutores.
		expect(links).toHaveLength(2);
	});

	it('filtrar por un familiar deja sólo los mensajes de ese familiar', async () => {
		const w = await mountPanel();
		expect(w.text()).toContain('Bienvenido al retiro');

		// El botón del familiar 1 aplica el filtro.
		const buttons = w.findAll('button');
		const mamaButton = buttons.find((b) => b.text().includes('Luz Ma Ibarra'))!;
		await mamaButton.trigger('click');
		await flushPromises();

		expect(w.text()).toContain('Petición de palanca para Andrei');
		expect(w.text()).not.toContain('Bienvenido al retiro');
		// Las notas no tienen interlocutor: se ocultan al filtrar por uno.
		expect(w.text()).not.toContain('La mamá está enojada');
	});

	it('agrega una nota y recarga el hilo', async () => {
		const w = await mountPanel();
		await w.find('textarea').setValue('Habló la mamá, ya está tranquila');
		// El mock global de vue-i18n devuelve la clave, no el texto traducido.
		const addButton = w
			.findAll('button')
			.find((b) => b.text().includes('participantThread.addNote'))!;
		await addButton.trigger('click');
		await flushPromises();

		expect(createParticipantNote).toHaveBeenCalledWith({
			retreatId: 'r1',
			participantId: 'p1',
			body: 'Habló la mamá, ya está tranquila',
		});
	});

	it('sólo ofrece editar y borrar en las notas propias', async () => {
		const w = await mountPanel();
		const editButtons = w
			.findAll('button')
			.filter((b) => b.text().trim() === 'participantThread.edit');
		const deleteButtons = w
			.findAll('button')
			.filter((b) => b.text().trim() === 'participantThread.delete');
		// n1 es mía, n2 es de otra persona.
		expect(editButtons).toHaveLength(1);
		expect(deleteButtons).toHaveLength(1);
	});

	it('los eventos sin fecha se pintan como estado actual, no en la cronología', async () => {
		const w = await mountPanel();
		expect(w.text()).toContain('participantThread.currentState');
		// El título del hito sí viene del backend, no de i18n.
		expect(w.text()).toContain('Cartas recibidas: 4 de 3');
	});

	it('avisa que las respuestas viven en WhatsApp, no en Emaús', async () => {
		const w = await mountPanel();
		expect(w.text()).toContain('participantThread.sentFromEmaus');
	});
});
