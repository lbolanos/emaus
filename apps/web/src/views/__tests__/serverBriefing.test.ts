import { describe, it, expect } from 'vitest';
import { buildBriefings, pickAutoItem } from '../serverBriefing';
import type { RetreatScheduleItemDTO } from '@/services/api';

function makeItem(overrides: Partial<RetreatScheduleItemDTO> = {}): RetreatScheduleItemDTO {
	return {
		id: 'I1',
		retreatId: 'R',
		name: 'Actividad',
		type: 'charla',
		day: 1,
		startTime: '2026-11-27T10:00:00',
		endTime: '2026-11-27T11:00:00',
		durationMinutes: 60,
		orderInDay: 1,
		status: 'pending',
		blocksSantisimoAttendance: false,
		responsables: [],
		...overrides,
	} as RetreatScheduleItemDTO;
}

const makeServer = (id: string, firstName = 'Servidor', lastName = '') =>
	({ id, firstName, lastName, nickname: '', type: 'server' }) as any;
const makeResp = (id: string, name: string, participantId: string | null = null) =>
	({ id, name, participantId, isActive: true }) as any;

describe('pickAutoItem', () => {
	it('elige el item active', () => {
		const items = [makeItem({ id: 'A', status: 'pending' }), makeItem({ id: 'B', status: 'active' })];
		expect(pickAutoItem(items)?.id).toBe('B');
	});

	it('devuelve null si no hay ninguno active', () => {
		expect(pickAutoItem([makeItem({ status: 'pending' }), makeItem({ status: 'completed' })])).toBeNull();
		expect(pickAutoItem([])).toBeNull();
	});

	it('con dos activos (paralelos) toma el de menor (día, hora)', () => {
		const items = [
			makeItem({ id: 'LATE', status: 'active', day: 2, startTime: '2026-11-28T09:00:00' }),
			makeItem({ id: 'EARLY', status: 'active', day: 1, startTime: '2026-11-28T09:00:00' }),
		];
		expect(pickAutoItem(items)?.id).toBe('EARLY');
	});
});

describe('buildBriefings', () => {
	const baseArgs = () => ({
		items: [] as RetreatScheduleItemDTO[],
		chosenItem: null as RetreatScheduleItemDTO | null,
		servers: [makeServer('P1', 'Ana'), makeServer('P2', 'Bea')],
		responsibilities: [] as any[],
		teams: [] as any[],
		documents: null as Record<string, any> | null,
	});

	it('agrupa en escena a responsables y titular, con dedup cuando es ambos', () => {
		const chosen = makeItem({
			id: 'M1',
			name: 'Lectura del Camino',
			responsabilityId: 'R1',
			responsables: [{ participantId: 'P1', role: 'Apoyo' }],
		});
		const args = {
			...baseArgs(),
			items: [chosen],
			chosenItem: chosen,
			responsibilities: [makeResp('R1', 'Lectura del Camino', 'P1')],
		};
		const { onStage, others } = buildBriefings(args);
		expect(onStage).toHaveLength(1);
		expect(onStage[0].participantId).toBe('P1');
		// Un solo entry para el item, con los DOS roles combinados
		expect(onStage[0].dayItems).toHaveLength(1);
		expect(onStage[0].rolesHere).toEqual(['Lectura del Camino (titular)', 'Apoyo']);
		expect(others.map((b) => b.participantId)).toEqual(['P2']);
	});

	it('el titular sale por responsibilities.participantId aunque el item no lo liste en responsables', () => {
		const chosen = makeItem({ id: 'M1', name: 'Comedor', responsabilityId: 'R1' });
		const args = {
			...baseArgs(),
			items: [chosen],
			chosenItem: chosen,
			responsibilities: [makeResp('R1', 'Comedor', 'P2')],
		};
		const { onStage } = buildBriefings(args);
		expect(onStage.map((b) => b.participantId)).toEqual(['P2']);
		expect(onStage[0].rolesHere).toEqual(['Comedor (titular)']);
	});

	it('el rol textual del responsable se respeta (no siempre es Apoyo)', () => {
		const chosen = makeItem({
			id: 'M1',
			responsables: [{ participantId: 'P1', role: 'Música' }],
		});
		const { onStage } = buildBriefings({ ...baseArgs(), items: [chosen], chosenItem: chosen });
		expect(onStage[0].rolesHere).toEqual(['Música']);
	});

	it('nextMoment excluye completed y lo anterior al elegido; null si no hay nada después', () => {
		const chosen = makeItem({ id: 'M2', day: 1, startTime: '2026-11-27T12:00:00' });
		const earlier = makeItem({ id: 'M1', day: 1, startTime: '2026-11-27T10:00:00' });
		const completed = makeItem({
			id: 'M3',
			day: 1,
			startTime: '2026-11-27T14:00:00',
			status: 'completed',
		});
		const next = makeItem({ id: 'M4', day: 1, startTime: '2026-11-27T16:00:00' });
		const items = [chosen, earlier, completed, next];
		const servers = [makeServer('P1', 'Ana')];
		// P1 es responsable de los cuatro momentos
		const withResponsables = items.map((i) => ({
			...i,
			responsables: [{ participantId: 'P1', role: 'Apoyo' }],
		}));
		const args = { ...baseArgs(), items: withResponsables, chosenItem: chosen, servers };
		const { onStage } = buildBriefings(args);
		expect(onStage[0].dayItems.map((e) => e.item.id)).toEqual(['M1', 'M2', 'M3', 'M4']);
		expect(onStage[0].nextMoment?.item.id).toBe('M4');
	});

	it('dayItems filtra por el día del item elegido, no por "hoy"', () => {
		const chosen = makeItem({ id: 'M2', day: 2, startTime: '2026-11-28T12:00:00' });
		const day1 = makeItem({ id: 'D1', day: 1, startTime: '2026-11-27T12:00:00' });
		const day2 = makeItem({ id: 'D2', day: 2, startTime: '2026-11-28T15:00:00' });
		const withResponsables = [chosen, day1, day2].map((i) => ({
			...i,
			responsables: [{ participantId: 'P1', role: 'Apoyo' }],
		}));
		const { onStage } = buildBriefings({
			...baseArgs(),
			items: withResponsables,
			chosenItem: chosen,
		});
		expect(onStage[0].dayItems.map((e) => e.item.id)).toEqual(['M2', 'D2']);
	});

	it('los documents viajan al briefing por participantId; pid ajeno queda en null', () => {
		const documents = {
			P1: {
				moments: [{ dayLabel: 'Viernes', time: '10:00', name: 'X', documents: [] }],
				responsibilityDocuments: [],
				table: { name: 'Mesa 3', role: 'Colíder' },
			},
		};
		const chosen = makeItem({ id: 'M1' });
		const full = buildBriefings({
			...baseArgs(),
			items: [chosen],
			chosenItem: chosen,
			documents,
		});
		const all = [...full.onStage, ...full.others];
		const p1 = all.find((b) => b.participantId === 'P1');
		const p2 = all.find((b) => b.participantId === 'P2');
		expect(p1?.documents?.table?.name).toBe('Mesa 3');
		expect(p2?.documents).toBeNull();
	});

	it('excluye caminantes, cancelados, otros tipos y el dato legacy "(eliminado)"', () => {
		const chosen = makeItem({ id: 'M1' });
		const servers = [
			makeServer('P1', 'Ana'),
			{ id: 'W1', firstName: 'Walker', lastName: '', nickname: '', type: 'walker' } as any,
			{ id: 'X1', firstName: 'X', lastName: '', nickname: '', type: 'server', isCancelled: true } as any,
			{ id: 'PS1', firstName: 'Partial', lastName: '', nickname: '', type: 'partial_server' } as any,
			// legacy San Agustín: participante renombrado "(eliminado)" al borrarse
			{ id: 'DEL', firstName: '(eliminado)', lastName: '', nickname: '', type: 'server' } as any,
		];
		const { onStage, others } = buildBriefings({
			...baseArgs(),
			items: [chosen],
			chosenItem: chosen,
			servers,
		});
		const all = [...onStage, ...others].map((b) => b.participantId);
		expect(all).toEqual(['P1', 'PS1']);
	});

	it('sin item elegido (auto sin activos) todos caen en others, sin onStage', () => {
		const { onStage, others } = buildBriefings(baseArgs());
		expect(onStage).toHaveLength(0);
		expect(others.map((b) => b.participantId)).toEqual(['P1', 'P2']);
		expect(others[0].nextMoment).toBeNull();
		expect(others[0].dayItems).toEqual([]);
	});
});
