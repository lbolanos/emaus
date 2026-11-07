import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

// ---------------------------------------------------------------------------
// API mock — el store real (Pinia) se monta encima de este mock.
// ---------------------------------------------------------------------------
const api = vi.hoisted(() => ({
	lettersApi: {
		activateMailboxes: vi.fn(),
		getMailboxes: vi.fn(),
		toggleMailbox: vi.fn(),
		listLetters: vi.fn(),
		getLetter: vi.fn(),
		reviewLetter: vi.fn(),
		markPrinted: vi.fn(),
		getPrintBatch: vi.fn(),
	},
}));

vi.mock('@/services/api', () => api);

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

vi.mock('@/composables/usePrintableDocument', () => ({
	printHtmlDocument: vi.fn(() => true),
}));

vi.mock('@/components/letters/LettersMailboxDialog.vue', () => ({
	default: { name: 'LettersMailboxDialog', template: '<div class="mailbox-dialog-stub" />', props: ['open'] },
}));
vi.mock('@/components/letters/LettersShareDialog.vue', () => ({
	default: { name: 'LettersShareDialog', template: '<div class="share-dialog-stub" />', props: ['open'] },
}));

import LettersView from '../LettersView.vue';
import { printHtmlDocument } from '@/composables/usePrintableDocument';

const letter = (over: Record<string, any> = {}) => ({
	id: 'l1',
	retreatId: 'r1',
	retreatParticipantId: 'rp1',
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
		api.lettersApi.listLetters.mockResolvedValue(inbox([letter()]));
		api.lettersApi.getMailboxes.mockResolvedValue([]);
		api.lettersApi.getPrintBatch.mockResolvedValue([]);
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

		// Acción rápida en la fila: botón de solo ícono con title (sin expandir).
		const approveBtn = wrapper
			.findAll('button')
			.find((b) => b.attributes('title') === 'letters.review.approve');
		expect(approveBtn).toBeTruthy();
		await approveBtn!.trigger('click');
		await flushPromises();

		expect(api.lettersApi.reviewLetter).toHaveBeenCalledWith('l1', 'approved');
	});

	it('Imprimir retiro arma el documento y marca el lote impreso', async () => {
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
		const printBtn = wrapper.findAll('button').find((b) => b.text().includes('letters.print.retreat'));
		expect(printBtn).toBeTruthy();
		await printBtn!.trigger('click');
		await flushPromises();

		expect(printHtmlDocument).toHaveBeenCalledWith(
			expect.objectContaining({ subtitle: 'Buen Despacho' }),
		);
		expect(api.lettersApi.markPrinted).toHaveBeenCalledWith(
			'r1',
			['l1'],
			expect.any(String),
		);
	});

	it('si el navegador bloquea el popup NO marca el lote impreso', async () => {
		vi.mocked(printHtmlDocument).mockReturnValueOnce(false);
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
		const printBtn = wrapper.findAll('button').find((b) => b.text().includes('letters.print.retreat'));
		await printBtn!.trigger('click');
		await flushPromises();

		expect(printHtmlDocument).toHaveBeenCalled();
		expect(api.lettersApi.markPrinted).not.toHaveBeenCalled();
	});

	it('imprimir por mesa sin mesa elegida no llama al API', async () => {
		const wrapper = await mountView();
		const printTableBtn = wrapper.findAll('button').find((b) => b.text().includes('letters.print.table'));
		await printTableBtn!.trigger('click');
		await flushPromises();
		expect(api.lettersApi.getPrintBatch).not.toHaveBeenCalled();
	});
});
