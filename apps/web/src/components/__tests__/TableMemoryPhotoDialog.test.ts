import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import TableMemoryPhotoDialog from '../TableMemoryPhotoDialog.vue';
import type { TableMesa } from '@repo/types';

const h = vi.hoisted(() => ({
	toast: vi.fn(),
	pickFile: vi.fn(),
	resize: vi.fn(),
	setTablePhoto: vi.fn(),
	removeTablePhoto: vi.fn(),
}));

vi.mock('@repo/ui', () => ({
	Button: { template: '<button :disabled="disabled"><slot /></button>', props: ['variant', 'size', 'disabled'] },
	Dialog: {
		template: '<div class="dialog" v-if="open"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	DialogDescription: { template: '<p><slot /></p>' },
	DialogFooter: { template: '<div class="footer"><slot /></div>' },
	useToast: () => ({ toast: h.toast }),
}));

vi.mock('lucide-vue-next', () => ({
	ImagePlus: { template: '<svg />' },
	Loader2: { template: '<svg />' },
}));

vi.mock('@/utils/filePicker', () => ({ pickFile: h.pickFile }));
vi.mock('@/utils/imageResize', () => ({
	MAX_PHOTO_SOURCE_BYTES: 30 * 1024 * 1024,
	PHOTO_MAX_SIDE: 1600,
	resizeImageToDataUrl: h.resize,
}));
vi.mock('@/stores/tableMesaStore', () => ({
	useTableMesaStore: () => ({
		setTablePhoto: h.setTablePhoto,
		removeTablePhoto: h.removeTablePhoto,
	}),
}));
vi.mock('@/services/apiError', () => ({
	apiErrorMessage: (e: unknown) => (e as any)?.message ?? 'error',
}));

const baseTable = (photoUrl: string | null = null): TableMesa =>
	({
		id: 't-1',
		name: 'Mesa 1',
		retreatId: 'r-1',
		photoUrl,
		walkers: [],
		lider: null,
		colider1: null,
		colider2: null,
	}) as unknown as TableMesa;

// size sin ocupar memoria real: la validación solo lee file.size.
const fakeFile = (size: number) => {
	const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
	Object.defineProperty(file, 'size', { value: size });
	return file;
};

const mountDialog = (table: TableMesa = baseTable(), open = true) =>
	mount(TableMemoryPhotoDialog, {
		props: { open, table },
		global: {
			mocks: { $t: (key: string, params?: any) => (params ? `${key}:${JSON.stringify(params)}` : key) },
		},
	});

// Elige un archivo válido y espera a que el preview quede listo.
const chooseValidFile = async (w: ReturnType<typeof mountDialog>) => {
	h.pickFile.mockResolvedValueOnce(fakeFile(10));
	h.resize.mockResolvedValueOnce('data:image/webp;base64,RESIZED');
	await w.find('[data-testid="table-photo-choose"]').trigger('click');
	await flushPromises();
};

describe('TableMemoryPhotoDialog', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('reduce la foto con maxSide 1600 antes de guardar y sube el resultado', async () => {
		const w = mountDialog();
		await chooseValidFile(w);

		expect(h.resize).toHaveBeenCalledTimes(1);
		expect(h.resize).toHaveBeenCalledWith(expect.any(File), { maxSide: 1600 });
		// El preview reemplaza visualmente a la foto actual antes de guardar.
		expect(w.find('img').attributes('src')).toBe('data:image/webp;base64,RESIZED');

		h.setTablePhoto.mockResolvedValueOnce({});
		await w.find('[data-testid="table-photo-save"]').trigger('click');
		await flushPromises();

		expect(h.setTablePhoto).toHaveBeenCalledWith('t-1', 'data:image/webp;base64,RESIZED');
		expect(w.emitted('update:open')?.at(-1)).toEqual([false]);
	});

	it('rechaza archivos de más de 30MB sin decodificarlos', async () => {
		const w = mountDialog();
		h.pickFile.mockResolvedValueOnce(fakeFile(40 * 1024 * 1024));
		await w.find('[data-testid="table-photo-choose"]').trigger('click');
		await flushPromises();

		expect(h.resize).not.toHaveBeenCalled();
		expect(h.setTablePhoto).not.toHaveBeenCalled();
		expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
		expect(w.find('img').exists()).toBe(false);
	});

	it('muestra el error con toast y mantiene el dialog abierto si el guardado falla', async () => {
		const w = mountDialog();
		await chooseValidFile(w);

		h.setTablePhoto.mockRejectedValueOnce(new Error('boom'));
		await w.find('[data-testid="table-photo-save"]').trigger('click');
		await flushPromises();

		expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
		expect(w.emitted('update:open')).toBeUndefined();
	});

	it('elimina la foto existente y cierra el dialog', async () => {
		const w = mountDialog(baseTable('https://s3/presigned.webp'));
		expect(w.find('[data-testid="table-photo-remove"]').exists()).toBe(true);

		h.removeTablePhoto.mockResolvedValueOnce({});
		await w.find('[data-testid="table-photo-remove"]').trigger('click');
		await flushPromises();

		expect(h.removeTablePhoto).toHaveBeenCalledWith('t-1');
		expect(w.emitted('update:open')?.at(-1)).toEqual([false]);
	});

	it('descarta el preview pendiente al cerrar y reabrir', async () => {
		const w = mountDialog();
		await chooseValidFile(w);
		// Con preview el botón ofrece elegir OTRA foto.
		expect(w.text()).toContain('chooseOther');

		await w.setProps({ open: false });
		await w.setProps({ open: true });
		await flushPromises();

		expect(w.text()).not.toContain('chooseOther');
		// Sin preview el guardar queda deshabilitado.
		expect(w.find('[data-testid="table-photo-save"]').attributes('disabled')).toBeDefined();
	});
});
