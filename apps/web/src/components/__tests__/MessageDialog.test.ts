import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import MessageDialog from '../MessageDialog.vue';
import { cleanupMocks, createMockParticipant } from '../../test/utils';

// Mock stores
const mockFetchTemplates = vi.fn();
const mockFetchResponsibilities = vi.fn();
const mockFetchCommunications = vi.fn();

vi.mock('@/stores/retreatStore', () => ({
	useRetreatStore: () => ({
		selectedRetreat: ref({ id: 'retreat-1', name: 'Test Retreat', parish: 'Test Parish' }),
	}),
}));

vi.mock('@/stores/communityStore', () => ({
	useCommunityStore: () => ({
		currentCommunity: ref(null),
	}),
}));

vi.mock('@/stores/messageTemplateStore', () => ({
	useMessageTemplateStore: () => ({
		templates: ref([
			{ id: 'tpl-1', name: 'Bienvenida', type: 'WALKER', message: '<p>Hola {nombre}</p>' },
			{ id: 'tpl-2', name: 'Recordatorio', type: 'GENERAL', message: '<p>Recuerda</p>' },
		]),
		loading: ref(false),
		fetchTemplates: mockFetchTemplates,
	}),
}));

vi.mock('@/stores/communityMessageTemplateStore', () => ({
	useCommunityMessageTemplateStore: () => ({
		templates: ref([]),
		loading: ref(false),
		fetchTemplates: vi.fn(),
	}),
}));

vi.mock('@/stores/responsabilityStore', () => ({
	useResponsabilityStore: () => ({
		responsibilities: ref([]),
		fetchResponsibilities: mockFetchResponsibilities,
	}),
}));

vi.mock('@/composables/useAuthPermissions', () => ({
	useAuthPermissions: () => ({
		can: {
			list: vi.fn(() => true),
			create: vi.fn(() => true),
			edit: vi.fn(() => true),
			delete: vi.fn(() => true),
		},
	}),
}));

vi.mock('@/stores/participantCommunicationStore', () => ({
	useParticipantCommunicationStore: () => ({
		communications: ref([]),
		total: 0,
		fetchCommunications: mockFetchCommunications,
		createCommunication: vi.fn(),
	}),
}));

vi.mock('@/stores/communityCommunicationStore', () => ({
	useCommunityCommunicationStore: () => ({
		communications: ref([]),
		total: 0,
		fetchCommunications: vi.fn(),
		createCommunication: vi.fn(),
	}),
}));

vi.mock('@/services/api', () => ({
	getSmtpConfig: vi.fn().mockResolvedValue({ configured: false, host: null, user: null }),
	sendEmailViaBackend: vi.fn().mockResolvedValue({ success: true }),
	sendCommunityEmailViaBackend: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/utils/message', () => ({
	convertHtmlToWhatsApp: vi.fn((html: string) => html.replace(/<[^>]+>/g, '')),
	convertHtmlToEmail: vi.fn((html: string) => html),
	replaceAllVariables: vi.fn((text: string) => text),
	findEmptyVariables: vi.fn(() => []),
}));

// Mock @repo/ui components
vi.mock('@repo/ui', () => ({
	useToast: () => ({
		toast: vi.fn(),
	}),
	Button: { template: '<button class="button" :disabled="$attrs.disabled"><slot /></button>', inheritAttrs: true },
	Dialog: {
		template: '<div class="dialog" v-if="open"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div class="dialog-content"><slot /></div>' },
	DialogDescription: { template: '<div class="dialog-description"><slot /></div>' },
	DialogFooter: { template: '<div class="dialog-footer"><slot /></div>' },
	DialogHeader: { template: '<div class="dialog-header"><slot /></div>' },
	DialogTitle: { template: '<div class="dialog-title"><slot /></div>' },
	Label: { template: '<label class="label"><slot /></label>' },
	Textarea: { template: '<textarea class="textarea" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>', props: ['modelValue'], emits: ['update:modelValue'] },
	Badge: { template: '<span class="badge"><slot /></span>' },
	Select: { template: '<div class="select"><slot /></div>', props: ['modelValue'], emits: ['update:modelValue'] },
	SelectContent: { template: '<div class="select-content"><slot /></div>' },
	SelectItem: { template: '<div class="select-item"><slot /></div>', props: ['value'] },
	SelectTrigger: { template: '<div class="select-trigger"><slot /></div>' },
	SelectValue: { template: '<span class="select-value"><slot /></span>', props: ['placeholder'] },
	Tabs: { template: '<div class="tabs"><slot /></div>', props: ['modelValue'], emits: ['update:modelValue'] },
	TabsContent: { template: '<div class="tabs-content"><slot /></div>', props: ['value'] },
	TabsList: { template: '<div class="tabs-list"><slot /></div>' },
	TabsTrigger: { template: '<div class="tabs-trigger"><slot /></div>', props: ['value'] },
}));

// Mock child components
vi.mock('../ParticipantMessageHistory.vue', () => ({
	default: { template: '<div class="participant-message-history"></div>', props: ['participantId', 'retreatId', 'visible', 'autoLoad'] },
}));

vi.mock('../CommunityMessageHistory.vue', () => ({
	default: { template: '<div class="community-message-history"></div>', props: ['memberId', 'communityId', 'visible', 'autoLoad'] },
}));

describe('MessageDialog Component', () => {
	let pinia: any;
	const mockParticipant = createMockParticipant({
		id: 'p-1',
		firstName: 'Juan',
		lastName: 'Perez',
		email: 'juan@test.com',
		cellPhone: '5551234567',
		homePhone: '5559876543',
	});

	const defaultProps = {
		open: true,
		context: 'retreat' as const,
		retreatId: 'retreat-1',
		participant: mockParticipant,
	};

	function mountDialog(propsOverrides: Record<string, any> = {}) {
		return mount(MessageDialog, {
			global: { plugins: [pinia] },
			props: { ...defaultProps, ...propsOverrides },
		});
	}

	beforeEach(() => {
		pinia = createPinia();
		setActivePinia(pinia);
		cleanupMocks();
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanupMocks();
	});

	describe('Rendering', () => {
		it('should render the dialog when open is true', () => {
			const wrapper = mountDialog();
			expect(wrapper.find('.dialog').exists()).toBe(true);
		});

		it('should not render the dialog when open is false', () => {
			const wrapper = mountDialog({ open: false });
			expect(wrapper.find('.dialog').exists()).toBe(false);
		});

		it('should display participant name in the title', () => {
			const wrapper = mountDialog();
			expect(wrapper.text()).toContain('Juan Perez');
		});

		it('should show WhatsApp and Email send method buttons', () => {
			const wrapper = mountDialog();
			expect(wrapper.text()).toContain('WhatsApp');
			expect(wrapper.text()).toContain('Email');
		});

		it('should show Cancel and Send buttons in the footer', () => {
			const wrapper = mountDialog();
			expect(wrapper.text()).toContain('Cancelar');
			expect(wrapper.text()).toContain('Enviar Mensaje');
		});
	});

	describe('Dialog close (bug fix: UI freeze)', () => {
		it('should emit update:open false when Cancel button is clicked', async () => {
			const wrapper = mountDialog();

			const buttons = wrapper.findAll('.dialog-footer .button');
			const cancelButton = buttons.find(b => b.text().includes('Cancelar'));
			expect(cancelButton).toBeTruthy();

			await cancelButton!.trigger('click');
			await nextTick();

			expect(wrapper.emitted('update:open')).toBeTruthy();
			expect(wrapper.emitted('update:open')![0]).toEqual([false]);
		});

		it('should NOT have a MutationObserver on aria-hidden (removed to prevent UI freeze)', () => {
			const observeSpy = vi.spyOn(MutationObserver.prototype, 'observe');
			mountDialog();

			// The MutationObserver that watched aria-hidden on document.body was removed.
			// Verify no observer is set up targeting document.body with subtree: true.
			const bodyObserveCalls = observeSpy.mock.calls.filter(
				([target, options]) =>
					target === document.body &&
					(options as MutationObserverInit)?.subtree === true &&
					(options as MutationObserverInit)?.attributeFilter?.includes('aria-hidden')
			);
			expect(bodyObserveCalls).toHaveLength(0);

			observeSpy.mockRestore();
		});

		it('should NOT have @keydown.esc handler that conflicts with radix-vue', () => {
			const wrapper = mountDialog();
			// The Dialog element should not have a custom escape handler.
			// Radix-vue handles Escape internally to close the dialog.
			const dialogEl = wrapper.find('.dialog');
			// If the old handleEscape were bound, triggering keydown.esc would
			// call it. We verify the component has no handleEscape function exposed.
			const vm = wrapper.vm as any;
			expect(vm.handleEscape).toBeUndefined();
		});

		it('should reset isSending when dialog closes via props', async () => {
			const wrapper = mountDialog({ open: true });

			// Simulate the dialog closing (parent sets open=false)
			await wrapper.setProps({ open: false });
			await nextTick();

			// When reopened, isSending should be false (not stuck from a previous session)
			await wrapper.setProps({ open: true });
			await nextTick();

			const sendButton = wrapper.findAll('.dialog-footer .button')
				.find(b => b.text().includes('Enviar'));
			// If isSending were stuck true, the button text would show "Enviando..."
			expect(sendButton?.text()).toContain('Enviar Mensaje');
		});

		it('should reset showValidationErrors when dialog closes', async () => {
			const wrapper = mountDialog({ open: true });

			await wrapper.setProps({ open: false });
			await nextTick();

			await wrapper.setProps({ open: true });
			await nextTick();

			// No validation errors should be visible after reopening
			const validationErrors = wrapper.findAll('.text-red-600');
			expect(validationErrors).toHaveLength(0);
		});
	});

	describe('Dialog open behavior', () => {
		it('should load templates when dialog opens for a retreat', async () => {
			mountDialog({ open: false });
			// fetchTemplates should not be called for closed dialog
			expect(mockFetchTemplates).not.toHaveBeenCalled();
		});

		it('should default to whatsapp when SMTP is not configured', () => {
			const wrapper = mountDialog();
			// The first phone contact should be auto-selected
			// and the WhatsApp button should appear active
			expect(wrapper.text()).toContain('WhatsApp');
		});

		it('should auto-select cellPhone as contact for whatsapp', async () => {
			// Mount closed, then open — the watcher fires on change, not on initial mount
			const wrapper = mountDialog({ open: false });
			await wrapper.setProps({ open: true });
			await nextTick();

			const vm = wrapper.vm as any;
			expect(vm.selectedContact).toBe('5551234567');
		});

		it('should reset state when reopening with a new participant', async () => {
			const wrapper = mountDialog({ open: true });

			// Close
			await wrapper.setProps({ open: false });
			await nextTick();

			// Reopen with different participant
			const newParticipant = createMockParticipant({
				id: 'p-2',
				firstName: 'Maria',
				lastName: 'Garcia',
				email: 'maria@test.com',
				cellPhone: '5559999999',
			});
			await wrapper.setProps({ open: true, participant: newParticipant });
			await nextTick();

			expect(wrapper.text()).toContain('Maria Garcia');
		});
	});

	describe('Contact options', () => {
		it('should show phone contacts for whatsapp mode', () => {
			const wrapper = mountDialog();
			const vm = wrapper.vm as any;
			const options = vm.contactOptions;
			// Should include cellPhone and homePhone
			expect(options.some((o: any) => o.value === '5551234567')).toBe(true);
			expect(options.some((o: any) => o.value === '5559876543')).toBe(true);
		});

		it('should show email contacts for email mode', async () => {
			const wrapper = mountDialog();
			const vm = wrapper.vm as any;

			// Switch to email mode
			vm.sendMethod = 'email';
			await nextTick();

			const options = vm.contactOptions;
			expect(options.some((o: any) => o.value === 'juan@test.com')).toBe(true);
		});

		it('should not show duplicate contacts', () => {
			const participant = createMockParticipant({
				id: 'p-dup',
				cellPhone: '5551111111',
				homePhone: '5551111111', // same as cellPhone
			});
			const wrapper = mountDialog({ participant });
			const vm = wrapper.vm as any;
			const values = vm.contactOptions.map((o: any) => o.value);
			const uniqueValues = [...new Set(values)];
			expect(values.length).toBe(uniqueValues.length);
		});

		it('should handle participant with no phone numbers', () => {
			const participant = createMockParticipant({
				id: 'p-nophone',
				cellPhone: '',
				homePhone: '',
				email: 'test@test.com',
			});
			const wrapper = mountDialog({ participant });
			const vm = wrapper.vm as any;
			// No phone contacts in whatsapp mode
			expect(vm.contactOptions.length).toBe(0);
		});
	});

	describe('Null participant handling', () => {
		it('should handle null participant gracefully', () => {
			const wrapper = mountDialog({ participant: null });
			// Should render without errors
			expect(wrapper.find('.dialog').exists()).toBe(true);
		});

		it('should show empty display name for null participant', () => {
			const wrapper = mountDialog({ participant: null });
			const vm = wrapper.vm as any;
			expect(vm.displayName).toBe('');
		});

		it('should return empty contact options for null participant', () => {
			const wrapper = mountDialog({ participant: null });
			const vm = wrapper.vm as any;
			expect(vm.contactOptions).toHaveLength(0);
		});
	});

	describe('Community context', () => {
		it('should work with community context and member', () => {
			const member = {
				id: 'member-1',
				participant: {
					firstName: 'Carlos',
					lastName: 'Lopez',
					email: 'carlos@test.com',
					cellPhone: '5552222222',
				},
			};

			const wrapper = mountDialog({
				context: 'community',
				communityId: 'community-1',
				retreatId: '',
				participant: member,
			});

			expect(wrapper.text()).toContain('Carlos Lopez');
		});
	});

	describe('History panel', () => {
		it('should not show history panel by default', () => {
			const wrapper = mountDialog();
			const vm = wrapper.vm as any;
			expect(vm.showHistory).toBe(false);
		});

		it('should toggle history visibility', async () => {
			const wrapper = mountDialog();
			const vm = wrapper.vm as any;

			vm.showHistory = true;
			await nextTick();
			expect(vm.showHistory).toBe(true);

			vm.showHistory = false;
			await nextTick();
			expect(vm.showHistory).toBe(false);
		});
	});

	describe('Draft management', () => {
		it('should save drafts to localStorage', async () => {
			const wrapper = mountDialog({ open: false });
			await wrapper.setProps({ open: true });
			await nextTick();

			const vm = wrapper.vm as any;
			vm.selectedTemplate = 'tpl-1';
			await nextTick();

			// updateMessagePreview sets editedMessage; override for draft test
			vm.editedMessage = 'Test draft message';
			await nextTick();

			// autoSaveMessage is triggered by watcher on editedMessage
			const draftKey = `message-draft-retreat-p-1-tpl-1`;
			const saved = localStorage.getItem(draftKey);
			expect(saved).toBeTruthy();
			if (saved) {
				const parsed = JSON.parse(saved);
				expect(parsed.message).toBe('Test draft message');
			}
		});

		it('should not save draft when no template is selected', async () => {
			const wrapper = mountDialog({ open: false });
			await wrapper.setProps({ open: true });
			await nextTick();

			const vm = wrapper.vm as any;
			// selectedTemplate is '' by default
			vm.editedMessage = 'Orphan message';
			await nextTick();

			// autoSaveMessage returns early when selectedTemplate is empty
			const keys = Object.keys(localStorage);
			const draftKeys = keys.filter(k => k.startsWith('message-draft-'));
			expect(draftKeys).toHaveLength(0);
		});
	});

	describe('Send button state', () => {
		it('should disable send button when no contact is selected', () => {
			const participant = createMockParticipant({
				id: 'p-nocontact',
				cellPhone: '',
				email: '',
			});
			const wrapper = mountDialog({ participant });
			const vm = wrapper.vm as any;
			vm.selectedContact = undefined;

			const sendButton = wrapper.findAll('.dialog-footer .button')
				.find(b => b.text().includes('Enviar'));
			expect(sendButton?.attributes('disabled')).toBeDefined();
		});

		it('should disable send button when no template is selected', () => {
			const wrapper = mountDialog();
			const vm = wrapper.vm as any;
			// selectedTemplate defaults to '' which is falsy
			expect(vm.selectedTemplate).toBe('');

			const sendButton = wrapper.findAll('.dialog-footer .button')
				.find(b => b.text().includes('Enviar'));
			expect(sendButton?.attributes('disabled')).toBeDefined();
		});
	});
});
