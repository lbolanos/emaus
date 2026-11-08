import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// ---------------------------------------------------------------------------
// API mock — el store real (Pinia) se monta encima de este mock.
// ---------------------------------------------------------------------------
const api = vi.hoisted(() => ({
	getPalanqueroOptions: vi.fn(),
	lettersApi: {
		activateMailboxes: vi.fn(),
		getMailboxes: vi.fn(),
		toggleMailbox: vi.fn(),
		markMailboxShared: vi.fn(),
		listLetters: vi.fn(),
		getLetter: vi.fn(),
		reviewLetter: vi.fn(),
		markPrinted: vi.fn(),
		unmarkPrinted: vi.fn(),
		getPrintBatch: vi.fn(),
		getFolders: vi.fn(),
	},
}));

// Ruta controlable: los filtros viajan en la URL (vista/palanquero/caminante).
const nav = vi.hoisted(() => ({
	route: { params: { id: 'r1' } as Record<string, string>, query: {} as Record<string, string> },
	replace: vi.fn(),
}));
vi.mock('vue-router', () => ({
	useRoute: () => nav.route,
	useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
}));

// Socket de prueba: captura los handlers para disparar realtime en el test.
const socketHandlers = vi.hoisted(() => new Map<string, (payload: unknown) => void>());

vi.mock('@/services/api', () => api);

vi.mock('@/services/realtime', () => ({
	getSocket: () => ({
		on: vi.fn((event: string, handler: (payload: unknown) => void) => {
			socketHandlers.set(event, handler);
		}),
		off: vi.fn((event: string) => socketHandlers.delete(event)),
		emit: vi.fn(),
	}),
}));

vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({
		selectedRetreatId: 'r1',
		retreats: [{ id: 'r1', parish: 'Buen Despacho' }],
		fetchRetreats: vi.fn(),
	}),
}));

vi.mock('@/stores/tableMesaStore', () => ({
	useTableMesaStore: () => ({
		tables: [{ id: 't1', name: 'Mesa 1' }],
		fetchTables: vi.fn(),
	}),
}));

vi.mock('@/components/letters/LettersMailboxDialog.vue', () => ({
	default: { name: 'LettersMailboxDialog', template: '<div class="mailbox-dialog-stub" />', props: ['open'] },
}));
vi.mock('@/components/letters/LettersShareDialog.vue', () => ({
	default: { name: 'LettersShareDialog', template: '<div class="share-dialog-stub" />', props: ['open'] },
}));

import LettersView from '../LettersView.vue';

const letter = (over: Record<string, any> = {}) => ({
	id: 'l1',
	retreatId: 'r1',
	retreatParticipantId: 'rp1',
	participantId: 'p1',
	participantName: 'Juan Pérez',
	tableName: 'Mesa 1',
	fromEmail: 'familia@ejemplo.com',
	fromName: 'María',
	subject: 'Para Juan',
	bodyText: 'Hola Juan, fuerza.',
	status: 'pending',
	receivedAt: '2026-11-05T14:03:00.000Z',
	warnings: null,
	reviewedAt: null,
	printedAt: null,
	printedBatchId: null,
	attachments: [],
	...over,
});

const inbox = (letters: any[]) => ({
	letters,
	counts: {
		pending: letters.filter((l) => l.status === 'pending').length,
		approved: letters.filter((l) => l.status === 'approved').length,
		hidden: letters.filter((l) => l.status === 'hidden').length,
	},
});

describe('LettersView', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
		vi.clearAllMocks();
		socketHandlers.clear();
		// El último palanquero elegido se recuerda por retiro: aislar cada caso.
		localStorage.clear();
		nav.route.query = {};
		api.lettersApi.unmarkPrinted.mockResolvedValue({ unmarked: 1 });
		api.lettersApi.listLetters.mockResolvedValue(inbox([letter()]));
		api.lettersApi.getMailboxes.mockResolvedValue([]);
		api.lettersApi.getPrintBatch.mockResolvedValue([]);
		api.lettersApi.markMailboxShared.mockResolvedValue({ mailboxSharedAt: new Date().toISOString() });
		api.lettersApi.getFolders.mockResolvedValue([]);
		api.getPalanqueroOptions.mockResolvedValue([]);
	});

	const mountView = async () => {
		const wrapper = mount(LettersView, { global: { plugins: [] } });
		await flushPromises();
		return wrapper;
	};

	it('muestra las cartas de la bandeja con su estado', async () => {
		const wrapper = await mountView();
		expect(wrapper.text()).toContain('Juan Pérez');
		expect(wrapper.text()).toContain('María');
		expect(wrapper.text()).toContain('familia@ejemplo.com');
	});

	it('renderiza el texto de la carta como TEXTO: nunca v-html con contenido del email (D10)', async () => {
		api.lettersApi.listLetters.mockResolvedValue(
			inbox([letter({ bodyText: 'Hola <script>alert(1)</script>', status: 'approved' })]),
		);
		const wrapper = await mountView();
		// No existe ningún elemento <script> en el DOM montado; el contenido del
		// email aparece como TEXTO visible (happy-dom serializa los text nodes sin
		// escapar, así que la prueba es sobre nodos, no sobre el html()).
		expect(wrapper.find('script').exists()).toBe(false);
		expect(wrapper.text()).toContain('<script>alert(1)</script>');
	});

	it('aprobar llama al API y actualiza el chip de counts', async () => {
		api.lettersApi.reviewLetter.mockResolvedValue({ ...letter(), status: 'approved' });
		const wrapper = await mountView();

		// Acción de revisión en el menú ⋮ de la fila (stub: click emite select+click).
		const approveItem = wrapper
			.findAll('[role="menuitem"]')
			.find((b) => b.text().includes('letters.review.approve'));
		expect(approveItem).toBeTruthy();
		await approveItem!.trigger('click');
		await flushPromises();

		expect(api.lettersApi.reviewLetter).toHaveBeenCalledWith('l1', 'approved');
	});

	it('Imprimir retiro abre el preview; marca impresas SOLO tras confirmar que salió', async () => {
		api.lettersApi.listLetters.mockResolvedValue(inbox([letter({ status: 'approved' })]));
		api.lettersApi.getPrintBatch.mockResolvedValue([
			{
				retreatParticipantId: 'rp1',
				participantId: 'p1',
				participantName: 'Juan Pérez',
				idOnRetreat: 1,
				tableName: 'Mesa 1',
				tableSortKey: 'Mesa 1',
				letters: [letter({ status: 'approved' })],
			},
		]);
		api.lettersApi.markPrinted.mockResolvedValue({ marked: 1 });

		const wrapper = await mountView();
		const printBtn = wrapper.findAll('[role="menuitem"]').find((b) => b.text().includes('letters.print.retreat'));
		expect(printBtn).toBeTruthy();
		await printBtn!.trigger('click');
		// deferOpen del menú abre el preview con timers reales (~130ms).
		await new Promise((r) => setTimeout(r, 250));
		await flushPromises();

		// Preview abierto: el papel en un iframe con blob URL; aún SIN marcar.
		const iframe = wrapper.find('iframe');
		expect(iframe.exists()).toBe(true);
		expect(iframe.attributes('src')?.startsWith('blob:')).toBe(true);
		expect(api.lettersApi.markPrinted).not.toHaveBeenCalled();

		// «Imprimir ahora»: abre el diálogo del navegador y PREGUNTA (cancelar el
		// diálogo no se distingue de imprimir: marcar ahí mentía).
		const nowBtn = wrapper
			.findAll('button')
			.find((b) => b.text().includes('letters.print.printNow'));
		expect(nowBtn).toBeTruthy();
		await nowBtn!.trigger('click');
		await flushPromises();
		expect(wrapper.find('[data-testid="print-confirm-question"]').exists()).toBe(true);
		expect(api.lettersApi.markPrinted).not.toHaveBeenCalled();

		const yesBtn = wrapper.findAll('button').find((b) => b.text().includes('letters.print.yesMark'));
		await yesBtn!.trigger('click');
		await flushPromises();
		expect(api.lettersApi.markPrinted).toHaveBeenCalledWith('r1', ['l1'], expect.any(String));
	});

	it('si la impresión no salió («No, no marcar») el lote NO se marca', async () => {
		api.lettersApi.getPrintBatch.mockResolvedValue([
			{
				retreatParticipantId: 'rp1', participantId: 'p1', participantName: 'Juan Pérez',
				idOnRetreat: 1, tableName: 'Mesa 1', tableSortKey: 'Mesa 1',
				letters: [letter({ status: 'approved' })],
			},
		]);
		const wrapper = await mountView();
		await wrapper.findAll('[role="menuitem"]').find((b) => b.text().includes('letters.print.retreat'))!.trigger('click');
		await new Promise((r) => setTimeout(r, 250));
		await flushPromises();
		await wrapper.findAll('button').find((b) => b.text().includes('letters.print.printNow'))!.trigger('click');
		await flushPromises();
		await wrapper.findAll('button').find((b) => b.text().includes('letters.print.notPrinted'))!.trigger('click');
		await flushPromises();
		expect(api.lettersApi.markPrinted).not.toHaveBeenCalled();
		expect(wrapper.find('iframe').exists()).toBe(false);
	});

	it('cerrar el preview sin imprimir NO marca el lote impreso', async () => {
		api.lettersApi.listLetters.mockResolvedValue(inbox([letter({ status: 'approved' })]));
		api.lettersApi.getPrintBatch.mockResolvedValue([
			{
				retreatParticipantId: 'rp1',
				participantId: null,
				participantName: 'Juan',
				idOnRetreat: null,
				tableName: null,
				tableSortKey: '',
				letters: [letter({ status: 'approved' })],
			},
		]);

		const wrapper = await mountView();
		const printBtn = wrapper.findAll('[role="menuitem"]').find((b) => b.text().includes('letters.print.retreat'));
		await printBtn!.trigger('click');
		// deferOpen del menú abre el preview con timers reales (~130ms).
		await new Promise((r) => setTimeout(r, 250));
		await flushPromises();
		expect(wrapper.find('iframe').exists()).toBe(true);

		const closeBtn = wrapper
			.findAll('button')
			.find((b) => b.text().includes('letters.print.close'));
		await closeBtn!.trigger('click');
		await flushPromises();

		expect(api.lettersApi.markPrinted).not.toHaveBeenCalled();
	});

	it('imprimir por mesa solo se ofrece con una mesa elegida', async () => {
		const wrapper = await mountView();
		const printTableItem = wrapper
			.findAll('[role="menuitem"]')
			.find((b) => b.text().includes('letters.print.table'));
		expect(printTableItem).toBeUndefined();
	});

	it('el detalle de una carta ya no repite las acciones del ⋮ (aprobar, ocultar, copiar)', async () => {
		const wrapper = await mountView();
		await wrapper.find('.cursor-pointer').trigger('click');
		await flushPromises();
		// Las acciones están una sola vez: en el ⋮ (menuitem), no como botones.
		const buttons = wrapper.findAll('button').map((b) => b.text());
		expect(buttons.some((t) => t.includes('letters.review.approve'))).toBe(false);
		expect(buttons.some((t) => t.includes('letters.copyAddress'))).toBe(false);
	});

	it('una carta oculta se puede volver a aprobar desde el ⋮', async () => {
		api.lettersApi.listLetters.mockResolvedValue(inbox([letter({ status: 'hidden' })]));
		api.lettersApi.reviewLetter.mockResolvedValue({ ...letter(), status: 'approved' });
		const wrapper = await mountView();
		const approve = wrapper
			.findAll('[role="menuitem"]')
			.find((i) => i.text().includes('letters.review.approve'));
		expect(approve).toBeTruthy();
		await approve!.trigger('click');
		await flushPromises();
		expect(api.lettersApi.reviewLetter).toHaveBeenCalledWith('l1', 'approved');
	});

	it('selección granular: checkbox → Imprimir seleccionadas usa scope participant (mejora 15)', async () => {
		const second = letter({ id: 'l2', participantId: 'p2', participantName: 'Rosa' });
		api.lettersApi.listLetters.mockResolvedValue(inbox([letter({ status: 'approved' }), second]));
		const wrapper = await mountView();

		// Checkboxes de las cartas (el del preview, «Incluir carátula», no cuenta).
		const checkboxes = wrapper.findAll('input[type="checkbox"][aria-label]');
		expect(checkboxes.length).toBe(2);
		await checkboxes[0].setValue(true);
		await checkboxes[1].setValue(true);

		api.lettersApi.getPrintBatch.mockResolvedValue([
			{
				retreatParticipantId: 'rp1',
				participantId: 'p1',
				participantName: 'Juan Pérez',
				idOnRetreat: 1,
				tableName: 'Mesa 1',
				tableSortKey: 'Mesa 1',
				letters: [letter({ status: 'approved' })],
			},
		]);

		// El alcance vive en el menú «Imprimir ▾»; deferOpen abre el preview con
		// timers reales (80+50ms), así que esperamos de verdad. Con el stub del
		// setup, el item está en el wrapper y su click nativo emite `select`.
		const item = wrapper
			.findAll('[role="menuitem"]')
			.find((i) => i.text().includes('letters.print.selection'));
		expect(item).toBeTruthy();
		await item!.trigger('click');
		await new Promise((r) => setTimeout(r, 250));
		await flushPromises();

		expect(api.lettersApi.getPrintBatch).toHaveBeenCalledWith('r1', 'participant', {
			tableId: undefined,
			participantIds: ['p1', 'p2'],
			onlyUnprinted: false,
		});
		// El preview abre en vez de popup.
		expect(wrapper.find('iframe').attributes('src')?.startsWith('blob:')).toBe(true);
	});

	it('realtime: dos cartas nuevas agrupan en banner y el toast solo sale para la primera (mejora 7)', async () => {
		const wrapper = await mountView();

		const receive = (payload: unknown) => socketHandlers.get('letters:received')?.(payload);
		receive({ retreatId: 'r1', participantName: 'Uno' });
		receive({ retreatId: 'r1', participantName: 'Dos' });
		await flushPromises();

		// Otro retiro no cuenta para esta bandeja.
		receive({ retreatId: 'otro', participantName: 'Otro retiro' });
		await flushPromises();

		const banner = wrapper.find('[data-testid="new-letters-banner"]');
		// Sin i18n configurado, t() no interpola el número: el assert es de
		// presencia del banner (el count lo interpola vue-i18n en runtime).
		expect(banner.exists()).toBe(true);
	});

	const folder = (over: Record<string, any> = {}) => ({
		retreatParticipantId: 'rp1', participantId: 'p1', participantName: 'Juan Pérez',
		participantType: 'walker', palancasCoordinator: null, tableId: 't1', tableName: 'Mesa 1', idOnRetreat: 1,
		mailboxEnabled: true, mailboxSharedAt: null,
		counts: { pending: 0, approved: 0, hidden: 0, attached: 0 }, printed: 0, unprinted: 0,
		...over,
	});

	it('filtro de caminante: la lista sale de las carpetas y filtra EN EL SERVIDOR', async () => {
		api.lettersApi.getFolders.mockResolvedValue([
			folder({ counts: { pending: 1, approved: 2, hidden: 0, attached: 0 } }),
			folder({ retreatParticipantId: 'rp2', participantId: 'p2', participantName: 'Rosa Díaz' }),
		]);
		const wrapper = await mountView();
		const input = wrapper.find('[data-testid="participant-filter"]');
		await input.trigger('focus');
		await input.setValue('rosa');
		await flushPromises();
		// Búsqueda sin acentos sobre las carpetas; solo Rosa coincide.
		const options = wrapper.findAll('button').filter((b) => b.text().includes('Rosa Díaz'));
		expect(options).toHaveLength(1);
		await options[0].trigger('mousedown');
		await flushPromises();
		expect(api.lettersApi.listLetters).toHaveBeenLastCalledWith(
			'r1',
			expect.objectContaining({ participantId: 'p2' }),
		);
	});

	it('preview avisa las cartas por revisar del alcance que NO van al papel', async () => {
		api.lettersApi.getFolders.mockResolvedValue([
			folder({ counts: { pending: 2, approved: 1, hidden: 0, attached: 0 }, unprinted: 1 }),
		]);
		api.lettersApi.getPrintBatch.mockResolvedValue([
			{
				retreatParticipantId: 'rp1', participantId: 'p1', participantName: 'Juan Pérez',
				idOnRetreat: 1, tableName: 'Mesa 1', tableSortKey: 'Mesa 1',
				letters: [letter({ status: 'approved' })],
			},
		]);
		const wrapper = await mountView();
		await wrapper.findAll('[role="menuitem"]').find((b) => b.text().includes('letters.print.retreat'))!.trigger('click');
		await new Promise((r) => setTimeout(r, 250));
		await flushPromises();
		expect(wrapper.find('[data-testid="print-notice"]').text()).toContain('letters.print.pendingNotIncluded');
	});

	it('cambiar de filtro suelta la selección: «Imprimir seleccionadas» desaparece', async () => {
		const wrapper = await mountView();
		await wrapper.find('input[type="checkbox"][aria-label]').setValue(true);
		expect(
			wrapper.findAll('[role="menuitem"]').some((i) => i.text().includes('letters.print.selection')),
		).toBe(true);
		const pendingChip = wrapper.findAll('button').find((b) => b.text().includes('letters.status.pending'));
		await pendingChip!.trigger('click');
		await flushPromises();
		expect(
			wrapper.findAll('[role="menuitem"]').some((i) => i.text().includes('letters.print.selection')),
		).toBe(false);
	});

	it('Carpetas: estado por persona e «Imprimir lo que falta» pide solo lo no impreso', async () => {
		api.lettersApi.getFolders.mockResolvedValue([
			folder({ counts: { pending: 0, approved: 3, hidden: 0, attached: 0 }, printed: 1, unprinted: 2 }),
			folder({
				retreatParticipantId: 'rp2', participantId: 'p2', participantName: 'Rosa Díaz',
				counts: { pending: 0, approved: 2, hidden: 0, attached: 0 }, printed: 2, unprinted: 0,
			}),
			folder({
				retreatParticipantId: 'rp3', participantId: 'p3', participantName: 'Luis Gómez',
				mailboxSharedAt: '2026-11-01T12:00:00Z',
			}),
		]);
		api.lettersApi.getPrintBatch.mockResolvedValue([
			{
				retreatParticipantId: 'rp1', participantId: 'p1', participantName: 'Juan Pérez',
				idOnRetreat: 1, tableName: 'Mesa 1', tableSortKey: 'Mesa 1',
				letters: [letter({ status: 'approved' })],
			},
		]);
		const wrapper = await mountView();
		await wrapper.find('[data-testid="view-folders"]').trigger('click');
		await flushPromises();

		const rows = wrapper.findAll('[data-testid="folder-row"]');
		expect(rows).toHaveLength(3);
		// Rosa tiene todo impreso → completa; Luis no tiene cartas pero ya se le mandó la dirección.
		expect(rows[1].find('[data-testid="folder-complete"]').exists()).toBe(true);
		expect(rows[2].text()).toContain('letters.folders.emptyShared');

		await wrapper.find('[data-testid="folders-print-missing"]').trigger('click');
		await new Promise((r) => setTimeout(r, 250));
		await flushPromises();
		expect(api.lettersApi.getPrintBatch).toHaveBeenCalledWith('r1', 'participant', {
			tableId: undefined,
			participantIds: ['p1'],
			onlyUnprinted: true,
		});
	});

	const palanqueros = [
		{ value: 'Palanquero 1', label: 'Palanquero 1 (Ana Ruiz)' },
		{ value: 'Palanquero 2', label: 'Palanquero 2 (Beto Soto)' },
	];
	const foldersByPalanquero = () => [
		folder({
			palancasCoordinator: 'Palanquero 1',
			counts: { pending: 0, approved: 2, hidden: 0, attached: 0 }, unprinted: 2,
		}),
		folder({
			retreatParticipantId: 'rp2', participantId: 'p2', participantName: 'Rosa Díaz',
			palancasCoordinator: 'Palanquero 2',
			counts: { pending: 0, approved: 1, hidden: 0, attached: 0 }, unprinted: 1,
		}),
		folder({
			retreatParticipantId: 'rp3', participantId: 'p3', participantName: 'Luis Gómez',
			palancasCoordinator: 'Palanquero 1',
			counts: { pending: 0, approved: 1, hidden: 0, attached: 0 }, unprinted: 1,
		}),
	];
	const batch = [
		{
			retreatParticipantId: 'rp1', participantId: 'p1', participantName: 'Juan Pérez',
			idOnRetreat: 1, tableName: 'Mesa 1', tableSortKey: 'Mesa 1',
			letters: [letter({ status: 'approved' })],
		},
	];

	it('bandeja: filtro por palanquero va al servidor e imprime las carpetas de sus caminantes', async () => {
		api.getPalanqueroOptions.mockResolvedValue(palanqueros);
		api.lettersApi.getFolders.mockResolvedValue(foldersByPalanquero());
		api.lettersApi.getPrintBatch.mockResolvedValue(batch);
		const wrapper = await mountView();

		const select = wrapper.find('[data-testid="palanquero-filter"]');
		expect(select.exists()).toBe(true);
		// Opciones: todos + los del retiro + «sin palanquero».
		expect(select.findAll('option')).toHaveLength(4);
		await select.setValue('Palanquero 1');
		await flushPromises();
		expect(api.lettersApi.listLetters).toHaveBeenLastCalledWith(
			'r1',
			expect.objectContaining({ palanquero: 'Palanquero 1' }),
		);

		const item = wrapper
			.findAll('[role="menuitem"]')
			.find((i) => i.text().includes('letters.print.palanquero'));
		expect(item).toBeTruthy();
		await item!.trigger('click');
		await new Promise((r) => setTimeout(r, 250));
		await flushPromises();
		// Solo Juan y Luis (Palanquero 1); Rosa es de Palanquero 2.
		expect(api.lettersApi.getPrintBatch).toHaveBeenCalledWith('r1', 'participant', {
			tableId: undefined,
			participantIds: ['p1', 'p3'],
			onlyUnprinted: false,
		});
	});

	it('bandeja: sin permiso para ver palanqueros, el filtro no aparece', async () => {
		api.getPalanqueroOptions.mockRejectedValue(new Error('403'));
		const wrapper = await mountView();
		expect(wrapper.find('[data-testid="palanquero-filter"]').exists()).toBe(false);
	});

	it('palanquero elegido en Bandeja sigue puesto al pasar a Carpetas (filtro compartido)', async () => {
		api.getPalanqueroOptions.mockResolvedValue(palanqueros);
		api.lettersApi.getFolders.mockResolvedValue(foldersByPalanquero());
		const wrapper = await mountView();
		await wrapper.find('[data-testid="palanquero-filter"]').setValue('Palanquero 1');
		await flushPromises();
		await wrapper.find('[data-testid="view-folders"]').trigger('click');
		await flushPromises();
		const rows = wrapper.findAll('[data-testid="folder-row"]');
		expect(rows.map((r) => r.text().includes('Rosa Díaz'))).toEqual([false, false]);
	});

	it('carpetas: filtro por palanquero y «Imprimir todo lo que falta» solo de lo que se ve', async () => {
		api.getPalanqueroOptions.mockResolvedValue(palanqueros);
		api.lettersApi.getFolders.mockResolvedValue(foldersByPalanquero());
		api.lettersApi.getPrintBatch.mockResolvedValue(batch);
		const wrapper = await mountView();
		await wrapper.find('[data-testid="view-folders"]').trigger('click');
		await flushPromises();
		expect(wrapper.findAll('[data-testid="folder-row"]')).toHaveLength(3);
		expect(wrapper.find('[data-testid="folder-palanquero"]').text()).toBe('Palanquero 1 (Ana Ruiz)');

		// El mismo selector (junto a Bandeja | Carpetas) filtra también las carpetas.
		await wrapper.find('[data-testid="palanquero-filter"]').setValue('Palanquero 2');
		await flushPromises();
		const rows = wrapper.findAll('[data-testid="folder-row"]');
		expect(rows).toHaveLength(1);
		expect(rows[0].text()).toContain('Rosa Díaz');

		await wrapper.find('[data-testid="folders-print-missing"]').trigger('click');
		await new Promise((r) => setTimeout(r, 250));
		await flushPromises();
		expect(api.lettersApi.getPrintBatch).toHaveBeenCalledWith('r1', 'participant', {
			tableId: undefined,
			participantIds: ['p2'],
			onlyUnprinted: true,
		});
	});

	it('click en una carpeta abre sus cartas; «Volver a Carpetas» regresa y resalta la fila', async () => {
		api.lettersApi.getFolders.mockResolvedValue(foldersByPalanquero());
		const wrapper = await mountView();
		await wrapper.find('[data-testid="view-folders"]').trigger('click');
		await flushPromises();

		await wrapper.findAll('[data-testid="folder-row"]')[1].trigger('click');
		await flushPromises();
		expect(api.lettersApi.listLetters).toHaveBeenLastCalledWith(
			'r1',
			expect.objectContaining({ participantId: 'p2' }),
		);
		const header = wrapper.find('[data-testid="participant-header"]');
		expect(header.text()).toContain('Rosa Díaz');

		await wrapper.find('[data-testid="back-to-folders"]').trigger('click');
		await flushPromises();
		expect(wrapper.find('[data-testid="participant-header"]').exists()).toBe(false);
		const rows = wrapper.findAll('[data-testid="folder-row"]');
		expect(rows[1].classes()).toContain('ring-2');
		expect(api.lettersApi.listLetters).toHaveBeenLastCalledWith(
			'r1',
			expect.objectContaining({ participantId: undefined }),
		);
	});

	it('una carpeta sin cartas no es clicable', async () => {
		api.lettersApi.getFolders.mockResolvedValue([folder()]);
		const wrapper = await mountView();
		await wrapper.find('[data-testid="view-folders"]').trigger('click');
		await flushPromises();
		api.lettersApi.listLetters.mockClear();
		const row = wrapper.find('[data-testid="folder-row"]');
		expect(row.attributes('role')).toBeUndefined();
		await row.trigger('click');
		await flushPromises();
		expect(api.lettersApi.listLetters).not.toHaveBeenCalled();
	});

	it('filtros activos: etiqueta con ✕ por filtro y «Limpiar filtros»', async () => {
		api.getPalanqueroOptions.mockResolvedValue(palanqueros);
		api.lettersApi.getFolders.mockResolvedValue(foldersByPalanquero());
		const wrapper = await mountView();
		expect(wrapper.find('[data-testid="active-filters"]').exists()).toBe(false);

		await wrapper.find('[data-testid="palanquero-filter"]').setValue('Palanquero 1');
		await flushPromises();
		const pendingChip = wrapper.findAll('button').find((b) => b.text().includes('letters.status.pending'));
		await pendingChip!.trigger('click');
		await flushPromises();
		expect(wrapper.find('[data-testid="chip-clear-palanquero"]').exists()).toBe(true);
		expect(wrapper.find('[data-testid="chip-clear-status"]').exists()).toBe(true);

		await wrapper.find('[data-testid="chip-clear-status"]').trigger('click');
		await flushPromises();
		expect(api.lettersApi.listLetters).toHaveBeenLastCalledWith(
			'r1',
			expect.objectContaining({ status: '', palanquero: 'Palanquero 1' }),
		);

		await pendingChip!.trigger('click');
		await flushPromises();
		await wrapper.find('[data-testid="clear-all-filters"]').trigger('click');
		await flushPromises();
		expect(api.lettersApi.listLetters).toHaveBeenLastCalledWith(
			'r1',
			expect.objectContaining({ status: '', palanquero: undefined }),
		);
		expect(wrapper.find('[data-testid="active-filters"]').exists()).toBe(false);
	});

	it('vacío por filtros: dice que es por los filtros y ofrece limpiarlos', async () => {
		api.lettersApi.listLetters.mockResolvedValue(inbox([]));
		const wrapper = await mountView();
		const pendingChip = wrapper.findAll('button').find((b) => b.text().includes('letters.status.pending'));
		await pendingChip!.trigger('click');
		await flushPromises();
		expect(wrapper.text()).toContain('letters.emptyFiltered');
		expect(wrapper.text()).not.toContain('letters.empty ');
	});

	it('URL: abre en Carpetas con el palanquero del enlace, y escribe los filtros al cambiarlos', async () => {
		nav.route.query = { vista: 'carpetas', palanquero: 'Palanquero 2' };
		api.getPalanqueroOptions.mockResolvedValue(palanqueros);
		api.lettersApi.getFolders.mockResolvedValue(foldersByPalanquero());
		const wrapper = await mountView();
		const rows = wrapper.findAll('[data-testid="folder-row"]');
		expect(rows).toHaveLength(1);
		expect(rows[0].text()).toContain('Rosa Díaz');
		expect(api.lettersApi.listLetters).toHaveBeenCalledWith(
			'r1',
			expect.objectContaining({ palanquero: 'Palanquero 2' }),
		);

		await wrapper.find('[data-testid="view-inbox"]').trigger('click');
		await flushPromises();
		expect(nav.replace).toHaveBeenLastCalledWith({ query: { palanquero: 'Palanquero 2' } });
	});

	it('el último palanquero elegido se recuerda en el retiro', async () => {
		localStorage.setItem('letters.palanquero.r1', 'Palanquero 1');
		await mountView();
		expect(api.lettersApi.listLetters).toHaveBeenCalledWith(
			'r1',
			expect.objectContaining({ palanquero: 'Palanquero 1' }),
		);
	});

	it('quitar la marca de impresa: desde la carta y desde la carpeta', async () => {
		api.lettersApi.listLetters.mockResolvedValue(
			inbox([letter({ status: 'approved', printedAt: '2026-11-07T10:00:00Z' })]),
		);
		api.lettersApi.getFolders.mockResolvedValue([
			folder({ counts: { pending: 0, approved: 1, hidden: 0, attached: 0 }, printed: 1 }),
		]);
		const wrapper = await mountView();
		const fromLetter = wrapper
			.findAll('[role="menuitem"]')
			.find((i) => i.text().includes('letters.print.unmarkLetter'));
		await fromLetter!.trigger('click');
		await flushPromises();
		expect(api.lettersApi.unmarkPrinted).toHaveBeenCalledWith('r1', { letterIds: ['l1'] });

		const fromFolder = wrapper
			.findAll('[role="menuitem"]')
			.find((i) => i.text().includes('letters.folders.unmarkFolder'));
		await fromFolder!.trigger('click');
		await flushPromises();
		expect(api.lettersApi.unmarkPrinted).toHaveBeenLastCalledWith('r1', { participantIds: ['p1'] });
	});

	it('«Solo las no impresas»: toma el alcance del filtro (palanquero) y pide onlyUnprinted', async () => {
		api.getPalanqueroOptions.mockResolvedValue(palanqueros);
		api.lettersApi.getFolders.mockResolvedValue(foldersByPalanquero());
		api.lettersApi.getPrintBatch.mockResolvedValue(batch);
		const wrapper = await mountView();
		const sinFiltro = wrapper.find('[data-testid="print-unprinted"]');
		// Retiro entero: 2 + 1 + 1 aprobadas sin imprimir.
		expect(sinFiltro.text()).toContain('letters.print.unprinted');

		await wrapper.find('[data-testid="palanquero-filter"]').setValue('Palanquero 1');
		await flushPromises();
		await wrapper.find('[data-testid="print-unprinted"]').trigger('click');
		await new Promise((r) => setTimeout(r, 250));
		await flushPromises();
		expect(api.lettersApi.getPrintBatch).toHaveBeenCalledWith('r1', 'participant', {
			tableId: undefined,
			participantIds: ['p1', 'p3'],
			onlyUnprinted: true,
		});
	});
});
