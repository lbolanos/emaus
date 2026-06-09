import { describe, it, expect } from 'vitest';
import { replaceAllVariables } from '@/utils/message';

const participant: any = {
	firstName: 'Juan',
	lastName: 'Perez',
	emergencyContact1Name: 'Ana Ramírez',
	emergencyContact2Name: 'Luis Ramírez',
	invitedBy: 'Pedro Invitador',
};

const resolve = (key?: string) =>
	replaceAllVariables(
		'{participant.recipientName} / {participant.recipientFirstName}',
		participant,
		null,
		key,
	);

describe('{participant.recipientName} adaptativo según el contacto', () => {
	it('con contacto propio resuelve al participante', () => {
		expect(resolve('cellPhone')).toBe('Juan Perez / Juan');
	});

	it('con contacto de emergencia 1 resuelve a EC1', () => {
		expect(resolve('emergencyContact1CellPhone')).toBe('Ana Ramírez / Ana');
	});

	it('con contacto de emergencia 2 resuelve a EC2', () => {
		expect(resolve('emergencyContact2Email')).toBe('Luis Ramírez / Luis');
	});

	it('con teléfono del invitador resuelve al invitador', () => {
		expect(resolve('inviterCellPhone')).toBe('Pedro Invitador / Pedro');
	});

	it('sin contacto seleccionado usa el participante', () => {
		expect(resolve(undefined)).toBe('Juan Perez / Juan');
	});
});
