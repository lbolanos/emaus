/**
 * The 📎 badge of a schedule moment opens its documents even when the retreat
 * has no responsibility for it: the API resolves `documentName` from the
 * template (e.g. "Texto: Dinámica de la Pared"). Before, the click returned
 * silently because the view only looked at `responsabilityId`.
 */
import { describe, it, expect, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

vi.mock('vue-router', () => ({
	useRoute: () => ({ params: { id: 'retreat-1' }, query: {} }),
	useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
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

const wallItem = {
	id: 'item-wall',
	retreatId: 'retreat-1',
	scheduleTemplateId: 'tpl-wall',
	name: 'Dinámica La Pared',
	type: 'dinamica',
	day: 2,
	startTime: '2026-10-18T02:15:00.000Z',
	endTime: '2026-10-18T02:40:00.000Z',
	durationMinutes: 25,
	orderInDay: 1,
	status: 'pending',
	responsabilityId: null,
	blocksSantisimoAttendance: false,
	responsables: [],
	documentName: 'Texto: Dinámica de la Pared',
	attachments: [
		{
			id: 'att-1',
			responsabilityName: 'Texto: Dinámica de la Pared',
			kind: 'file',
			fileName: 'pared.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 10,
			storageUrl: 'https://bucket/pared.pdf',
			sortOrder: 0,
		},
	],
};

vi.mock('@/services/api', () => ({
	api: { get: vi.fn(async () => ({ data: [] })), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
	apiErrorMessage: (e: unknown) => String(e),
	retreatScheduleApi: { list: vi.fn(async () => [wallItem]) },
	scheduleTemplateApi: { list: vi.fn(async () => []), listSets: vi.fn(async () => []) },
}));

vi.mock('@/services/realtime', () => ({
	getSocket: () => ({ connected: false, on: vi.fn(), off: vi.fn(), emit: vi.fn() }),
}));

// Read-only viewer: every `canManage.<area>` is a false ref.
vi.mock('@/composables/useAuthPermissions', async () => {
	const { ref } = await import('vue');
	return {
		useAuthPermissions: () => ({ canManage: new Proxy({}, { get: () => ref(false) }) }),
	};
});

vi.mock('@/composables/useMyParticipantId', async () => {
	const { computed } = await import('vue');
	return { useMyParticipantId: () => computed(() => null) };
});

vi.mock('@/components/ResponsabilityAttachmentsDialog.vue', () => ({
	default: {
		name: 'ResponsabilityAttachmentsDialog',
		props: ['open', 'responsabilityName', 'contextLabel', 'canManage'],
		template: '<div class="attachments-dialog-stub" />',
	},
}));
vi.mock('@/components/ScheduleItemEditModal.vue', () => ({
	default: { name: 'ScheduleItemEditModal', template: '<div />' },
}));
vi.mock('@/components/MamHelpDialog.vue', () => ({
	default: { name: 'MamHelpDialog', template: '<div />' },
}));
vi.mock('@/components/MamMoreActions.vue', () => ({
	default: { name: 'MamMoreActions', template: '<div />' },
}));

describe('MinuteByMinuteView — documents of a moment', () => {
	it('opens the inherited document of a moment without responsibility', async () => {
		setActivePinia(createPinia());
		const View = (await import('@/views/MinuteByMinuteView.vue')).default;
		const wrapper = mount(View, { global: { mocks: { $t: (k: string) => k } } });
		await flushPromises();

		const badge = wrapper.findAll('button').find((b) => b.text().includes('📎 1'));
		expect(badge).toBeTruthy();
		await badge!.trigger('click');
		await flushPromises();

		const dialog = wrapper.findComponent({ name: 'ResponsabilityAttachmentsDialog' });
		expect(dialog.exists()).toBe(true);
		expect(dialog.props('responsabilityName')).toBe('Texto: Dinámica de la Pared');
		expect(dialog.props('contextLabel')).toBe('Dinámica La Pared');
		wrapper.unmount();
	});
});
