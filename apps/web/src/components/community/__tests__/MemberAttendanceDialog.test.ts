import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import MemberAttendanceDialog from '../MemberAttendanceDialog.vue';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetMeetings = vi.fn();
const mockGetMemberAttendance = vi.fn();
const mockBulkRecord = vi.fn();

vi.mock('@/services/api', () => ({
	getCommunityMeetings: (...a: any[]) => mockGetMeetings(...a),
	getMemberAttendance: (...a: any[]) => mockGetMemberAttendance(...a),
	bulkRecordMemberAttendance: (...a: any[]) => mockBulkRecord(...a),
}));

vi.mock('@repo/utils', () => ({
	resolveMemberProfile: () => ({
		fullName: 'Everardo Govea',
		firstName: 'Everardo',
		lastName: 'Govea',
		email: '',
		cellPhone: '',
	}),
	formatDateInCommunityTimezone: (d: any) => new Date(d).toISOString().slice(0, 10),
}));

vi.mock('@repo/ui', () => ({
	Dialog: {
		template: '<div class="dialog" v-if="open"><slot /></div>',
		props: ['open'],
		emits: ['update:open'],
	},
	DialogContent: { template: '<div><slot /></div>' },
	DialogHeader: { template: '<div><slot /></div>' },
	DialogTitle: { template: '<h2><slot /></h2>' },
	DialogDescription: { template: '<p><slot /></p>' },
	DialogFooter: { template: '<div><slot /></div>' },
	Button: {
		template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
		props: ['variant', 'size', 'disabled'],
		emits: ['click'],
	},
	useToast: () => ({ toast: vi.fn() }),
}));

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const MEETINGS = [
	{ id: 'm1', title: 'R1', startDate: '2026-03-01T02:00:00.000Z', isAnnouncement: false, exceptionType: null },
	{ id: 'm2', title: 'R2', startDate: '2026-03-08T02:00:00.000Z', isAnnouncement: false, exceptionType: null },
	{ id: 'ann', title: 'ElAnuncio', startDate: '2026-03-02T02:00:00.000Z', isAnnouncement: true, exceptionType: null },
	{ id: 'cx', title: 'LaCancelada', startDate: '2026-03-03T02:00:00.000Z', isAnnouncement: false, exceptionType: 'cancelled' },
	{ id: 'fut', title: 'LaFutura', startDate: '2099-01-01T02:00:00.000Z', isAnnouncement: false, exceptionType: null },
];

const mountDialog = async () => {
	// El watch de `open` NO es immediate: montamos cerrado y luego abrimos para
	// disparar la carga (igual que en la vista real, donde el diálogo vive montado).
	const wrapper = mount(MemberAttendanceDialog, {
		props: { open: false, member: { id: 'mem1' }, communityId: 'c1', community: {} },
	});
	await wrapper.setProps({ open: true });
	await flushPromises();
	return wrapper;
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MemberAttendanceDialog', () => {
	beforeEach(() => {
		mockGetMeetings.mockReset();
		mockGetMemberAttendance.mockReset();
		mockBulkRecord.mockReset();
		mockGetMeetings.mockResolvedValue(MEETINGS);
		// El miembro asistió a m1, no a m2 (una sola llamada precarga todo).
		mockGetMemberAttendance.mockResolvedValue([{ meetingId: 'm1', attended: true }]);
		mockBulkRecord.mockResolvedValue({ updated: 1 });
	});

	it('excluye anuncios, canceladas y futuras; precarga con una sola llamada', async () => {
		const wrapper = await mountDialog();

		expect(mockGetMemberAttendance).toHaveBeenCalledTimes(1);
		expect(mockGetMemberAttendance).toHaveBeenCalledWith('c1', 'mem1');
		expect(wrapper.text()).toContain('R1');
		expect(wrapper.text()).toContain('R2');
		expect(wrapper.text()).not.toContain('ElAnuncio');
		expect(wrapper.text()).not.toContain('LaCancelada');
		expect(wrapper.text()).not.toContain('LaFutura');
		// Asistió a 1 de las 2 reuniones válidas.
		expect(wrapper.text()).toContain('1 de 2 marcadas');
	});

	it('Guardar está deshabilitado sin cambios y se habilita tras togglear', async () => {
		const wrapper = await mountDialog();
		const saveBtn = () => wrapper.findAll('button').find((b) => b.text().trim() === 'common.save')!;

		expect(saveBtn().attributes('disabled')).toBeDefined();

		const r2 = wrapper.findAll('button').find((b) => b.text().includes('R2'))!;
		await r2.trigger('click');

		expect(saveBtn().attributes('disabled')).toBeUndefined();
	});

	it('guardar envía en UNA llamada bulk solo las reuniones que cambiaron', async () => {
		const wrapper = await mountDialog();

		// Marcar R2 (antes ausente). R1 no se toca → no debe re-enviarse.
		const r2 = wrapper.findAll('button').find((b) => b.text().includes('R2'))!;
		await r2.trigger('click');

		const saveBtn = wrapper.findAll('button').find((b) => b.text().trim() === 'common.save')!;
		await saveBtn.trigger('click');
		await flushPromises();

		expect(mockBulkRecord).toHaveBeenCalledTimes(1);
		expect(mockBulkRecord).toHaveBeenCalledWith('c1', 'mem1', [{ meetingId: 'm2', attended: true }]);
	});
});
