import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MemberPhotoDialog from '../MemberPhotoDialog.vue';

const mockSetPhoto = vi.fn();
const mockDeletePhoto = vi.fn();

// El mock global de `@repo/ui` declara `onClick` como prop del Button, así que
// Vue lo trata como dato y no como listener: los clics nunca llegan al handler
// y los botones parecen muertos en los tests. Aquí se replica el contrato real.
vi.mock('@repo/ui', () => ({
	Dialog: { template: '<div v-if="open"><slot /></div>', props: ['open'] },
	DialogContent: { template: '<div><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	DialogDescription: { template: '<p><slot /></p>' },
	DialogFooter: { template: '<div><slot /></div>' },
	Button: {
		template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
		props: ['variant', 'size', 'disabled', 'type'],
		emits: ['click'],
	},
	useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/services/api', () => ({
	setCommunityMemberPhoto: (...args: any[]) => mockSetPhoto(...args),
	deleteCommunityMemberPhoto: (...args: any[]) => mockDeletePhoto(...args),
}));

// El resize real usa <canvas>, que happy-dom no implementa. Lo que importa
// probar aquí es que la subida pasa por él, no cómo escala los píxeles.
const mockResize = vi.fn(async () => 'data:image/jpeg;base64,REDIMENSIONADA');
vi.mock('@/utils/imageResize', () => ({
	resizeImageToDataUrl: (...args: any[]) => mockResize(...args),
}));

const makeFile = (type = 'image/png') =>
	new File([new Uint8Array([1, 2, 3])], 'foto.png', { type });

// El componente escucha `paste` y `drop` en `document`. Si un wrapper de un
// test anterior sigue montado, sus listeners también corren y la misma subida
// se cuenta varias veces. Se desmontan todos al terminar cada test.
const mounted: ReturnType<typeof mount>[] = [];

const mountDialog = (props: any = {}) => {
	const wrapper = mount(MemberPhotoDialog, {
		props: {
			open: true,
			communityId: 'community-1',
			memberId: 'member-1',
			memberName: 'Juan Pérez',
			currentPhotoUrl: null,
			...props,
		},
	});
	mounted.push(wrapper);
	return wrapper;
};

/** Dispara un evento de pegado con una imagen dentro, como haría ⌘V. */
const pasteImage = (file: File | null) => {
	const items = file
		? [{ kind: 'file', type: file.type, getAsFile: () => file }]
		: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }];
	const event = new Event('paste', { bubbles: true, cancelable: true }) as any;
	event.clipboardData = { items };
	document.dispatchEvent(event);
	return event;
};

describe('MemberPhotoDialog', () => {
	afterEach(() => {
		while (mounted.length) mounted.pop()?.unmount();
	});

	beforeEach(() => {
		vi.clearAllMocks();
		mockSetPhoto.mockResolvedValue({ id: 'member-1', photoUrl: 'https://s3/firmada.webp' });
		mockDeletePhoto.mockResolvedValue({ id: 'member-1', photoUrl: null });
		mockResize.mockResolvedValue('data:image/jpeg;base64,REDIMENSIONADA');
	});

	// ─── Guard de regresión ──────────────────────────────────────────────────

	it('el control de archivo es un <label> que envuelve al input, no un botón con click()', () => {
		// Esto no es un detalle de estilo: con un botón que llama a
		// `input.click()` sobre un input oculto, el selector no abre en Safari,
		// y en desarrollo el hot-reload deja la referencia apuntando a un nodo
		// desconectado, donde `click()` no hace nada y no avisa. Costó tres
		// intentos encontrarlo; que no vuelva.
		const wrapper = mountDialog();
		const input = wrapper.find('input[type="file"]');
		expect(input.exists()).toBe(true);

		const label = input.element.closest('label');
		expect(label).not.toBeNull();
		expect(label?.textContent).toContain('Elegir foto');
		// El input no debe estar deshabilitado: un input disabled vuelve
		// inerte a la etiqueta que lo envuelve.
		expect((input.element as HTMLInputElement).disabled).toBe(false);
	});

	// ─── Subida por archivo ──────────────────────────────────────────────────

	it('sube el archivo elegido, redimensionado', async () => {
		const wrapper = mountDialog();
		const input = wrapper.find('input[type="file"]');
		Object.defineProperty(input.element, 'files', { value: [makeFile()], writable: false });
		await input.trigger('change');
		await flushPromises();

		expect(mockResize).toHaveBeenCalledOnce();
		expect(mockSetPhoto).toHaveBeenCalledWith(
			'community-1',
			'member-1',
			'data:image/jpeg;base64,REDIMENSIONADA',
		);
		expect(wrapper.emitted('saved')).toBeTruthy();
	});

	it('rechaza un archivo que no es imagen sin llamar a la API', async () => {
		const wrapper = mountDialog();
		const input = wrapper.find('input[type="file"]');
		Object.defineProperty(input.element, 'files', {
			value: [new File(['x'], 'notas.pdf', { type: 'application/pdf' })],
			writable: false,
		});
		await input.trigger('change');
		await flushPromises();

		expect(mockSetPhoto).not.toHaveBeenCalled();
		expect(wrapper.text()).toContain('no es una imagen');
	});

	it('muestra el error del servidor cuando la subida falla', async () => {
		mockSetPhoto.mockRejectedValue({
			response: { data: { message: 'La imagen no es válida o pesa más de 2 MB.' } },
		});
		const wrapper = mountDialog();
		const input = wrapper.find('input[type="file"]');
		Object.defineProperty(input.element, 'files', { value: [makeFile()], writable: false });
		await input.trigger('change');
		await flushPromises();

		expect(wrapper.text()).toContain('pesa más de 2 MB');
		expect(wrapper.emitted('saved')).toBeFalsy();
	});

	// ─── Portapapeles y arrastrar ────────────────────────────────────────────

	it('sube una imagen pegada con ⌘V', async () => {
		const wrapper = mountDialog();
		pasteImage(makeFile());
		await flushPromises();

		expect(mockSetPhoto).toHaveBeenCalledOnce();
		expect(wrapper.emitted('saved')).toBeTruthy();
	});

	it('ignora un pegado que no trae imagen', async () => {
		mountDialog();
		pasteImage(null);
		await flushPromises();

		expect(mockSetPhoto).not.toHaveBeenCalled();
	});

	it('no reacciona al pegado cuando el diálogo está cerrado', async () => {
		mountDialog({ open: false });
		pasteImage(makeFile());
		await flushPromises();

		expect(mockSetPhoto).not.toHaveBeenCalled();
	});

	it('deja de escuchar el pegado al desmontarse', async () => {
		const wrapper = mountDialog();
		wrapper.unmount();
		pasteImage(makeFile());
		await flushPromises();

		expect(mockSetPhoto).not.toHaveBeenCalled();
	});

	it('sube una imagen arrastrada al diálogo', async () => {
		mountDialog();
		const event = new Event('drop', { bubbles: true, cancelable: true }) as any;
		event.dataTransfer = { files: [makeFile()] };
		document.dispatchEvent(event);
		await flushPromises();

		expect(mockSetPhoto).toHaveBeenCalledOnce();
	});

	it('el botón Pegar avisa cuando el navegador no da acceso al portapapeles', async () => {
		const original = navigator.clipboard;
		Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });

		const wrapper = mountDialog();
		const pasteButton = wrapper.findAll('button').find((b) => b.text().includes('Pegar'));
		await pasteButton!.trigger('click');
		await flushPromises();

		expect(wrapper.text()).toContain('⌘V');
		expect(mockSetPhoto).not.toHaveBeenCalled();

		Object.defineProperty(navigator, 'clipboard', { value: original, configurable: true });
	});

	it('el botón Pegar avisa cuando no hay imagen copiada', async () => {
		Object.defineProperty(navigator, 'clipboard', {
			value: { read: vi.fn().mockResolvedValue([{ types: ['text/plain'] }]) },
			configurable: true,
		});

		const wrapper = mountDialog();
		const pasteButton = wrapper.findAll('button').find((b) => b.text().includes('Pegar'));
		await pasteButton!.trigger('click');
		await flushPromises();

		expect(wrapper.text()).toContain('No hay ninguna imagen');
		expect(mockSetPhoto).not.toHaveBeenCalled();
	});

	// ─── Quitar ──────────────────────────────────────────────────────────────

	it('quita la foto existente', async () => {
		const wrapper = mountDialog({ currentPhotoUrl: 'https://s3/actual.webp' });
		await nextTick();
		const removeButton = wrapper.findAll('button').find((b) => b.text().includes('Quitar'));
		expect(removeButton).toBeDefined();

		await removeButton!.trigger('click');
		await flushPromises();

		expect(mockDeletePhoto).toHaveBeenCalledWith('community-1', 'member-1');
		expect(wrapper.emitted('saved')).toBeTruthy();
	});

	it('no ofrece Quitar cuando el miembro no tiene foto', async () => {
		const wrapper = mountDialog({ currentPhotoUrl: null });
		await nextTick();

		expect(wrapper.findAll('button').find((b) => b.text().includes('Quitar'))).toBeUndefined();
	});

	it('avisa de que hay que pedir permiso antes de subir la foto de alguien', () => {
		// La advertencia es parte del producto, no decoración: son datos
		// personales de terceros.
		const wrapper = mountDialog();
		expect(wrapper.text()).toContain('Pide su permiso');
	});
});
