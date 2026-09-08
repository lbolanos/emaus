import { describe, it, expect } from 'vitest';
import {
	buildParticipantContacts,
	contactKeyLabel,
} from '../participantContacts';

const walker = {
	firstName: 'Andrei',
	lastName: 'Ibarra',
	cellPhone: '+52 55 1234-5678',
	email: 'andrei@example.com',
	emergencyContact1Name: 'Luz Ma Ibarra',
	emergencyContact1Relation: 'Mamá',
	emergencyContact1CellPhone: '5215579797705',
	emergencyContact1Email: 'luzma@example.com',
	// Familiar 2 declarado sólo con nombre y teléfono de casa.
	emergencyContact2Name: 'Julio Cesar',
	emergencyContact2Relation: 'Papá',
	emergencyContact2HomePhone: '+52 33 2167-7397',
	invitedBy: 'Luis',
	inviterCellPhone: '5551112222',
};

describe('buildParticipantContacts', () => {
	it('lista caminante, familiares e invitador', () => {
		const rows = buildParticipantContacts(walker);
		expect(rows.map((r) => r.key)).toEqual([
			'participant',
			'emergencyContact1',
			'emergencyContact2',
			'inviter',
		]);
		expect(rows[0].name).toBe('Andrei Ibarra');
		expect(rows[1].name).toBe('Luz Ma Ibarra');
		expect(rows[1].relation).toBe('Mamá');
	});

	it('omite los interlocutores que no existen', () => {
		const rows = buildParticipantContacts({
			firstName: 'Solo',
			lastName: 'Caminante',
			cellPhone: '5550000000',
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].key).toBe('participant');
	});

	it('el enlace de WhatsApp abre el chat, sin texto precargado', () => {
		const rows = buildParticipantContacts(walker);
		const mama = rows.find((r) => r.key === 'emergencyContact1')!;
		expect(mama.whatsappLink).toBe('https://api.whatsapp.com/send?phone=5215579797705');
		expect(mama.whatsappLink).not.toContain('text=');
	});

	/**
	 * El motor resuelve `cellPhone || homePhone || workPhone`. Si la UI
	 * ofreciera otro número, el coordinador abriría un chat distinto del que
	 * recibió el mensaje.
	 */
	it('cae a teléfono de casa cuando no hay celular, igual que el motor', () => {
		const rows = buildParticipantContacts(walker);
		const papa = rows.find((r) => r.key === 'emergencyContact2')!;
		expect(papa.phone).toBe('+52 33 2167-7397');
		expect(papa.whatsappLink).toBe('https://api.whatsapp.com/send?phone=523321677397');
	});

	it('sin teléfono no hay enlace, para poder ocultar el botón', () => {
		const rows = buildParticipantContacts({
			emergencyContact1Name: 'Tía sin teléfono',
			emergencyContact1Email: 'tia@example.com',
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].phone).toBeNull();
		expect(rows[0].whatsappLink).toBeNull();
		expect(rows[0].email).toBe('tia@example.com');
	});

	it('ignora teléfonos que no tienen dígitos', () => {
		const rows = buildParticipantContacts({
			firstName: 'Sin',
			lastName: 'Número',
			cellPhone: 'no tiene',
			homePhone: '5559998888',
		});
		expect(rows[0].phone).toBe('5559998888');
	});

	it('el invitador se identifica por apodo', () => {
		const rows = buildParticipantContacts(walker);
		const inviter = rows.find((r) => r.key === 'inviter')!;
		expect(inviter.name).toBe('Luis');
	});

	it('devuelve vacío sin participante', () => {
		expect(buildParticipantContacts(null)).toEqual([]);
	});
});

describe('contactKeyLabel', () => {
	it('traduce las claves del motor', () => {
		expect(contactKeyLabel('emergencyContact1')).toBe('Familiar 1');
		expect(contactKeyLabel('inviter')).toBe('Invitador');
		expect(contactKeyLabel('tableLeader')).toBe('Líder de mesa');
		// Un mensaje viejo sin contactKey es del caminante.
		expect(contactKeyLabel(null)).toBe('Caminante');
		expect(contactKeyLabel(undefined)).toBe('Caminante');
	});
});
