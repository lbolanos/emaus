import { resolveMemberProfile } from '@repo/utils';

/**
 * Tests del helper `resolveMemberProfile`: aplica el overlay de
 * `community_members.X` sobre el `participants.X` global. La regla es:
 * overlay null/undefined/'' → usar participant; cualquier otro string →
 * overlay gana.
 */
describe('resolveMemberProfile', () => {
	it('uses participant fields when overlay is fully empty', () => {
		const result = resolveMemberProfile({
			firstName: null,
			lastName: null,
			email: null,
			cellPhone: null,
			participant: {
				firstName: 'Juan',
				lastName: 'Pérez',
				email: 'juan@example.com',
				cellPhone: '5551234567',
			},
		});

		expect(result.firstName).toBe('Juan');
		expect(result.lastName).toBe('Pérez');
		expect(result.email).toBe('juan@example.com');
		expect(result.cellPhone).toBe('5551234567');
		expect(result.fullName).toBe('Juan Pérez');
	});

	it('overlay wins when set', () => {
		const result = resolveMemberProfile({
			firstName: 'JuanC',
			lastName: 'Pérez García',
			email: 'juanc@example.com',
			cellPhone: '5559999999',
			participant: {
				firstName: 'Juan',
				lastName: 'Pérez',
				email: 'juan@example.com',
				cellPhone: '5551234567',
			},
		});

		expect(result.firstName).toBe('JuanC');
		expect(result.lastName).toBe('Pérez García');
		expect(result.email).toBe('juanc@example.com');
		expect(result.cellPhone).toBe('5559999999');
		expect(result.fullName).toBe('JuanC Pérez García');
	});

	it('partial overlay — only some fields override', () => {
		const result = resolveMemberProfile({
			firstName: 'JuanC', // overlay
			lastName: null, // fallback al participant
			email: undefined, // fallback
			cellPhone: null,
			participant: {
				firstName: 'Juan',
				lastName: 'Pérez',
				email: 'juan@example.com',
				cellPhone: '5551234567',
			},
		});

		expect(result.firstName).toBe('JuanC'); // overlay
		expect(result.lastName).toBe('Pérez'); // participant
		expect(result.email).toBe('juan@example.com'); // participant
		expect(result.cellPhone).toBe('5551234567'); // participant
		expect(result.fullName).toBe('JuanC Pérez');
	});

	it('empty string in overlay is treated as "no overlay" (fallback)', () => {
		const result = resolveMemberProfile({
			firstName: '',
			lastName: '',
			email: '',
			cellPhone: '',
			participant: {
				firstName: 'Juan',
				lastName: 'Pérez',
				email: 'juan@example.com',
				cellPhone: '5551234567',
			},
		});

		// La regla es que '' nunca gana — fallback al participant.
		expect(result.firstName).toBe('Juan');
		expect(result.lastName).toBe('Pérez');
		expect(result.email).toBe('juan@example.com');
		expect(result.cellPhone).toBe('5551234567');
	});

	it('no participant relation — solo overlay disponible', () => {
		const result = resolveMemberProfile({
			firstName: 'Juan',
			lastName: 'Pérez',
			email: 'juan@example.com',
			cellPhone: '5551234567',
		});

		expect(result.firstName).toBe('Juan');
		expect(result.lastName).toBe('Pérez');
		expect(result.email).toBe('juan@example.com');
		expect(result.fullName).toBe('Juan Pérez');
	});

	it('participant relation null', () => {
		const result = resolveMemberProfile({
			firstName: 'OnlyOverlay',
			participant: null,
		});

		expect(result.firstName).toBe('OnlyOverlay');
		expect(result.lastName).toBe('');
		expect(result.email).toBe('');
		expect(result.fullName).toBe('OnlyOverlay');
	});

	it('both null — returns empty strings (no crash)', () => {
		const result = resolveMemberProfile({});

		expect(result.firstName).toBe('');
		expect(result.lastName).toBe('');
		expect(result.email).toBe('');
		expect(result.cellPhone).toBe('');
		expect(result.fullName).toBe('');
	});

	it('participant has null fields explícitamente', () => {
		const result = resolveMemberProfile({
			firstName: null,
			lastName: null,
			participant: {
				firstName: null,
				lastName: null,
				email: 'fallback@example.com',
				cellPhone: null,
			},
		});

		expect(result.firstName).toBe('');
		expect(result.lastName).toBe('');
		expect(result.email).toBe('fallback@example.com');
		expect(result.cellPhone).toBe('');
		expect(result.fullName).toBe('');
	});
});
