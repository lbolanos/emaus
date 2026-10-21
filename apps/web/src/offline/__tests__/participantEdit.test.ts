import { describe, it, expect } from 'vitest';
import { planOfflineEdit } from '../participantEdit';

/** specs/offline-mode D13: which part of a record edit can wait for signal. */
const original = {
	id: 'p1',
	firstName: 'Ana',
	cellPhone: '5512345678',
	parish: 'San Juan',
	email: 'ana@example.com',
	snores: false,
	nickname: null,
	birthDate: '1980-05-01T00:00:00.000Z',
};

describe('planOfflineEdit', () => {
	it('sends only the changed fields, each with the value it had', () => {
		const edited = { ...original, cellPhone: '5599998888', parish: 'Santa Ana' };

		const plan = planOfflineEdit(original, edited, ['cellPhone', 'parish']);

		expect(plan).toEqual({
			blocked: [],
			patch: { cellPhone: '5599998888', parish: 'Santa Ana' },
			expectedValues: { cellPhone: '5512345678', parish: 'San Juan' },
		});
	});

	it('a field outside the list blocks the save and is named', () => {
		const edited = { ...original, email: 'otra@example.com', parish: 'Santa Ana' };

		const plan = planOfflineEdit(original, edited, ['email', 'parish']);

		expect(plan.blocked).toEqual(['email']);
	});

	it('health fields and tags block too', () => {
		const edited = { ...original, medicationDetails: 'Losartán' };
		expect(planOfflineEdit(original, edited, ['medicationDetails', 'tags']).blocked).toEqual([
			'medicationDetails',
			'tags',
		]);
	});

	it('typing and leaving a field empty again is not a change', () => {
		const edited = { ...original, nickname: '', medicationDetails: '' };

		const plan = planOfflineEdit(original, edited, ['nickname', 'medicationDetails']);

		expect(plan).toEqual({ blocked: [], patch: {}, expectedValues: {} });
	});

	it('a boolean switched on is a change; null and false are the same "no"', () => {
		expect(planOfflineEdit(original, { ...original, snores: true }, ['snores']).patch).toEqual({ snores: true });
		expect(planOfflineEdit({ ...original, snores: null }, { ...original, snores: false }, ['snores']).patch).toEqual({});
	});

	it('only what the form says the user touched counts (not its date formatting)', () => {
		const edited = { ...original, birthDate: '1980-05-01T06:00:00.000Z', parish: 'Santa Ana' };

		const plan = planOfflineEdit(original, edited, ['parish']);

		expect(plan.blocked).toEqual([]);
		expect(plan.patch).toEqual({ parish: 'Santa Ana' });
	});

	it('a field missing on the phone travels as null in expectedValues', () => {
		const plan = planOfflineEdit({ id: 'p1' }, { id: 'p1', occupation: 'Ingeniero' }, ['occupation']);
		expect(plan.expectedValues).toEqual({ occupation: null });
	});
});
