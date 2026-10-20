/**
 * Lista de envío con marca de "ya enviado" (specs/ux-mam-responsabilidades,
 * R14): "Por servidor" en Responsabilidades y el diálogo de líderes en Mesas. El nombre
 * se ve completo (el popover anterior lo recortaba a cero), la marca sale de
 * `sent` por persona, y el filtro "Sin enviar" y el botón emiten lo esperado.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BriefingSendList from '../BriefingSendList.vue';

const row = (key: string, id: string, firstName: string, lastName: string, lines: string[]) => ({
	key,
	participant: { id, firstName, lastName, type: 'server' } as any,
	lines,
});

const rows = [
	row('s1', 's1', 'José Luis', 'García Ramírez', ['Cocina, Compras', '2 responsabilidades']),
	row('s2', 's2', 'María', 'López', ['Mesa 3 · Colíder 1']),
];
const sent = { s1: { sentAt: '2026-10-12T15:00:00.000Z', messageType: 'whatsapp' as const } };

const mountList = (props: Record<string, unknown> = {}) =>
	mount(BriefingSendList, {
		props: { rows, sent, emptyText: 'vacío', ...props },
		global: { mocks: { $t: (k: string) => k } },
	});

const items = (w: ReturnType<typeof mountList>) => w.findAll('[data-testid="briefing-row"]');

describe('BriefingSendList', () => {
	it('shows each name and its detail lines', () => {
		const w = mountList();
		expect(items(w)).toHaveLength(2);
		expect(items(w)[0].text()).toContain('José Luis');
		expect(items(w)[0].text()).toContain('Cocina, Compras');
		expect(items(w)[0].text()).toContain('2 responsabilidades');
		expect(items(w)[1].text()).toContain('Mesa 3 · Colíder 1');
	});

	it('marks who already got it, per person', () => {
		const w = mountList();
		const status = w.findAll('[data-testid="sent-status"]').map((s) => s.text());
		expect(status[0]).toContain('briefingList.sentOn');
		expect(status[1]).toContain('briefingList.notSent');
		expect(items(w)[0].text()).toContain('briefingList.resend');
		expect(items(w)[1].text()).toContain('briefingList.send');
	});

	it('marks every row of a person who appears twice (two tables)', () => {
		const w = mountList({ rows: [...rows, row('s1-b', 's1', 'José Luis', 'García Ramírez', ['Mesa 5 · Líder'])] });
		const status = w.findAll('[data-testid="sent-status"]').map((s) => s.text());
		expect(status.filter((s) => s.includes('sentOn'))).toHaveLength(2);
	});

	it('filters to the ones still pending', async () => {
		const w = mountList();
		const pendingBtn = w.findAll('button').find((b) => b.text().includes('filterPending'));
		await pendingBtn!.trigger('click');
		expect(items(w)).toHaveLength(1);
		expect(items(w)[0].text()).toContain('María');
	});

	it('keeps the filter in the parent with v-model:filter (Mesas reopens the list after each send)', async () => {
		const w = mountList({ filter: 'pending' });
		expect(items(w)).toHaveLength(1);
		const allBtn = w.findAll('button').find((b) => b.text().includes('filterAll'));
		await allBtn!.trigger('click');
		expect(w.emitted('update:filter')?.[0]).toEqual(['all']);
	});

	it('says everyone got it when nothing is pending, and shows the empty text otherwise', async () => {
		const w = mountList({ sent: { ...sent, s2: sent.s1 } });
		const pendingBtn = w.findAll('button').find((b) => b.text().includes('filterPending'));
		await pendingBtn!.trigger('click');
		expect(items(w)).toHaveLength(0);
		expect(w.text()).toContain('briefingList.emptyPending');
		expect(mountList({ rows: [] }).text()).toContain('vacío');
	});

	it('emits send with the row', async () => {
		const w = mountList();
		await items(w)[1].find('button').trigger('click');
		expect(w.emitted('send')?.[0]?.[0]).toMatchObject({ key: 's2', participant: { id: 's2' } });
	});

	it('shows the notices and the marks error', () => {
		const w = mountList({ notices: ['sin documentos'], sentFailed: true });
		expect(w.text()).toContain('sin documentos');
		expect(w.text()).toContain('briefingList.sentError');
	});
});
