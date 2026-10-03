import {
	isImportRoleConflict,
	importRoleConflictReason,
} from '../../services/importRoleConflict';

describe('isImportRoleConflict', () => {
	test('walker row over an angelito record is a conflict (borrowed email, §25.8)', () => {
		expect(isImportRoleConflict('partial_server', 'walker')).toBe(true);
	});

	test('walker row over a server record is a conflict', () => {
		expect(isImportRoleConflict('server', 'walker')).toBe(true);
	});

	test('server row over a walker record is a conflict', () => {
		expect(isImportRoleConflict('walker', 'server')).toBe(true);
	});

	test('re-importing the same walker is not a conflict', () => {
		expect(isImportRoleConflict('walker', 'walker')).toBe(false);
	});

	test('a waitlisted walker re-imported as walker is the same person', () => {
		expect(isImportRoleConflict('waiting', 'walker')).toBe(false);
		expect(isImportRoleConflict('walker', 'waiting')).toBe(false);
	});

	test('server and angelito are both team: not a conflict', () => {
		expect(isImportRoleConflict('server', 'partial_server')).toBe(false);
	});

	test('a row without tipousuario declares nothing, whatever the existing role', () => {
		expect(isImportRoleConflict('walker', undefined)).toBe(false);
		expect(isImportRoleConflict('partial_server', undefined)).toBe(false);
	});

	test('no enrollment found in the retreat: nothing to protect', () => {
		expect(isImportRoleConflict(undefined, 'walker')).toBe(false);
	});
});

describe('importRoleConflictReason', () => {
	test('names the record owner and both roles in Spanish', () => {
		const reason = importRoleConflictReason('Eduardo Garay', 'partial_server', 'walker');
		expect(reason).toContain('Eduardo Garay');
		expect(reason).toContain('angelito');
		expect(reason).toContain('caminante');
	});
});
