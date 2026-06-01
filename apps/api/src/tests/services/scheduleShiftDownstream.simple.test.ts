/**
 * shiftDownstream — pure logic tests for the per-item shift ("+5/-5" del coordinador).
 *
 * Mirrors the math, propagation and status rules in
 * `retreatScheduleService.ts:shiftDownstream()` without booting the DB.
 *
 * The service:
 *   1. Toma el item objetivo y (si propagate) todos los items del mismo (retreatId, day)
 *      con startTime >= item.startTime.
 *   2. Desplaza startTime/endTime por minutesDelta.
 *   3. Marca `delayed` SOLO si va realmente tarde:
 *        minutesDelta > 0 && status === 'pending' && startTime <= now
 *      (retiro no iniciado / actividad futura -> solo reprograma, conserva status;
 *       active/completed/skipped nunca se sobre-escriben).
 */

type ItemStatus = 'pending' | 'active' | 'completed' | 'delayed' | 'skipped';

interface MockItem {
	id: string;
	retreatId: string;
	day: number;
	startTime: Date;
	endTime: Date;
	status: ItemStatus;
}

/** Mirror of retreatScheduleService.shiftDownstream(): pure logic */
function shiftDownstream(
	items: MockItem[],
	id: string,
	minutesDelta: number,
	now: number,
	propagate = true,
): MockItem[] {
	const target = items.find((it) => it.id === id);
	if (!target) return items;

	const affectedIds = new Set<string>([target.id]);
	if (propagate) {
		for (const x of items) {
			if (
				x.retreatId === target.retreatId &&
				x.day === target.day &&
				x.startTime.getTime() >= target.startTime.getTime()
			) {
				affectedIds.add(x.id);
			}
		}
	}

	return items.map((x) => {
		if (!affectedIds.has(x.id)) return x;
		const isLate = minutesDelta > 0 && x.status === 'pending' && x.startTime.getTime() <= now;
		return {
			...x,
			startTime: new Date(x.startTime.getTime() + minutesDelta * 60_000),
			endTime: new Date(x.endTime.getTime() + minutesDelta * 60_000),
			status: isLate ? 'delayed' : x.status,
		};
	});
}

function makeItem(overrides: Partial<MockItem> = {}): MockItem {
	return {
		id: overrides.id ?? 'item-1',
		retreatId: overrides.retreatId ?? 'retreat-A',
		day: overrides.day ?? 1,
		startTime: overrides.startTime ?? new Date('2026-06-06T01:00:00Z'),
		endTime: overrides.endTime ?? new Date('2026-06-06T01:30:00Z'),
		status: overrides.status ?? 'pending',
	};
}

describe('shiftDownstream — per-item shift + delay rule', () => {
	const NOW = new Date('2026-06-06T02:00:00Z').getTime();

	it('shifts the target and all later items of the same day', () => {
		const items = [
			makeItem({ id: 'a', startTime: new Date('2026-06-06T01:00:00Z'), endTime: new Date('2026-06-06T01:30:00Z') }),
			makeItem({ id: 'b', startTime: new Date('2026-06-06T02:00:00Z'), endTime: new Date('2026-06-06T02:30:00Z') }),
			makeItem({ id: 'c', startTime: new Date('2026-06-06T03:00:00Z'), endTime: new Date('2026-06-06T03:30:00Z') }),
		];
		const result = shiftDownstream(items, 'b', 10, NOW);
		expect(result[0].startTime.toISOString()).toBe('2026-06-06T01:00:00.000Z'); // 'a' antes -> intacto
		expect(result[1].startTime.toISOString()).toBe('2026-06-06T02:10:00.000Z'); // 'b' desplazado
		expect(result[2].startTime.toISOString()).toBe('2026-06-06T03:10:00.000Z'); // 'c' desplazado
	});

	it('does NOT propagate when propagate=false (solo el item objetivo)', () => {
		const items = [
			makeItem({ id: 'b', startTime: new Date('2026-06-06T02:00:00Z'), endTime: new Date('2026-06-06T02:30:00Z') }),
			makeItem({ id: 'c', startTime: new Date('2026-06-06T03:00:00Z'), endTime: new Date('2026-06-06T03:30:00Z') }),
		];
		const result = shiftDownstream(items, 'b', 10, NOW, false);
		expect(result[0].startTime.toISOString()).toBe('2026-06-06T02:10:00.000Z'); // 'b'
		expect(result[1].startTime.toISOString()).toBe('2026-06-06T03:00:00.000Z'); // 'c' intacto
	});

	describe('regla de `delayed` (el bug que originó San Agustín)', () => {
		it('+N en item futuro NO marca delayed — solo reprograma', () => {
			// startTime futuro respecto a now -> reprogramación, conserva pending
			const items = [makeItem({ id: 'a', startTime: new Date('2026-06-06T05:00:00Z'), endTime: new Date('2026-06-06T05:30:00Z') })];
			const result = shiftDownstream(items, 'a', 5, NOW);
			expect(result[0].status).toBe('pending');
			expect(result[0].startTime.toISOString()).toBe('2026-06-06T05:05:00.000Z');
		});

		it('+N en item que YA debía iniciar (startTime <= now) y pending SÍ marca delayed', () => {
			const items = [makeItem({ id: 'a', startTime: new Date('2026-06-06T01:30:00Z'), endTime: new Date('2026-06-06T02:00:00Z') })];
			const result = shiftDownstream(items, 'a', 5, NOW);
			expect(result[0].status).toBe('delayed');
		});

		it('-N (mover antes) nunca marca delayed', () => {
			const items = [makeItem({ id: 'a', startTime: new Date('2026-06-06T01:30:00Z'), endTime: new Date('2026-06-06T02:00:00Z') })];
			const result = shiftDownstream(items, 'a', -5, NOW);
			expect(result[0].status).toBe('pending');
		});

		it('propagación: items pasados pasan a delayed, futuros siguen pending', () => {
			const items = [
				makeItem({ id: 'past', startTime: new Date('2026-06-06T01:30:00Z'), endTime: new Date('2026-06-06T01:45:00Z') }),
				makeItem({ id: 'future', startTime: new Date('2026-06-06T04:00:00Z'), endTime: new Date('2026-06-06T04:30:00Z') }),
			];
			const result = shiftDownstream(items, 'past', 5, NOW);
			expect(result[0].status).toBe('delayed'); // ya debía iniciar
			expect(result[1].status).toBe('pending'); // futuro -> solo reprograma
		});

		it('no sobre-escribe status de completed/active/skipped aunque +N y ya pasaron', () => {
			const items = [
				makeItem({ id: 'done', status: 'completed', startTime: new Date('2026-06-06T01:30:00Z'), endTime: new Date('2026-06-06T01:45:00Z') }),
				makeItem({ id: 'live', status: 'active', startTime: new Date('2026-06-06T01:40:00Z'), endTime: new Date('2026-06-06T01:55:00Z') }),
				makeItem({ id: 'skip', status: 'skipped', startTime: new Date('2026-06-06T01:50:00Z'), endTime: new Date('2026-06-06T01:55:00Z') }),
			];
			const result = shiftDownstream(items, 'done', 5, NOW);
			expect(result[0].status).toBe('completed');
			expect(result[1].status).toBe('active');
			expect(result[2].status).toBe('skipped');
		});
	});

	it('no toca items de otro día ni de otro retiro al propagar', () => {
		const items = [
			makeItem({ id: 'a', day: 1, retreatId: 'retreat-A', startTime: new Date('2026-06-06T02:00:00Z'), endTime: new Date('2026-06-06T02:30:00Z') }),
			makeItem({ id: 'otherDay', day: 2, retreatId: 'retreat-A', startTime: new Date('2026-06-06T03:00:00Z'), endTime: new Date('2026-06-06T03:30:00Z') }),
			makeItem({ id: 'otherRetreat', day: 1, retreatId: 'retreat-B', startTime: new Date('2026-06-06T03:00:00Z'), endTime: new Date('2026-06-06T03:30:00Z') }),
		];
		const result = shiftDownstream(items, 'a', 30, NOW);
		expect(result[0].startTime.toISOString()).toBe('2026-06-06T02:30:00.000Z'); // a
		expect(result[1].startTime.toISOString()).toBe('2026-06-06T03:00:00.000Z'); // otro día intacto
		expect(result[2].startTime.toISOString()).toBe('2026-06-06T03:00:00.000Z'); // otro retiro intacto
	});
});
