import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import ConfirmationDialog from '../ConfirmationDialog.vue';
import { cleanupMocks } from '../../test/utils';

// Mock @repo/ui components
vi.mock('@repo/ui', () => ({
	Button: { template: '<button type="button" class="button"><slot /></button>' },
	Dialog: {
		template: '<div class="dialog" v-if="open"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div class="dialog-content"><slot /></div>' },
	DialogFooter: { template: '<div class="dialog-footer"><slot /></div>' },
	DialogHeader: { template: '<div class="dialog-header"><slot /></div>' },
	DialogTitle: { template: '<div class="dialog-title"><slot /></div>' },
}));

describe('ConfirmationDialog Component', () => {
	let pinia: any;

	beforeEach(() => {
		pinia = createPinia();
		setActivePinia(pinia);
		cleanupMocks();
	});

	afterEach(() => {
		cleanupMocks();
	});

	describe('Rendering', () => {
		it('should render the dialog when open is true', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Confirm Action',
					message: 'Are you sure you want to proceed?',
					confirmButtonText: 'Confirm',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.find('.dialog').exists()).toBe(true);
		});

		it('should not render the dialog when open is false', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: false,
					title: 'Confirm Action',
					message: 'Are you sure you want to proceed?',
					confirmButtonText: 'Confirm',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.find('.dialog').exists()).toBe(false);
		});

		it('should display the title', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Delete Item',
					message: 'Are you sure?',
					confirmButtonText: 'Delete',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.text()).toContain('Delete Item');
		});

		it('should display the message', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Confirm',
					message: 'This action cannot be undone.',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.text()).toContain('This action cannot be undone.');
		});

		it('should display both buttons', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Confirm',
					message: 'Are you sure?',
					confirmButtonText: 'Yes',
					cancelButtonText: 'No',
				},
			});

			const buttons = wrapper.findAll('.button');
			expect(buttons.length).toBe(2);
		});

		it('should display confirm button text', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Confirm',
					message: 'Are you sure?',
					confirmButtonText: 'Delete',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.text()).toContain('Delete');
		});

		it('should display cancel button text', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Confirm',
					message: 'Are you sure?',
					confirmButtonText: 'OK',
					cancelButtonText: 'Go Back',
				},
			});

			expect(wrapper.text()).toContain('Go Back');
		});
	});

	describe('User Interactions', () => {
		it('should emit close event when cancel button is clicked', async () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Confirm',
					message: 'Are you sure?',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			const buttons = wrapper.findAll('.button');
			// First button is cancel button
			await buttons[0].trigger('click');
			await nextTick();

			expect(wrapper.emitted('close')).toBeTruthy();
		});

		it('should emit confirm event when confirm button is clicked', async () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Confirm',
					message: 'Are you sure?',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			const buttons = wrapper.findAll('.button');
			// Second button is confirm button
			await buttons[1].trigger('click');
			await nextTick();

			expect(wrapper.emitted('confirm')).toBeTruthy();
		});

		it('should emit close with empty payload', async () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Confirm',
					message: 'Are you sure?',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			const buttons = wrapper.findAll('.button');
			await buttons[0].trigger('click');
			await nextTick();

			expect(wrapper.emitted('close')![0]).toEqual([]);
		});

		it('should emit confirm with empty payload', async () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Confirm',
					message: 'Are you sure?',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			const buttons = wrapper.findAll('.button');
			await buttons[1].trigger('click');
			await nextTick();

			expect(wrapper.emitted('confirm')![0]).toEqual([]);
		});
	});

	describe('Props Handling', () => {
		it('should accept open prop as boolean', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Test',
					message: 'Test message',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.props('open')).toBe(true);
		});

		it('should accept title prop as string', () => {
			const title = 'Delete Account';
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title,
					message: 'Test message',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.props('title')).toBe(title);
		});

		it('should accept message prop as string', () => {
			const message = 'This will permanently delete your account.';
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Test',
					message,
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.props('message')).toBe(message);
		});

		it('should accept confirmButtonText prop', () => {
			const confirmText = 'Yes, delete it';
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Test',
					message: 'Test message',
					confirmButtonText: confirmText,
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.props('confirmButtonText')).toBe(confirmText);
		});

		it('should accept cancelButtonText prop', () => {
			const cancelText = 'Keep it';
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Test',
					message: 'Test message',
					confirmButtonText: 'OK',
					cancelButtonText: cancelText,
				},
			});

			expect(wrapper.props('cancelButtonText')).toBe(cancelText);
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty title', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: '',
					message: 'Test message',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			// Component should render without errors
			expect(wrapper.find('.dialog').exists()).toBe(true);
		});

		it('should handle empty message', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Test',
					message: '',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			// Component should render without errors
			expect(wrapper.find('.dialog').exists()).toBe(true);
		});

		it('should handle special characters in message', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Confirm',
					message: 'Are you sure? <>&"\'',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.text()).toContain('Are you sure? <>&"\'');
		});

		it('should handle long messages', () => {
			const longMessage = 'A'.repeat(1000);
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Test',
					message: longMessage,
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			// Should render without errors
			expect(wrapper.find('.dialog').exists()).toBe(true);
		});
	});

	describe('Component Structure', () => {
		it('should render dialog content container', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Test',
					message: 'Message',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.find('.dialog-content').exists()).toBe(true);
		});

		it('should render dialog header', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Test',
					message: 'Message',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.find('.dialog-header').exists()).toBe(true);
		});

		it('should render dialog title', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Test',
					message: 'Message',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.find('.dialog-title').exists()).toBe(true);
		});

		it('should render dialog footer', () => {
			const wrapper = mount(ConfirmationDialog, {
				global: {
					plugins: [pinia],
				},
				props: {
					open: true,
					title: 'Test',
					message: 'Message',
					confirmButtonText: 'OK',
					cancelButtonText: 'Cancel',
				},
			});

			expect(wrapper.find('.dialog-footer').exists()).toBe(true);
		});
	});
});
