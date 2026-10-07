/**
 * Tests de la pestaña "Programados" y la visibilidad del tiempo (M3):
 *  - A2: la tabla renderiza los mensajes materializados con su fecha en la TZ
 *    del retiro (la zona la resuelve el servidor; el cliente nunca la infiere).
 *  - A3: la bandeja WhatsApp pinta el scheduledFor del ítem.
 *  - A4: el editor muestra la fecha que tendría cada paso (schedule-preview).
 *  - A5: el badge "N programados" de una secuencia abre la pestaña filtrada,
 *    con chip de secuencia removible.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, flushPromises, VueWrapper, enableAutoUnmount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// Los tests de a11y (#5) siguen el foco real (document.activeElement): la
// vista se monta atacheada al body y se desmonta tras cada test.
enableAutoUnmount(afterEach);

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: {} }),
	useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@repo/ui', () => new Proxy(
	{},
	{
		get: (_t, name) => {
			const n = String(name);
			if (n === '__esModule') return false;
			if (n === 'useToast') return () => ({ toast: vi.fn() });
			if (n === 'toast') return vi.fn();
			if (n.startsWith('use')) return () => ({});
			// Button como <button> real: los tests de M4 clickean por texto.
			if (n === 'Button') return { name: n, template: '<button><slot /></button>' };
			return { name: n, template: '<div><slot /></div>' };
		},
		has: () => true,
	},
));

vi.mock('lucide-vue-next', () => new Proxy(
	{},
	{
		get: (_t, name) => (name === '__esModule' ? false : { name: String(name), template: '<svg />' }),
		has: () => true,
	},
));

// Este test afirma sobre textos reales del locale es ('Pendiente',
// 'Programados'…); el setup global mockea vue-i18n con t = clave, así que se
// restaura el módulo real para este archivo.
vi.mock('vue-i18n', async (importOriginal) => await importOriginal());

// Mock de la API con objeto plano enumerando los named exports que usan la
// vista y sus stores (un Proxy como factory no sobrevive la síntesis de
// namespace de vite-node: las props no propias del target nunca llegan).
vi.mock('@/services/api', () => ({
	api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
	// messageSequenceStore
	getRetreatSequences: vi.fn(),
	createMessageSequence: vi.fn(),
	updateMessageSequence: vi.fn(),
	deleteMessageSequence: vi.fn(),
	getSequenceQueue: vi.fn(),
	getSequenceStats: vi.fn(),
	getScheduledMessageDetail: vi.fn(),
	runSequences: vi.fn(),
	regenerateSequenceQueue: vi.fn(),
	bulkResolveSequenceIssues: vi.fn(),
	dispatchScheduledMessage: vi.fn(),
	skipScheduledMessage: vi.fn(),
	retryScheduledMessage: vi.fn(),
	discardScheduledMessage: vi.fn(),
	openScheduledMessage: vi.fn(),
	assignScheduledMessage: vi.fn(),
	setParticipantDoNotContact: vi.fn(),
	fetchScheduledMessages: vi.fn(),
	rescheduleSequenceStep: vi.fn(),
	// globalMessageSequenceStore
	getGlobalSequences: vi.fn(),
	createGlobalSequence: vi.fn(),
	updateGlobalSequence: vi.fn(),
	deleteGlobalSequence: vi.fn(),
	toggleGlobalSequenceActive: vi.fn(),
	copyGlobalSequenceToRetreat: vi.fn(),
	// participantStore
	setAttendanceConfirmation: vi.fn(),
	// la vista
	previewSequenceStep: vi.fn(),
	previewSequenceSchedule: vi.fn(),
}));

const RETREAT_ID = 'retreat-1';

const PARTICIPANT = { id: 'p1', firstName: 'Ana', lastName: 'M3' };

const SEQ = {
	id: 'seq-1',
	name: 'Confirmación de camisetas',
	description: 'Recordar traer camiseta blanca',
	trigger: 'days_before_retreat',
	audience: 'server',
	isActive: true,
	steps: [{ id: 'st-1' }],
};

// 15:00Z = 9:00 en CDMX (UTC-6, sin DST desde 2022) → la UI debe pintar GMT-6.
const SCHED_PAGE = {
	items: [
		{
			id: 'sm-1',
			sequenceId: 'seq-1',
			stepId: 'st-1',
			participantId: 'p1',
			participantName: 'Ana M3',
			templateType: 'SHIRT_CONFIRMATION',
			channel: 'whatsapp',
			recipientTarget: 'participant',
			recipientName: null,
			status: 'pending',
			scheduledFor: '2026-09-25T15:00:00.000Z',
			error: null,
			stepOrder: 0,
			offsetDays: 5,
			sendHour: 9,
			updatedAt: '2026-09-12T10:00:00.000Z',
		},
	],
	total: 1,
	page: 1,
	totalPages: 1,
	timezone: 'America/Mexico_City',
};

const QUEUE_ITEM = {
	id: 'q-1',
	sequenceId: 'seq-1',
	stepId: 'st-1',
	participantId: 'p1',
	retreatId: RETREAT_ID,
	channel: 'whatsapp',
	templateType: 'SHIRT_CONFIRMATION',
	recipientTarget: 'participant',
	scheduledFor: '2026-10-09T15:00:00.000Z', // 9 oct, 9:00 CDMX
	status: 'queued',
	participant: { id: 'p1', firstName: 'Beto', lastName: 'M3' },
};

async function mountView(queue: any[] = [QUEUE_ITEM]): Promise<VueWrapper<any>> {
	setActivePinia(createPinia());
	// Locale fijada en es para poder afirmar sobre textos reales del locale.
	localStorage.setItem('preferred-locale', 'es');

	const apiMod: any = await import('@/services/api');
	apiMod.getRetreatSequences.mockResolvedValue([SEQ]);
	apiMod.getSequenceQueue.mockResolvedValue(queue);
	apiMod.getSequenceStats.mockResolvedValue({ stats: { 'seq-1': { pending: 2 } }, issues: [] });
	apiMod.fetchScheduledMessages.mockResolvedValue(SCHED_PAGE);
	apiMod.previewSequenceSchedule.mockResolvedValue({
		dates: ['2026-09-25T15:00:00.000Z'],
		timezone: 'America/Mexico_City',
	});
	// Participantes por endpoint (el load() del onMounted rehidrata el store y
	// sin esto vacía participants → el participante de muestra desaparece);
	// el resto de GETs (plantillas, responsabilidades) devuelven vacío.
	apiMod.api.get.mockImplementation((url: string) =>
		Promise.resolve({ data: String(url).includes('/participants') ? [PARTICIPANT] : [] }),
	);

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const { useParticipantStore } = await import('@/stores/participantStore');

	const retreatStore = useRetreatStore();
	retreatStore.selectedRetreatId = RETREAT_ID;

	const participantStore = useParticipantStore();
	participantStore.participants = [PARTICIPANT] as any;

	const { default: i18n } = await import('@/i18n');
	const MessageSequencesView = (await import('@/views/MessageSequencesView.vue')).default;
	const wrapper = mount(MessageSequencesView, { global: { plugins: [i18n] }, attachTo: document.body });
	await flushPromises();
	return wrapper;
}

/** Espera el debounce de 400ms de refreshStepDates (relojes reales). */
const waitForStepDates = () => new Promise((r) => setTimeout(r, 500));

describe('MessageSequencesView — pestaña Programados (A2/A3/A5)', () => {
	it('renderiza la fila con la fecha en la TZ del retiro y el hint de zona', async () => {
		const wrapper = await mountView();
		const text = wrapper.text();

		expect(text).toContain('Ana M3');
		// La zona horaria la trae la respuesta del servidor y se muestra tal cual.
		expect(text).toContain('America/Mexico_City');
		// 15:00Z = 9:00 CDMX → la hora del retiro, con su nombre corto de zona.
		expect(text).toContain('GMT-6');
		expect(text).toContain('9:00');
		// Badge de estado del mensaje en la TZ/lista (es).
		expect(text).toContain('Pendiente');
	});

	it('la bandeja WhatsApp pinta el scheduledFor del ítem (A3)', async () => {
		const wrapper = await mountView();
		const text = wrapper.text();

		// El ítem de la bandeja vence 9 oct (distinto del programado de sept).
		expect(text).toContain('Beto M3');
		expect(text).toMatch(/9 ?oct|09 ?oct/);
	});

	it('el contador del tab viene de stats (pending del retiro), no del filtro', async () => {
		const wrapper = await mountView();
		const tab = wrapper.findAll('button').find((b) => b.text().includes('Programados'));
		expect(tab).toBeTruthy();
		expect(tab!.text()).toContain('2');
	});

	it('click en el badge "programados" abre la pestaña filtrada por la secuencia', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.fetchScheduledMessages.mockClear();

		const badge = wrapper.findAll('button').find((b) => b.text().includes('programados'));
		expect(badge).toBeTruthy();
		await badge!.trigger('click');
		await flushPromises();

		expect(wrapper.vm.activeTab).toBe('scheduled');
		expect(wrapper.vm.schedSequenceFilter).toBe('seq-1');
		const calls = apiMod.fetchScheduledMessages.mock.calls;
		const last = calls[calls.length - 1];
		expect(last[0]).toBe(RETREAT_ID);
		expect(last[1].sequenceId).toBe('seq-1');
		expect(last[1].statuses).toEqual(['pending']);
		// El chip muestra el nombre legible de la secuencia.
		expect(wrapper.text()).toContain('Confirmación de camisetas');

		// Remover el chip refetch-ea sin el filtro de secuencia.
		apiMod.fetchScheduledMessages.mockClear();
		await wrapper.vm.clearSchedSequenceFilter();
		await flushPromises();
		expect(wrapper.vm.schedSequenceFilter).toBeNull();
		const calls2 = apiMod.fetchScheduledMessages.mock.calls;
		expect(calls2[calls2.length - 1][1].sequenceId).toBeUndefined();
	});

	it('click en el nombre de una fila filtra el histórico del participante (#9)', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		wrapper.vm.activeTab = 'scheduled';
		apiMod.fetchScheduledMessages.mockClear();

		// El nombre de la fila es un botón: fija el chip de participante y
		// refetch-ea con participantId (el histórico completo de esa persona,
		// combinable con el selector de estado: sent, skipped…).
		const nameBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'Ana M3');
		expect(nameBtn).toBeTruthy();
		await nameBtn!.trigger('click');
		await flushPromises();

		expect(wrapper.vm.schedParticipantFilter).toEqual({ id: 'p1', name: 'Ana M3' });
		const calls = apiMod.fetchScheduledMessages.mock.calls;
		const last = calls[calls.length - 1];
		expect(last[1].participantId).toBe('p1');
		// El chip anuncia a quién está filtrado.
		expect(wrapper.text()).toContain('Participante: Ana M3');

		// Quitar el chip refetch-ea sin el filtro de participante.
		apiMod.fetchScheduledMessages.mockClear();
		await wrapper.vm.clearSchedParticipantFilter();
		await flushPromises();
		expect(wrapper.vm.schedParticipantFilter).toBeNull();
		const calls2 = apiMod.fetchScheduledMessages.mock.calls;
		expect(calls2[calls2.length - 1][1].participantId).toBeUndefined();
	});
});

describe('MessageSequencesView — timeline del editor (A4)', () => {
	it('el header del paso muestra la fecha resuelta por el servidor', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');

		wrapper.vm.openCreate();
		wrapper.vm.addStep();
		await flushPromises();
		await waitForStepDates();
		await flushPromises();

		expect(apiMod.previewSequenceSchedule).toHaveBeenCalled();
		expect(wrapper.vm.stepDates).toHaveLength(1);
		expect(wrapper.vm.stepDates[0]).toBe('2026-09-25T15:00:00.000Z');
		const text = wrapper.text();
		expect(text).toContain('→');
		expect(text).toContain('GMT-6');
	});

	it('un paso sin fecha (falta el dato del disparador) lo dice explícitamente', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.previewSequenceSchedule.mockResolvedValue({
			dates: [null],
			timezone: 'America/Mexico_City',
		});

		wrapper.vm.openCreate();
		wrapper.vm.addStep();
		await flushPromises();
		await waitForStepDates();
		await flushPromises();

		expect(wrapper.vm.stepDates).toEqual([null]);
		expect(wrapper.text()).toContain('sin fecha');
	});
});

describe('MessageSequencesView — reprogramar y encolar ya (M4)', () => {
	it('el diálogo abre con los defaults de la fila y confirma el payload exacto', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.rescheduleSequenceStep.mockResolvedValue({
			affected: 2,
			scheduledFor: '2026-09-30T15:00:00.000Z',
		});
		apiMod.fetchScheduledMessages.mockClear();

		const btn = wrapper.findAll('button').find((b) => b.text().includes('Reprogramar'));
		expect(btn).toBeTruthy();
		await btn!.trigger('click');
		await flushPromises();

		// Defaults = pared del scheduledFor de la fila (15:00Z = 25 sep, 9:00 CDMX).
		expect(wrapper.vm.reschedDialog).toBe(true);
		expect(wrapper.vm.reschedDate).toBe('2026-09-25');
		expect(wrapper.vm.reschedHour).toBe(9);
		// El hint nombra el paso (nombre de la secuencia · plantilla).
		expect(wrapper.text()).toContain('Confirmación de camisetas');
		// Aviso de catch-up: la comparación es de pared, no de instantes.
		wrapper.vm.reschedDate = '2020-01-01';
		expect(wrapper.vm.reschedIsPast).toBe(true);

		wrapper.vm.reschedDate = '2026-09-30';
		wrapper.vm.reschedHour = 10;
		await wrapper.vm.confirmReschedule();
		await flushPromises();

		expect(apiMod.rescheduleSequenceStep).toHaveBeenCalledWith('st-1', {
			date: '2026-09-30',
			hour: 10,
		});
		expect(wrapper.vm.reschedDialog).toBe(false);
		// La pestaña Programados se refresca tras mover las filas.
		expect(apiMod.fetchScheduledMessages).toHaveBeenCalled();
	});

	it('"Encolar ya" manda immediate y refresca la pestaña', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.rescheduleSequenceStep.mockResolvedValue({
			affected: 2,
			scheduledFor: '2026-09-12T18:00:00.000Z',
			processed: 2,
		});
		apiMod.fetchScheduledMessages.mockClear();

		const btn = wrapper.findAll('button').find((b) => b.text().includes('Encolar ya'));
		expect(btn).toBeTruthy();
		await btn!.trigger('click');
		await flushPromises();

		expect(apiMod.rescheduleSequenceStep).toHaveBeenCalledWith('st-1', { immediate: true });
		expect(apiMod.fetchScheduledMessages).toHaveBeenCalled();
	});
});

describe('MessageSequencesView — guardar con cambios estructurales (M5)', () => {
	it('el PUT con cancelledPendingCount/archivedStepCount refresca programados+stats', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.updateMessageSequence.mockResolvedValue({
			...SEQ,
			cancelledPendingCount: 3,
			archivedStepCount: 1,
			archivedPendingCount: 2,
		});
		apiMod.fetchScheduledMessages.mockClear();
		apiMod.getSequenceStats.mockClear();

		wrapper.vm.openEdit(SEQ);
		await wrapper.vm.saveDraft();
		await flushPromises();

		expect(apiMod.updateMessageSequence).toHaveBeenCalledWith('seq-1', expect.objectContaining({
			retreatId: RETREAT_ID,
			steps: expect.any(Array),
		}));
		// Las filas materializadas cambiaron → stats y Programados se refrescan.
		expect(apiMod.getSequenceStats).toHaveBeenCalledWith(RETREAT_ID);
		expect(apiMod.fetchScheduledMessages).toHaveBeenCalled();
		expect(wrapper.vm.isEditorOpen).toBe(false);
	});

	it('un cambio inocuo (sin counts) no refetch-ea programados', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.updateMessageSequence.mockResolvedValue({ ...SEQ, cancelledPendingCount: 0, archivedStepCount: 0 });
		apiMod.fetchScheduledMessages.mockClear();
		apiMod.getSequenceStats.mockClear();

		wrapper.vm.openEdit(SEQ);
		await wrapper.vm.saveDraft();
		await flushPromises();

		expect(apiMod.updateMessageSequence).toHaveBeenCalled();
		expect(apiMod.fetchScheduledMessages).not.toHaveBeenCalled();
		expect(apiMod.getSequenceStats).not.toHaveBeenCalled();
	});
});

describe('MessageSequencesView — calidad de vida (M6)', () => {
	it('D1: duplicar crea una copia inactiva con pasos NUEVOS (sin id)', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.createMessageSequence.mockResolvedValue({ id: 'seq-copy', ...SEQ, isActive: false });

		await wrapper.vm.duplicateSequence(SEQ);
		await flushPromises();

		expect(apiMod.createMessageSequence).toHaveBeenCalledTimes(1);
		const payload = apiMod.createMessageSequence.mock.calls[0][0];
		expect(payload.name).toBe('Confirmación de camisetas (copia)');
		expect(payload.isActive).toBe(false); // inactiva: no enrolla ni reenvía nada
		expect(payload.retreatId).toBe(RETREAT_ID);
		// Steps sin id → stepIds nuevos → cero filas materializadas heredadas.
		expect(payload.steps).toHaveLength(1);
		expect(payload.steps[0]).not.toHaveProperty('id');
	});

	it('D2: toggle desde la lista manda update con el isActive invertido', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.updateMessageSequence.mockResolvedValue({ ...SEQ, isActive: false });
		apiMod.updateMessageSequence.mockClear();

		// Con mensajes vivos (stats del beforeEach: seq-1 pending 2) el toggle
		// primero pide confirmación: nada sale hasta que el coordinador acepta.
		await wrapper.vm.toggleActive(SEQ); // SEQ.isActive = true → apagar
		expect(apiMod.updateMessageSequence).not.toHaveBeenCalled();
		expect(wrapper.vm.seqToPause).toEqual(SEQ);

		await wrapper.vm.confirmPause();
		await flushPromises();

		expect(apiMod.updateMessageSequence).toHaveBeenCalledWith('seq-1', { isActive: false });
	});

	it('D2b: sin mensajes vivos el toggle apaga directo (sin confirmación)', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.updateMessageSequence.mockResolvedValue({ ...SEQ, isActive: false });
		const { useMessageSequenceStore } = await import('@/stores/messageSequenceStore');
		useMessageSequenceStore().stats = {} as any;

		await wrapper.vm.toggleActive(SEQ);
		await flushPromises();

		expect(apiMod.updateMessageSequence).toHaveBeenCalledWith('seq-1', { isActive: false });
		expect(wrapper.vm.seqToPause).toBeNull();
	});

	it('D5: omitir pide confirmación y no omite si se cancela', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.skipScheduledMessage.mockResolvedValue(undefined);

		window.confirm = vi.fn(() => true) as any;
		await wrapper.vm.skipItem(QUEUE_ITEM);
		expect(window.confirm).toHaveBeenCalled();
		expect(apiMod.skipScheduledMessage).toHaveBeenCalledWith('q-1');

		// Cancelar el confirm NO omite (tap accidental en móvil).
		apiMod.skipScheduledMessage.mockClear();
		window.confirm = vi.fn(() => false) as any;
		await wrapper.vm.skipItem(QUEUE_ITEM);
		expect(apiMod.skipScheduledMessage).not.toHaveBeenCalled();
	});

	it('D6: el bulk respeta el filtro activo (ids) y sin filtro es todo el retiro', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		const { useMessageSequenceStore } = await import('@/stores/messageSequenceStore');
		const sequenceStore = useMessageSequenceStore();
		sequenceStore.issues = [
			{ id: 'i1', sequenceId: 'seq-1', participant: { firstName: 'A', lastName: 'A' }, templateType: 'T', error: 'x', status: 'failed' },
			{ id: 'i2', sequenceId: 'seq-2', participant: { firstName: 'B', lastName: 'B' }, templateType: 'T', error: 'x', status: 'failed' },
		] as any;
		apiMod.bulkResolveSequenceIssues.mockResolvedValue({ affected: 1 });
		apiMod.getSequenceQueue.mockResolvedValue([]);
		apiMod.getSequenceStats.mockResolvedValue({ stats: {}, issues: [] });
		window.confirm = vi.fn(() => true) as any;

		// Con chip de secuencia: sólo las filas visibles de esa secuencia.
		wrapper.vm.issuesSequenceFilter = 'seq-1';
		await wrapper.vm.bulkIssues('discard');
		expect(apiMod.bulkResolveSequenceIssues).toHaveBeenCalledWith(RETREAT_ID, 'discard', ['i1']);
		// El confirm cuenta lo filtrado (1), no issues.length (2).
		expect(String((window.confirm as any).mock.calls[0][0])).toContain('1');

		// Sin filtro: ids undefined → el server resuelve el bulk-todo. (El primer
		// bulk vació issues vía fetchStats mockeado — re-sembrar antes de seguir.)
		sequenceStore.issues = [
			{ id: 'i1', sequenceId: 'seq-1', participant: { firstName: 'A', lastName: 'A' }, templateType: 'T', error: 'x', status: 'failed' },
			{ id: 'i2', sequenceId: 'seq-2', participant: { firstName: 'B', lastName: 'B' }, templateType: 'T', error: 'x', status: 'failed' },
		] as any;
		wrapper.vm.issuesSequenceFilter = null;
		await wrapper.vm.bulkIssues('retry');
		expect(apiMod.bulkResolveSequenceIssues).toHaveBeenLastCalledWith(RETREAT_ID, 'retry', undefined);
	});

	it('D7: la descripción de la secuencia se ve en la lista', async () => {
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Recordar traer camiseta blanca');
	});

	it('D4: bandeja/problemas/detalle muestran el nombre legible de la plantilla', async () => {
		const wrapper = await mountView();
		const { useMessageTemplateStore } = await import('@/stores/messageTemplateStore');
		const templateStore = useMessageTemplateStore();
		// El templateLabel ya está en pantalla; cargar la plantilla la re-renderiza.
		templateStore.templates = [
			{ id: 'tpl-1', type: 'SHIRT_CONFIRMATION', name: 'Confirmar talla (camiseta)' },
		] as any;
		await flushPromises();

		// QUEUE_ITEM (bandeja) y sm-1 (programados) usan SHIRT_CONFIRMATION.
		expect(wrapper.text()).toContain('Confirmar talla (camiseta)');
		expect(wrapper.text()).not.toContain('SHIRT_CONFIRMATION');
	});
});

describe('MessageSequencesView — tab Problemas honesto (#2)', () => {
	it('el contador del tab muestra el total real (issuesTotal), no el cap de página', async () => {
		const wrapper = await mountView();
		const { useMessageSequenceStore } = await import('@/stores/messageSequenceStore');
		const sequenceStore = useMessageSequenceStore();
		// 100 filas cargadas (cap de página), 144 problemas reales → el tab
		// debe decir 144; decir 100 es lo que este fix corrige.
		sequenceStore.issues = Array.from({ length: 100 }, (_, i) => ({
			id: `i-${i}`,
			sequenceId: 'seq-1',
			participant: { firstName: `P${i}`, lastName: 'X' },
			templateType: 'T',
			error: 'sin teléfono',
			status: 'skipped',
		})) as any;
		sequenceStore.issuesTotal = 144;
		await flushPromises();

		const tab = wrapper.findAll('button').find((b) => b.text().includes('Problemas'));
		expect(tab).toBeTruthy();
		expect(tab!.text()).toContain('144');
	});

	it('"Cargar más" pide la página siguiente con offset, appendea sin duplicar y desaparece al completar', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		const { useMessageSequenceStore } = await import('@/stores/messageSequenceStore');
		const sequenceStore = useMessageSequenceStore();
		sequenceStore.issues = [
			{ id: 'i-1', sequenceId: 'seq-1', participant: { firstName: 'A', lastName: 'A' }, templateType: 'T', error: 'x', status: 'skipped' },
			{ id: 'i-2', sequenceId: 'seq-1', participant: { firstName: 'B', lastName: 'B' }, templateType: 'T', error: 'x', status: 'skipped' },
		] as any;
		sequenceStore.issuesTotal = 3;
		// La página 2 trae la fila restante — y repite la i-2 (cambió de estado
		// entre fetches) para afirmar el dedupe por id.
		apiMod.getSequenceStats.mockResolvedValue({
			stats: {},
			issues: [
				{ id: 'i-3', sequenceId: 'seq-1', participant: { firstName: 'C', lastName: 'C' }, templateType: 'T', error: 'x', status: 'skipped' },
				{ id: 'i-2', sequenceId: 'seq-1', participant: { firstName: 'B', lastName: 'B' }, templateType: 'T', error: 'x', status: 'skipped' },
			],
			issuesTotal: 3,
		});
		await flushPromises();

		const btn = wrapper.findAll('button').find((b) => b.text().includes('Cargar más'));
		expect(btn).toBeTruthy();
		expect(btn!.text()).toContain('1'); // 1 restante (3 reales - 2 cargadas)
		await btn!.trigger('click');
		await flushPromises();

		// El offset es la cantidad de filas ya cargadas.
		expect(apiMod.getSequenceStats).toHaveBeenCalledWith(RETREAT_ID, { issuesOffset: 2 });
		expect(sequenceStore.issues).toHaveLength(3); // dedupe: i-2 no se duplica
		// Ya está todo cargado → el botón desaparece.
		expect(wrapper.findAll('button').find((b) => b.text().includes('Cargar más'))).toBeFalsy();
	});
});

describe('MessageSequencesView — validaciones blandas del editor (#4)', () => {
	it('al guardar, horas fuera de 0–23 y días negativos se normalizan en el payload', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.updateMessageSequence.mockResolvedValue({ ...SEQ });

		wrapper.vm.openEdit({
			...SEQ,
			steps: [{
				id: 'st-1', offsetDays: 2, sendHour: 9,
				templateType: 'SHIRT_CONFIRMATION', channel: 'email', recipientTarget: 'participant',
			}],
		});
		// El input number deja teclear cualquier cosa; el guard no debe dejarla salir.
		wrapper.vm.draft.steps[0].offsetDays = -5;
		wrapper.vm.draft.steps[0].sendHour = 99;
		apiMod.updateMessageSequence.mockClear();
		await wrapper.vm.saveDraft();
		await flushPromises();

		expect(apiMod.updateMessageSequence).toHaveBeenCalled();
		const payload = apiMod.updateMessageSequence.mock.calls[0][1];
		expect(payload.steps[0].offsetDays).toBe(0);
		expect(payload.steps[0].sendHour).toBe(23);
	});
});

describe('MessageSequencesView — buscar en Problemas por nombre legible (#3)', () => {
	it('la búsqueda matchea el nombre de la plantilla, no sólo su tipo crudo', async () => {
		const wrapper = await mountView();
		const { useMessageTemplateStore } = await import('@/stores/messageTemplateStore');
		const { useMessageSequenceStore } = await import('@/stores/messageSequenceStore');
		const templateStore = useMessageTemplateStore();
		const sequenceStore = useMessageSequenceStore();
		// El tipo crudo WALKER_WELCOME se muestra como "Bienvenida a Caminantes":
		// buscar "bienvenida" debe encontrarlo (antes sólo matcheaba el crudo).
		templateStore.templates = [
			{ id: 'tpl-1', type: 'WALKER_WELCOME', name: 'Bienvenida a Caminantes' },
		] as any;
		sequenceStore.issues = [
			{ id: 'i-1', sequenceId: 'seq-1', participant: { firstName: 'Zoe', lastName: 'Z' }, templateType: 'WALKER_WELCOME', error: 'sin teléfono', status: 'skipped' },
			{ id: 'i-2', sequenceId: 'seq-1', participant: { firstName: 'Otro', lastName: 'X' }, templateType: 'PALANQUERO_NEW_WALKER', error: 'sin email', status: 'failed' },
		] as any;
		sequenceStore.issuesTotal = 2;
		await flushPromises();

		wrapper.vm.issuesSearch = 'bienvenida';
		expect(wrapper.vm.filteredIssues).toHaveLength(1);
		expect(wrapper.vm.filteredIssues[0].id).toBe('i-1');

		// El tipo crudo sigue siendo buscable (comportamiento previo intacto).
		wrapper.vm.issuesSearch = 'WALKER_WELCOME';
		expect(wrapper.vm.filteredIssues).toHaveLength(1);

		wrapper.vm.issuesSearch = 'no-existe-nada';
		expect(wrapper.vm.filteredIssues).toHaveLength(0);
	});
});

describe('MessageSequencesView — accesibilidad (#5)', () => {
	it('los tabs exponen role/aria-selected y las flechas mueven el tab activo con el foco', async () => {
		const wrapper = await mountView();
		const tablist = wrapper.find('[role="tablist"]');
		expect(tablist.exists()).toBe(true);
		const tabs = tablist.findAll('[role="tab"]');
		expect(tabs).toHaveLength(4);
		expect(tabs[0].attributes('aria-selected')).toBe('true');
		expect(tabs[1].attributes('aria-selected')).toBe('false');
		// Tab ↔ panel enlazados vía aria-controls/aria-labelledby.
		expect(tabs[0].attributes('aria-controls')).toBe('seq-panel-sequences');
		expect(wrapper.find('#seq-panel-sequences').attributes('aria-labelledby')).toBe('seq-tab-sequences');

		await tablist.trigger('keydown', { key: 'ArrowRight' });
		expect(wrapper.vm.activeTab).toBe('scheduled');
		expect(document.activeElement?.id).toBe('seq-tab-scheduled');
		expect(wrapper.find('#seq-tab-scheduled').attributes('aria-selected')).toBe('true');

		// Wrap-around con flechas y salto directo con Home/End.
		await tablist.trigger('keydown', { key: 'End' });
		expect(wrapper.vm.activeTab).toBe('issues');
		await tablist.trigger('keydown', { key: 'ArrowRight' });
		expect(wrapper.vm.activeTab).toBe('sequences');
		await tablist.trigger('keydown', { key: 'Home' });
		expect(wrapper.vm.activeTab).toBe('sequences');
	});

	it('los icon-buttons de la lista tienen nombre accesible', async () => {
		const wrapper = await mountView();
		const labels = wrapper.findAll('button').map((b) => b.attributes('aria-label'));
		expect(labels).toContain('Editar');
		expect(labels).toContain('Eliminar');
		expect(labels).toContain('Duplicar');
		expect(labels).toContain('Activar/desactivar');
	});

	it('el editor abre como diálogo accesible y Escape lo cierra', async () => {
		const wrapper = await mountView();
		wrapper.vm.openCreate();
		await flushPromises();
		const dialog = wrapper.find('[role="dialog"][aria-modal="true"]');
		expect(dialog.exists()).toBe(true);
		expect(dialog.attributes('aria-label')).toBeTruthy();
		// El foco entra al contenedor del diálogo (rAF del composable).
		await new Promise((r) => setTimeout(r, 20));
		expect(document.activeElement?.getAttribute('role')).toBe('dialog');

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await flushPromises();
		expect(wrapper.vm.isEditorOpen).toBe(false);
	});

	it('la confirmación de borrado se cancela con Escape sin borrar nada', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		wrapper.vm.askDelete(SEQ);
		await flushPromises();
		expect(wrapper.vm.seqToDelete).toBeTruthy();

		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		await flushPromises();
		expect(wrapper.vm.seqToDelete).toBeNull();
		expect(apiMod.deleteMessageSequence).not.toHaveBeenCalled();
	});
});

describe('MessageSequencesView — import de plantilla global con preview (#10)', () => {
	it('"Ver pasos" despliega los pasos con offset legible y aviso de plantilla faltante', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.getGlobalSequences.mockResolvedValue([
			{
				id: 'g-1',
				name: 'Camino global',
				trigger: 'days_before_retreat',
				audience: 'walker',
				isActive: true,
				steps: [
					{ templateType: 'SHIRT_CONFIRMATION', channel: 'whatsapp', offsetDays: 3, sendHour: 9, recipientTarget: 'participant' },
					{ templateType: 'WALKER_WELCOME', channel: 'email', offsetDays: 0, sendHour: 10, recipientTarget: 'participant' },
				],
			},
		]);

		await wrapper.vm.openImport();
		await flushPromises();

		// Acordeón cerrado: nada de los pasos se filtra en la lista.
		expect(wrapper.text()).not.toContain('antes del inicio del retiro');

		const toggle = wrapper.findAll('button').find((b) => b.text().includes('Ver pasos'));
		expect(toggle).toBeTruthy();
		await toggle!.trigger('click');
		await flushPromises();

		// Re-encontrar el botón tras el re-render (el wrapper previo queda stale).
		const liveToggle = wrapper.findAll('button').find((b) => b.text().includes('Ver pasos'));
		expect(liveToggle!.attributes('aria-expanded')).toBe('true');
		// Offset legible según el trigger (days_before_retreat = ANTES del inicio).
		expect(wrapper.text()).toContain('3 día(s) antes del inicio del retiro');
		expect(wrapper.text()).toContain('el día del inicio del retiro');
		// El retiro (mock) no tiene estas plantillas → aviso accionable.
		expect(wrapper.text()).toContain('sin plantilla en este retiro');
	});
});

describe('MessageSequencesView — refresco tras "Ejecutar"', () => {
	it('runNow refetch-ea bandeja, stats y Programados (un run que solo enrola no emite realtime)', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.runSequences.mockResolvedValue({ enrolled: 3, processed: 1 });
		// El mount ya disparó sus fetches: limpiar para afirmar SOLO los del run.
		apiMod.getSequenceQueue.mockClear();
		apiMod.getSequenceStats.mockClear();
		apiMod.fetchScheduledMessages.mockClear();

		await wrapper.vm.runNow();
		await flushPromises();

		// Sin pasos confirmados (2º arg undefined): el run normal, con el guard M2.
		expect(apiMod.runSequences).toHaveBeenCalledWith(RETREAT_ID, undefined);
		// Bandeja: los WhatsApp vencidos que el run encoló aparecen sin recargar.
		expect(apiMod.getSequenceQueue).toHaveBeenCalledWith(RETREAT_ID);
		// Stats: contador del tab Programados y badges por secuencia — sin esto
		// quedan viejos (processDue no emite evento cuando nada cae a queued).
		expect(apiMod.getSequenceStats).toHaveBeenCalledWith(RETREAT_ID);
		// Programados: las filas futuras que el run materializó.
		const calls = apiMod.fetchScheduledMessages.mock.calls;
		expect(calls[calls.length - 1][0]).toBe(RETREAT_ID);
	});
});

describe('MessageSequencesView — past-dated steps on "Ejecutar" (M5)', () => {
	// seq-1 has two overdue steps (only the latest gets preselected); seq-2 one.
	const PAST_STEPS = [
		{ sequenceId: 'seq-1', sequenceName: 'Palancas', stepId: 'st-a', stepOrder: 0, channel: 'whatsapp', scheduledFor: '2026-09-21T15:00:00.000Z', count: 29 },
		{ sequenceId: 'seq-1', sequenceName: 'Palancas', stepId: 'st-b', stepOrder: 1, channel: 'whatsapp', scheduledFor: '2026-09-25T15:00:00.000Z', count: 29 },
		{ sequenceId: 'seq-2', sequenceName: 'Ultimo Prendas', stepId: 'st-c', stepOrder: 0, channel: 'whatsapp', scheduledFor: '2026-09-21T15:00:00.000Z', count: 28 },
	];
	const findDialog = (wrapper: VueWrapper<any>) =>
		wrapper.find('[role="dialog"][aria-label="Pasos con fecha pasada"]');

	it('asks about the skipped steps and re-runs with the selected ones', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.runSequences.mockReset();
		apiMod.runSequences.mockResolvedValueOnce({ enrolled: 0, processed: 0, pastSteps: PAST_STEPS });

		await wrapper.vm.runNow();
		await flushPromises();

		const dialog = findDialog(wrapper);
		expect(dialog.exists()).toBe(true);
		expect(dialog.text()).toContain('Ultimo Prendas');
		expect(dialog.text()).toContain('28 personas');
		// Two overdue steps in one sequence → the "several messages" warning.
		expect(dialog.text()).toContain('varios pasos vencidos');
		const boxes = dialog.findAll('input[type="checkbox"]');
		expect(boxes.map((b) => (b.element as HTMLInputElement).checked)).toEqual([false, true, true]);

		apiMod.runSequences.mockResolvedValueOnce({ enrolled: 57, processed: 57, pastSteps: [PAST_STEPS[0]] });
		const send = dialog.findAll('button').find((b) => b.text().includes('Enviar ahora'));
		// 29 (Palancas step 2) + 28 (Ultimo Prendas) messages.
		expect(send!.text()).toContain('57');
		await send!.trigger('click');
		await flushPromises();

		expect(apiMod.runSequences).toHaveBeenLastCalledWith(RETREAT_ID, ['st-b', 'st-c']);
		// The confirmed run does not reopen the dialog for the unselected step.
		expect(findDialog(wrapper).exists()).toBe(false);
	});

	it('"Omitir" closes the dialog without running again', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.runSequences.mockReset();
		apiMod.runSequences.mockResolvedValue({ enrolled: 0, processed: 0, pastSteps: [PAST_STEPS[2]] });

		await wrapper.vm.runNow();
		await flushPromises();
		const skip = findDialog(wrapper).findAll('button').find((b) => b.text() === 'Omitir');
		await skip!.trigger('click');
		await flushPromises();

		expect(findDialog(wrapper).exists()).toBe(false);
		expect(apiMod.runSequences).toHaveBeenCalledTimes(1);
	});

	it('a run with no past steps opens nothing', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.runSequences.mockReset();
		apiMod.runSequences.mockResolvedValue({ enrolled: 2, processed: 0, pastSteps: [] });

		await wrapper.vm.runNow();
		await flushPromises();

		expect(findDialog(wrapper).exists()).toBe(false);
	});
});

describe('MessageSequencesView — Programados hides paused sequences by default', () => {
	const SEQ_OFF = { ...SEQ, id: 'seq-off', name: 'Ultimo Prendas', isActive: false };

	it('fetches with paused=hide, and an explicit sequence chip includes them', async () => {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		const calls = apiMod.fetchScheduledMessages.mock.calls;
		expect(calls[calls.length - 1][1].paused).toBe('hide');

		apiMod.fetchScheduledMessages.mockClear();
		wrapper.vm.openScheduledForSequence(SEQ_OFF);
		await flushPromises();
		const after = apiMod.fetchScheduledMessages.mock.calls;
		expect(after[after.length - 1][1]).toMatchObject({ sequenceId: 'seq-off', paused: 'include' });
	});

	it('the tab counter leaves out pending rows of inactive sequences', async () => {
		const wrapper = await mountView();
		const { useMessageSequenceStore } = await import('@/stores/messageSequenceStore');
		const store = useMessageSequenceStore();
		store.sequences = [SEQ, SEQ_OFF] as any;
		store.stats = { 'seq-1': { pending: 2 }, 'seq-off': { pending: 29 } } as any;
		await flushPromises();

		const tab = wrapper.findAll('button').find((b) => b.text().includes('Programados'));
		expect(tab!.text()).toContain('2');
		expect(tab!.text()).not.toContain('31');
	});

	it('says how many are hidden, and "Ver pausados" refetches including them', async () => {
		const apiMod: any = await import('@/services/api');
		const wrapper = await mountView();
		apiMod.fetchScheduledMessages.mockResolvedValue({ ...SCHED_PAGE, pausedCount: 29 });
		wrapper.vm.activeTab = 'scheduled';
		await flushPromises();

		const panel = wrapper.find('#seq-panel-scheduled');
		expect(panel.text()).toContain('29 programados más de secuencias pausadas (ocultos)');

		apiMod.fetchScheduledMessages.mockClear();
		const show = panel.findAll('button').find((b) => b.text().includes('Ver pausados'));
		await show!.trigger('click');
		await flushPromises();

		const calls = apiMod.fetchScheduledMessages.mock.calls;
		expect(calls[calls.length - 1][1].paused).toBe('include');
		expect(panel.text()).toContain('Incluye 29 programados de secuencias pausadas');
		apiMod.fetchScheduledMessages.mockResolvedValue(SCHED_PAGE);
	});

	it('the card of an inactive sequence says "en pausa", not "programados"', async () => {
		const wrapper = await mountView();
		const { useMessageSequenceStore } = await import('@/stores/messageSequenceStore');
		const store = useMessageSequenceStore();
		store.sequences = [SEQ_OFF] as any;
		store.stats = { 'seq-off': { pending: 29 } } as any;
		await flushPromises();

		const panel = wrapper.find('#seq-panel-sequences');
		expect(panel.text()).toContain('29 en pausa');
		expect(panel.text()).not.toContain('29 programados');
	});
});

describe('MessageSequencesView — per-step detail in the sequence card', () => {
	const SEQ_TWO_STEPS = {
		...SEQ,
		name: 'Ultimo Prendas',
		steps: [
			{ id: 'st-1', stepOrder: 0, offsetDays: 25, sendHour: 9, templateType: 'SHIRT_CONFIRMATION', channel: 'whatsapp' },
			{ id: 'st-2', stepOrder: 1, offsetDays: 5, sendHour: 9, templateType: 'SHIRT_CONFIRMATION', channel: 'whatsapp' },
			{ id: 'st-3', stepOrder: 2, offsetDays: 20, sendHour: 9, templateType: 'SHIRT_CONFIRMATION', channel: 'whatsapp' },
		],
	};

	async function mountExpanded(stepStats: Record<string, Record<string, number>>, past: boolean[]) {
		const wrapper = await mountView();
		const apiMod: any = await import('@/services/api');
		apiMod.previewSequenceSchedule.mockResolvedValueOnce({
			dates: ['2026-09-21T15:00:00.000Z', '2026-10-11T15:00:00.000Z', '2026-09-26T15:00:00.000Z'],
			past,
			timezone: 'America/Mexico_City',
		});
		const { useMessageSequenceStore } = await import('@/stores/messageSequenceStore');
		const store = useMessageSequenceStore();
		store.sequences = [SEQ_TWO_STEPS] as any;
		store.stepStats = stepStats as any;
		await flushPromises();
		const toggle = wrapper.findAll('button').find((b) => b.text().includes('Detalle por paso'));
		await toggle!.trigger('click');
		await flushPromises();
		return { wrapper, apiMod };
	}

	it('shows each step with its date and where its messages are', async () => {
		const { wrapper, apiMod } = await mountExpanded(
			{ 'st-1': { queued: 28, sent: 1 }, 'st-2': { pending: 29 } },
			[true, false, true],
		);
		// Dates come from schedule-preview (same for everyone: anchored to the retreat).
		expect(apiMod.previewSequenceSchedule).toHaveBeenLastCalledWith(
			RETREAT_ID,
			'p1',
			'days_before_retreat',
			[
				{ offsetDays: 25, sendHour: 9 },
				{ offsetDays: 5, sendHour: 9 },
				{ offsetDays: 20, sendHour: 9 },
			],
		);
		const panel = wrapper.find('#seq-panel-sequences');
		const text = panel.text();
		expect(text).toContain('Paso 1');
		expect(text).toContain('28 en cola');
		expect(text).toContain('1 enviados');
		expect(text).toMatch(/21 sep/);
		expect(text).toContain('Paso 2');
		expect(text).toContain('29 programados');
		expect(text).toMatch(/11 oct/);
		// Step 3 past with no rows: the guard skipped it — say so.
		expect(text).toContain('sin mensajes: la fecha ya pasó');
		expect(panel.find('button[aria-expanded="true"]').text()).toContain('Ocultar detalle');
	});

	it('a future step with no rows just says there are none yet', async () => {
		const { wrapper } = await mountExpanded({}, [false, false, false]);
		const text = wrapper.find('#seq-panel-sequences').text();
		expect(text).toContain('sin mensajes todavía');
		expect(text).not.toContain('la fecha ya pasó');
	});
});

describe('MessageSequencesView — queue holding only paused messages', () => {
	it('says how many are paused instead of looking empty, and "Ver pausados" shows them', async () => {
		const wrapper = await mountView();
		const { useMessageSequenceStore } = await import('@/stores/messageSequenceStore');
		useMessageSequenceStore().sequences = [{ ...SEQ, isActive: false }] as any;
		wrapper.vm.activeTab = 'pending';
		await flushPromises();

		const panel = wrapper.find('#seq-panel-pending');
		expect(panel.text()).toContain('Hay 1 mensaje de una secuencia pausada');
		expect(panel.text()).not.toContain('Sin resultados para la búsqueda');
		expect(panel.text()).not.toContain('Beto M3');

		const show = panel.findAll('button').find((b) => b.text().includes('Ver pausados'));
		await show!.trigger('click');
		await flushPromises();

		expect(wrapper.vm.queueAssignFilter).toBe('paused');
		expect(panel.text()).toContain('Beto M3');
	});

	it('with active work visible, hidden paused messages get a one-line hint', async () => {
		const pausedItem = { ...QUEUE_ITEM, id: 'q-2', sequenceId: 'seq-off', participant: { id: 'p2', firstName: 'Caro', lastName: 'Off' } };
		const wrapper = await mountView([QUEUE_ITEM, pausedItem]);
		const { useMessageSequenceStore } = await import('@/stores/messageSequenceStore');
		useMessageSequenceStore().sequences = [SEQ, { ...SEQ, id: 'seq-off', isActive: false }] as any;
		wrapper.vm.activeTab = 'pending';
		await flushPromises();

		const panel = wrapper.find('#seq-panel-pending');
		expect(panel.text()).toContain('Beto M3');
		expect(panel.text()).not.toContain('Caro Off');
		expect(panel.text()).toContain('1 mensaje más en una secuencia pausada');
	});
});

describe('MessageSequencesView — bandeja por palanquero', () => {
	// Fixture: P2 vence ANTES que P1 (el orden por palanquero no es el
	// cronológico) y el ítem sin asignación tiene fecha intermedia — igual
	// va al final.
	const palanqueroQueue = () => [
		{
			...QUEUE_ITEM,
			id: 'q-p2',
			participantId: 'p2',
			participant: { id: 'p2', firstName: 'Lupita', lastName: 'Gómez' },
			scheduledFor: '2026-10-01T15:00:00.000Z', // la más temprana
			palancasCoordinator: 'Palanquero 2',
			palanqueroName: 'Marta López',
		},
		{
			...QUEUE_ITEM,
			id: 'q-p1',
			participantId: 'p3',
			participant: { id: 'p3', firstName: 'Carlos', lastName: 'Díaz' },
			scheduledFor: '2026-10-05T15:00:00.000Z', // la más tardía
			palancasCoordinator: 'Palanquero 1',
			palanqueroName: 'Ana Rodríguez',
		},
		{
			...QUEUE_ITEM,
			id: 'q-none',
			participantId: 'p4',
			participant: { id: 'p4', firstName: 'Servidor', lastName: 'Nuñez' },
			scheduledFor: '2026-10-03T15:00:00.000Z', // intermedia, y aun así al final
			palancasCoordinator: null,
			palanqueroName: null,
		},
	];

	it('la fila muestra "Palanquero 1 (Ana Rodríguez)"; sin asignación no pinta nada', async () => {
		const wrapper = await mountView(palanqueroQueue());
		expect(wrapper.text()).toContain('Palanquero 1 (Ana Rodríguez)');
		expect(wrapper.text()).toContain('Palanquero 2 (Marta López)');
		// La fila sin asignación no gana etiqueta: sólo su nombre.
		const row = wrapper.find('#seq-panel-pending');
		const buttons = row.findAll('button[title="Ver detalle del participante"]');
		expect(buttons.map((b) => b.text())).toContain('Servidor Nuñez');
		expect(wrapper.text()).not.toContain('Palanquero 1 ()');
	});

	it('orden por palanquero: P1 → P2 → sin asignar (nulls al final pese a la fecha)', async () => {
		const wrapper = await mountView(palanqueroQueue());
		wrapper.vm.queueSort = 'palanquero';
		await flushPromises();

		const names = wrapper
			.find('#seq-panel-pending')
			.findAll('button[title="Ver detalle del participante"]')
			.map((b) => b.text());
		// P1 (fecha más tardía) gana a P2 (más temprana): agrupa por palanquero.
		expect(names).toEqual(['Carlos Díaz', 'Lupita Gómez', 'Servidor Nuñez']);
	});

	it('coordinador sin titular: la fila pinta "Palanquero 2" a secas, sin paréntesis vacíos', async () => {
		const wrapper = await mountView([
			{
				...QUEUE_ITEM,
				palancasCoordinator: 'Palanquero 2',
				palanqueroName: null, // la responsabilidad existe pero nadie la titulariza
			},
		]);
		expect(wrapper.text()).toContain('Palanquero 2');
		expect(wrapper.text()).not.toContain('Palanquero 2 (');
		expect(wrapper.text()).not.toContain('Palanquero 2 ()');
	});

	it('la opción "Palanquero" existe en el combobox desktop y en el menú móvil', async () => {
		const wrapper = await mountView(palanqueroQueue());

		// Desktop: el combobox vive siempre en el header de la bandeja.
		const desktopOptions = wrapper.findAll('select option[value="palanquero"]');
		expect(desktopOptions).toHaveLength(1);
		expect(desktopOptions[0].text()).toBe('Palanquero'); // label del locale es

		// Móvil: el select del menú "⋯" sólo monta con el menú abierto.
		wrapper.vm.queueMenuOpen = true;
		await flushPromises();
		expect(wrapper.findAll('select option[value="palanquero"]')).toHaveLength(2);
	});
});
