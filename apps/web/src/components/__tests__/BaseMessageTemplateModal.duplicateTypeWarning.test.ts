import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises, VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import BaseMessageTemplateModal from '../BaseMessageTemplateModal.vue';

/**
 * M3: los tipos duplicados por retiro son LEGALES (son el caso de uso que
 * motivó el fix — la segunda plantilla SERVER_SHIRT_CONFIRMATION era
 * inalcanzable). El modal no bloquea: avisa en ámbar que los pasos sin
 * plantilla concreta enviarán la primera creada.
 *
 * Estos specs fijan:
 *   - el fetch-on-open: la vista que abre el modal (secuencias, bandeja)
 *     puede no tener las plantillas del retiro cargadas;
 *   - el aviso con el nombre interpolado (i18n REAL: el mock global de
 *     vue-i18n pintaría la clave cruda);
 *   - la exclusión de la propia plantilla y el corte a 3 nombres con "y N más";
 *   - M6: el nombre de la predeterminada y la casilla que la toma;
 *   - el guard de scope (isGlobal no consulta plantillas de retiro).
 */

// tiptap no monta en happy-dom; stub con el contrato v-model (editorMode.test).
vi.mock('../RichTextEditor.vue', () => ({
	default: {
		name: 'RichTextEditor',
		props: ['modelValue', 'placeholder', 't'],
		emits: ['update:modelValue'],
		template: '<div class="rich-editor-stub">{{ modelValue }}</div>',
	},
}));

// Solo se usa al guardar en modo global; shaped mínimo para que monte.
vi.mock('@/stores/globalMessageTemplateStore', () => ({
	useGlobalMessageTemplateStore: () => ({ create: vi.fn(), update: vi.fn() }),
}));
// messageTemplateStore y retreatStore van con pinia REAL: el modal hace
// storeToRefs(messageTemplateStore) y eso no tolera mocks planos.

vi.mock('@/services/api', () => ({
	api: { get: vi.fn() },
	getParticipantNextMeeting: vi.fn().mockResolvedValue(null),
	getParticipantShirtOrder: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/utils/sanitize', () => ({
	sanitizeHtml: (html: string) => html,
	sanitizeEmailHtml: (html: string) => html,
}));

// Mock local de @repo/ui (el global no tiene ScrollArea). Dialog gatea su
// slot en `open` para observar el ciclo cerrado→abierto del fetch-on-open.
vi.mock('@repo/ui', () => {
	const passthrough = (name: string) => ({
		name,
		template: `<div class="ui-${name.toLowerCase()}"><slot /></div>`,
	});
	return {
		Dialog: {
			name: 'Dialog',
			props: ['open'],
			emits: ['update:open'],
			template: '<div class="ui-dialog" v-if="open"><slot /></div>',
		},
		DialogContent: passthrough('DialogContent'),
		DialogHeader: passthrough('DialogHeader'),
		DialogTitle: passthrough('DialogTitle'),
		DialogDescription: passthrough('DialogDescription'),
		DialogFooter: passthrough('DialogFooter'),
		Button: {
			name: 'Button',
			props: ['variant', 'size', 'disabled', 'type'],
			template: '<button :disabled="disabled"><slot /></button>',
		},
		Input: {
			name: 'Input',
			props: ['modelValue', 'placeholder'],
			emits: ['update:modelValue'],
			template:
				'<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
		},
		Label: passthrough('Label'),
		Textarea: {
			name: 'Textarea',
			props: ['modelValue', 'placeholder'],
			template: '<div class="ui-textarea"></div>',
		},
		Select: passthrough('Select'),
		SelectContent: passthrough('SelectContent'),
		SelectItem: passthrough('SelectItem'),
		SelectTrigger: passthrough('SelectTrigger'),
		SelectValue: passthrough('SelectValue'),
		Badge: passthrough('Badge'),
		Tabs: passthrough('Tabs'),
		TabsList: passthrough('TabsList'),
		TabsTrigger: passthrough('TabsTrigger'),
		TabsContent: passthrough('TabsContent'),
		ScrollArea: passthrough('ScrollArea'),
		// retreatStore (real) lo usa al activarse.
		useToast: () => ({ toast: vi.fn() }),
	};
});

// i18n real (locale es): el setup global mockea vue-i18n con t = clave.
vi.mock('vue-i18n', async (importOriginal) => await importOriginal());

const RETREAT_ID = 'retreat-1';

// La plantilla editada: la "Reconfirmar Prendas" del incidente.
const NEW_TEMPLATE = {
	id: 'tpl-new',
	name: 'Reconfirmar Prendas',
	type: 'SERVER_SHIRT_CONFIRMATION',
	message: 'Confirma tu talla, {participant.firstName}',
};

/** Monta en edición, cerrado; el store de retiro responde con `templates`. */
async function mountModal(
	props: Record<string, unknown> = {},
	templates: unknown[] = [],
): Promise<VueWrapper<any>> {
	setActivePinia(createPinia());
	// Locale es para afirmar el texto real del aviso interpolado.
	localStorage.setItem('preferred-locale', 'es');

	const apiMod: any = await import('@/services/api');
	apiMod.api.get.mockImplementation((url: string) =>
		Promise.resolve({ data: String(url).includes('/message-templates') ? templates : [] }),
	);

	const { useRetreatStore } = await import('@/stores/retreatStore');
	const retreatStore = useRetreatStore();
	retreatStore.selectedRetreatId = RETREAT_ID;

	const { default: i18n } = await import('@/i18n');
	return mount(BaseMessageTemplateModal, {
		props: { open: false, template: NEW_TEMPLATE as any, ...props },
		global: { plugins: [i18n] },
	});
}

/** Abre el modal (montado cerrado) y espera el fetch-on-open. */
const openAndWait = async (wrapper: VueWrapper<any>) => {
	await wrapper.setProps({ open: true });
	await flushPromises();
};

const warning = (wrapper: VueWrapper<any>) => wrapper.find('p.text-amber-700');

describe('BaseMessageTemplateModal — aviso de tipo duplicado (M3)', () => {
	// El mock de @/services/api es compartido por archivo: sin esto, el
	// assert "no llamó" del último test ve las llamadas de los anteriores.
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('al abrir trae las plantillas del retiro y avisa del duplicado con el nombre de la otra', async () => {
		const wrapper = await mountModal({}, [
			NEW_TEMPLATE, // la propia: no cuenta como duplicado
			{ id: 'tpl-old', name: 'Confirmación de prendas', type: 'SERVER_SHIRT_CONFIRMATION', message: 'VIEJA' },
		]);
		const apiMod: any = await import('@/services/api');
		apiMod.api.get.mockClear();

		await openAndWait(wrapper);

		// Fetch-on-open: la vista que abre el modal puede no tener las
		// plantillas del retiro cargadas.
		expect(apiMod.api.get).toHaveBeenCalledWith(
			expect.stringContaining(`/message-templates?retreatId=${RETREAT_ID}`),
		);
		const text = warning(wrapper).text();
		expect(text).toContain('Hay otras plantillas de este tipo en el retiro');
		expect(text).toContain('Confirmación de prendas');
		// La propia plantilla editada no se lista a sí misma.
		expect(text).not.toContain('Reconfirmar');
	});

	// M6: the warning names the template the system will use when it picks by
	// type (flagged default, else the oldest), and the checkbox takes it over.
	const OLD_AT = '2026-01-01T10:00:00.000Z';
	const NEW_AT = '2026-01-05T10:00:00.000Z';
	const editing = { ...NEW_TEMPLATE, createdAt: NEW_AT };

	it('M6: without a flagged default it names the oldest of the type', async () => {
		const wrapper = await mountModal({ template: editing }, [
			editing,
			{ id: 'tpl-old', name: 'Confirmación de prendas', type: 'SERVER_SHIRT_CONFIRMATION', message: 'x', createdAt: OLD_AT },
		]);
		await openAndWait(wrapper);

		expect(warning(wrapper).text()).toContain('usa la predeterminada: «Confirmación de prendas»');
	});

	it('M6: names a flagged sibling, and checking the box names this one and saves isDefault', async () => {
		const wrapper = await mountModal({ template: editing }, [
			editing,
			{ id: 'tpl-old', name: 'Confirmación de prendas', type: 'SERVER_SHIRT_CONFIRMATION', message: 'x', createdAt: OLD_AT },
			{ id: 'tpl-b', name: 'Último aviso (B)', type: 'SERVER_SHIRT_CONFIRMATION', message: 'x', createdAt: NEW_AT, isDefault: true },
		]);
		await openAndWait(wrapper);
		expect(warning(wrapper).text()).toContain('«Último aviso (B)»');

		await wrapper.find('input[type="checkbox"]').setValue(true);
		expect(warning(wrapper).text()).toContain('«Reconfirmar Prendas»');

		const { useMessageTemplateStore } = await import('@/stores/messageTemplateStore');
		const update = vi.spyOn(useMessageTemplateStore(), 'updateTemplate').mockResolvedValue(undefined as any);
		await wrapper.find('form').trigger('submit');
		await flushPromises();
		expect(update).toHaveBeenCalledWith('tpl-new', expect.objectContaining({ isDefault: true }));
	});

	it('sin duplicados del tipo en el retiro no muestra el aviso', async () => {
		// La propia del tipo + una de OTRO tipo: nada que avisar.
		const wrapper = await mountModal({}, [
			NEW_TEMPLATE,
			{ id: 'tpl-other', name: 'Bienvenida', type: 'WALKER_WELCOME', message: 'hola' },
		]);

		await openAndWait(wrapper);

		expect(warning(wrapper).exists()).toBe(false);
	});

	it('con más de 3 duplicados corta la lista de nombres con "y N más"', async () => {
		const dups = [1, 2, 3, 4].map((n) => ({
			id: `tpl-dup-${n}`,
			name: `Duplicada ${n}`,
			type: 'SERVER_SHIRT_CONFIRMATION',
			message: 'x',
		}));
		const wrapper = await mountModal({}, [NEW_TEMPLATE, ...dups]);

		await openAndWait(wrapper);

		const text = warning(wrapper).text();
		expect(text).toContain('Duplicada 3');
		expect(text).toContain('Duplicada 3 y 1 más.');
		expect(text).not.toContain('Duplicada 4');
	});

	it('modo global no consulta plantillas de retiro ni muestra el aviso (guard de scope)', async () => {
		setActivePinia(createPinia());
		localStorage.setItem('preferred-locale', 'es');
		// El guard debe apagar el aviso AUNQUE el store tenga duplicados del
		// tipo: se siembran a mano (en modo global no hay fetch que los traiga).
		const { useMessageTemplateStore } = await import('@/stores/messageTemplateStore');
		const tplStore = useMessageTemplateStore();
		tplStore.templates = [
			{ id: 'tpl-a', name: 'Uno', type: 'GENERAL', message: 'x' },
			{ id: 'tpl-b', name: 'Dos', type: 'GENERAL', message: 'x' },
		] as any;

		const apiMod: any = await import('@/services/api');
		const { default: i18n } = await import('@/i18n');
		const wrapper = mount(BaseMessageTemplateModal, {
			props: {
				open: true,
				template: { id: 'tpl-edit', name: 'Edición global', type: 'GENERAL', message: 'x' } as any,
				isGlobal: true,
			},
			global: { plugins: [i18n] },
		});
		await flushPromises();

		expect(apiMod.api.get).not.toHaveBeenCalled();
		expect(warning(wrapper).exists()).toBe(false);
	});
});
