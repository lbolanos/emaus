import { describe, it, expect, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import BaseMessageTemplateModal from '../BaseMessageTemplateModal.vue';
import RichTextEditor from '../RichTextEditor.vue';

/**
 * The editor mode (native textarea vs RichTextEditor) is FROZEN for the whole
 * editing session: it is evaluated once when the template loads and again when
 * the dialog opens, and it does NOT react to the message being edited.
 *
 * The live computed it replaced flipped the editor underneath the user the
 * instant the content gained an HTML tag (typing "<div>" or pasting a formatted
 * fragment into a WhatsApp template): tiptap parsed the plain text as HTML,
 * flattened every \n, swallowed the keystrokes typed after the swap, and the
 * first edit in the rich editor serialized the paragraph structure away.
 *
 * These specs pin the session-scoped contract with the REAL HTML_TAG_RE
 * (@/utils/message is not mocked).
 */

// tiptap doesn't mount in happy-dom. The stub keeps the v-model contract so a
// spec can simulate the editor changing the message.
vi.mock('../RichTextEditor.vue', () => ({
	default: {
		name: 'RichTextEditor',
		props: ['modelValue', 'placeholder', 't'],
		emits: ['update:modelValue'],
		template: '<div class="rich-editor-stub">{{ modelValue }}</div>',
	},
}));

// Only used on save; shaped minimally so the modal mounts without a backend.
vi.mock('@/stores/globalMessageTemplateStore', () => ({
	useGlobalMessageTemplateStore: () => ({ create: vi.fn(), update: vi.fn() }),
}));
vi.mock('@/stores/messageTemplateStore', () => ({
	useMessageTemplateStore: () => ({ createTemplate: vi.fn(), updateTemplate: vi.fn() }),
}));
vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({ selectedRetreat: null, selectedRetreatId: null }),
}));
vi.mock('@/services/api', () => ({
	getParticipantNextMeeting: vi.fn().mockResolvedValue(null),
	getParticipantShirtOrder: vi.fn().mockResolvedValue(null),
}));
// The preview branch renders through DOMPurify; not what these specs assert.
vi.mock('@/utils/sanitize', () => ({
	sanitizeHtml: (html: string) => html,
	sanitizeEmailHtml: (html: string) => html,
}));

// Local @repo/ui mock (the global one lacks ScrollArea, and these specs need
// two tweaks of their own):
//  - Dialog gates its slot on `open`, so close/reopen cycles are observable.
//  - Textarea renders as a div, NOT a <textarea>: the plain-text editor is a
//    native <textarea> and a second real one here (the HTML tab) would make
//    wrapper.find('textarea') ambiguous between the two edit surfaces.
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
		// Like the global stub: renders every panel at once so the edit surface
		// is reachable without driving the tab list.
		TabsContent: passthrough('TabsContent'),
		ScrollArea: passthrough('ScrollArea'),
	};
});

/** WhatsApp-format template: paragraphs are \n, emphasis is *asterisks*. */
const PLAIN_TEMPLATE = {
	id: 'tpl-whatsapp',
	name: 'Invitación (WhatsApp)',
	type: 'GENERAL',
	message: 'Hola {participant.nickname}\n\nTe esperamos el viernes\n\nTrae:\n- Biblia\n- Cuaderno',
};

/** Email legacy template: real HTML. */
const HTML_TEMPLATE = {
	id: 'tpl-email',
	name: 'Invitación (Email)',
	type: 'GENERAL',
	message: '<h1>Hola</h1><p>Línea uno</p><p>Línea dos</p>',
};

const mountModal = (template: unknown, open = true): VueWrapper<any> =>
	mount(BaseMessageTemplateModal, {
		props: { open, template: template as any },
	});

const plainEditor = (wrapper: VueWrapper<any>) => wrapper.find('textarea');
const richEditor = (wrapper: VueWrapper<any>) => wrapper.findComponent(RichTextEditor);

describe('BaseMessageTemplateModal — frozen editor mode', () => {
	it('opens a WhatsApp-format template in a native textarea, not the rich editor', () => {
		const wrapper = mountModal(PLAIN_TEMPLATE);

		expect(plainEditor(wrapper).exists()).toBe(true);
		expect(richEditor(wrapper).exists()).toBe(false);
		// The \n paragraph structure round-trips into the editing surface.
		expect((plainEditor(wrapper).element as HTMLTextAreaElement).value).toContain('\n\n');
		expect((plainEditor(wrapper).element as HTMLTextAreaElement).value).toContain('- Biblia');
	});

	it('opens an HTML template in the rich editor, not a textarea', () => {
		const wrapper = mountModal(HTML_TEMPLATE);

		expect(richEditor(wrapper).exists()).toBe(true);
		expect(plainEditor(wrapper).exists()).toBe(false);
	});

	it('keeps the textarea for the whole session even when the content gains an HTML tag', async () => {
		// The HIGH #2 regression: a live detector swapped the surface mid-edit
		// as soon as the message matched HTML_TAG_RE.
		const wrapper = mountModal(PLAIN_TEMPLATE);

		await plainEditor(wrapper).setValue('Hola\n\n<div>prueba</div>');
		await nextTick();

		expect(plainEditor(wrapper).exists()).toBe(true);
		expect(richEditor(wrapper).exists()).toBe(false);
		// Untouched round-trip: the tag is literal text and the \n survive.
		const value = (plainEditor(wrapper).element as HTMLTextAreaElement).value;
		expect(value).toBe('Hola\n\n<div>prueba</div>');
	});

	it('keeps the rich editor for the whole session even when the content becomes plain text', async () => {
		const wrapper = mountModal(HTML_TEMPLATE);

		richEditor(wrapper).vm.$emit('update:modelValue', 'solo texto plano sin tags');
		await nextTick();

		expect(richEditor(wrapper).exists()).toBe(true);
		expect(plainEditor(wrapper).exists()).toBe(false);
	});

	it('re-evaluates the mode when the dialog reopens with a different template', async () => {
		// Session 1: plain, and the user types a tag (mode must stay plain).
		const wrapper = mountModal(PLAIN_TEMPLATE);
		await plainEditor(wrapper).setValue('Hola\n\n<div>prueba</div>');

		// Close and open a DIFFERENT template: the new session picks up the new
		// format instead of inheriting the previous session's mode.
		await wrapper.setProps({ open: false });
		await wrapper.setProps({ template: HTML_TEMPLATE });
		await wrapper.setProps({ open: true });

		expect(richEditor(wrapper).exists()).toBe(true);
		expect(plainEditor(wrapper).exists()).toBe(false);

		// And back: reopening the plain template edits in a textarea again.
		await wrapper.setProps({ open: false });
		await wrapper.setProps({ template: PLAIN_TEMPLATE });
		await wrapper.setProps({ open: true });

		expect(plainEditor(wrapper).exists()).toBe(true);
		expect(richEditor(wrapper).exists()).toBe(false);
	});

	it('opens a brand-new template (no message yet) in the textarea', () => {
		// Empty content has no tags → plain mode. New WhatsApp templates start
		// here; typing the message must not depend on the detector.
		const wrapper = mountModal(null);

		expect(plainEditor(wrapper).exists()).toBe(true);
		expect(richEditor(wrapper).exists()).toBe(false);
	});
});
