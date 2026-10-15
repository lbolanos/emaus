import { nextTableName, tableNumberOf } from '@/utils/tableNaming';

describe('tableNaming', () => {
	describe('tableNumberOf', () => {
		test('reads the trailing number of the usual names', () => {
			expect(tableNumberOf('Mesa 9')).toBe(9);
			expect(tableNumberOf('09')).toBe(9);
			expect(tableNumberOf('Table 3')).toBe(3);
			expect(tableNumberOf('  Mesa 12 ')).toBe(12);
		});

		test('ignores names that are not a plain numbered table', () => {
			expect(tableNumberOf('Mesa San Pedro')).toBeNull();
			expect(tableNumberOf('Mesa 2B')).toBeNull();
			expect(tableNumberOf('')).toBeNull();
		});
	});

	describe('nextTableName', () => {
		test('starts at Mesa 1 for a retreat without tables', () => {
			expect(nextTableName([])).toBe('Mesa 1');
		});

		test('follows the stored numbering, not the number of tables', () => {
			expect(nextTableName(['Mesa 1', 'Mesa 2', 'Mesa 3'])).toBe('Mesa 4');
			// 8 tables listed but one of them is already "Mesa 9": counting gave a second "Mesa 9".
			expect(
				nextTableName(['Mesa 1', 'Mesa 2', 'Mesa 3', 'Mesa 4', 'Mesa 5', 'Mesa 6', 'Mesa 7', 'Mesa 9']),
			).toBe('Mesa 8');
		});

		test('fills the gap before growing: Mesa 10 exists after Mesa 9 and before Mesa 11', () => {
			const names = [...Array.from({ length: 9 }, (_, i) => `Mesa ${i + 1}`), 'Mesa 11'];
			expect(nextTableName(names)).toBe('Mesa 10');
		});

		test('counts zero-padded imported names as their number', () => {
			expect(nextTableName(['01', '02', '03'])).toBe('Mesa 4');
		});

		test('skips non-numbered names when choosing the number', () => {
			expect(nextTableName(['Mesa 1', 'Mesa San Pedro'])).toBe('Mesa 2');
		});
	});
});
