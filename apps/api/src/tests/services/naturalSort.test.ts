import {
	naturalCompare,
	sortByName,
	sortRetreatBedsNaturally,
} from '@/utils/naturalSort';

describe('naturalSort', () => {
	describe('naturalCompare', () => {
		test('orders "Mesa 2" before "Mesa 10"', () => {
			expect(naturalCompare('Mesa 2', 'Mesa 10')).toBeLessThan(0);
			expect(naturalCompare('Mesa 10', 'Mesa 2')).toBeGreaterThan(0);
		});

		test('is accent-insensitive', () => {
			expect(naturalCompare('árbol', 'ARBOL')).toBe(0);
		});
	});

	describe('sortByName', () => {
		test('orders names with numbers naturally', () => {
			const rows = [
				{ name: 'Mesa 11' },
				{ name: 'Mesa 1' },
				{ name: 'Mesa 10' },
				{ name: 'Mesa 2' },
			];
			expect(sortByName(rows).map((r) => r.name)).toEqual([
				'Mesa 1',
				'Mesa 2',
				'Mesa 10',
				'Mesa 11',
			]);
		});

		test('does not mutate the input array', () => {
			const rows = [{ name: 'Mesa 10' }, { name: 'Mesa 2' }];
			const original = [...rows];
			sortByName(rows);
			expect(rows).toEqual(original);
		});
	});

	describe('sortRetreatBedsNaturally', () => {
		test('orders by floor numerically, then roomNumber, then bedNumber', () => {
			const beds = [
				{ floor: 2, roomNumber: '10', bedNumber: '1' },
				{ floor: 1, roomNumber: '11', bedNumber: '2' },
				{ floor: 1, roomNumber: '2', bedNumber: '10' },
				{ floor: 1, roomNumber: '2', bedNumber: '2' },
				{ floor: 1, roomNumber: '11', bedNumber: '1' },
				{ floor: 1, roomNumber: '1', bedNumber: '1' },
			];

			const sorted = sortRetreatBedsNaturally(beds);
			expect(sorted).toEqual([
				{ floor: 1, roomNumber: '1', bedNumber: '1' },
				{ floor: 1, roomNumber: '2', bedNumber: '2' },
				{ floor: 1, roomNumber: '2', bedNumber: '10' },
				{ floor: 1, roomNumber: '11', bedNumber: '1' },
				{ floor: 1, roomNumber: '11', bedNumber: '2' },
				{ floor: 2, roomNumber: '10', bedNumber: '1' },
			]);
		});

		test('treats null floor as 0', () => {
			const beds = [
				{ floor: 1, roomNumber: '1', bedNumber: '1' },
				{ floor: null, roomNumber: '5', bedNumber: '1' },
			];
			const sorted = sortRetreatBedsNaturally(beds);
			expect(sorted[0].floor).toBeNull();
			expect(sorted[1].floor).toBe(1);
		});
	});
});
