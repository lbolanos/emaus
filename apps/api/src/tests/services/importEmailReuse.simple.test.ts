import {
	isImportNameConflict,
	importNameConflictReason,
	fullName,
} from '../../services/importEmailReuse';

describe('isImportNameConflict (§25.9)', () => {
	const existing = { firstName: 'Juan Carlos', lastName: 'Pérez Gómez' };

	test('a different person on a borrowed email is a conflict', () => {
		expect(isImportNameConflict(existing, { firstName: 'María', lastName: 'López' })).toBe(true);
	});

	test('a different given name with the same surname is a conflict (relatives share it)', () => {
		expect(isImportNameConflict(existing, { firstName: 'Ana', lastName: 'Pérez' })).toBe(true);
	});

	test('the same given name with another surname is a conflict', () => {
		expect(isImportNameConflict(existing, { firstName: 'Juan', lastName: 'Martínez' })).toBe(true);
	});

	test('the same person without middle name or second surname is not a conflict', () => {
		expect(isImportNameConflict(existing, { firstName: 'Juan', lastName: 'Pérez' })).toBe(false);
	});

	test('case, accents and extra spaces do not make a conflict', () => {
		expect(
			isImportNameConflict(existing, { firstName: '  JUAN carlos ', lastName: 'perez   gomez' }),
		).toBe(false);
	});

	test('a side without a name cannot tell, so it is not a conflict', () => {
		expect(isImportNameConflict(existing, { firstName: 'Juan', lastName: undefined })).toBe(false);
		expect(isImportNameConflict(existing, { firstName: '', lastName: '' })).toBe(false);
		expect(isImportNameConflict({ firstName: null, lastName: null }, existing)).toBe(false);
	});

	test('a side without a surname still compares the given name', () => {
		expect(isImportNameConflict(existing, { firstName: 'María', lastName: undefined })).toBe(true);
	});
});

describe('importNameConflictReason', () => {
	test('names both people and tells the importer what to fix', () => {
		const reason = importNameConflictReason('Juan Pérez', 'María López');
		expect(reason).toContain('Juan Pérez');
		expect(reason).toContain('María López');
		expect(reason).toContain('No se tocó su ficha');
		expect(reason).toContain('correo');
	});

	test('says where the record lives: outside this retreat or enrolled in it', () => {
		expect(importNameConflictReason('Juan Pérez', 'María López')).toContain(
			'registrado fuera de este retiro',
		);
		expect(importNameConflictReason('Juan Pérez', 'María López', 'in-retreat')).toContain(
			'inscrito en este retiro',
		);
	});
});

describe('fullName', () => {
	test('joins and trims, tolerating a missing surname', () => {
		expect(fullName({ firstName: 'Juan', lastName: 'Pérez' })).toBe('Juan Pérez');
		expect(fullName({ firstName: 'Juan', lastName: undefined })).toBe('Juan');
		expect(fullName({})).toBe('');
	});
});
