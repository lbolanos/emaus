import { describe, it, expect } from 'vitest';
import {
	buildParticipantContacts,
	contactKeyLabel,
	normalizeContactKey,
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

/**
 * Las formas REALES que tiene la columna en la base — contadas el 2026-09-08:
 * `participant:email` 298, vacío 244, `inviter:email` 31, `cellPhone` 8.
 * Los tests originales usaban claves sintéticas limpias ('emergencyContact1') y
 * por eso pasaban mientras el filtro no encontraba nada con datos de verdad.
 */
describe('normalizeContactKey — formatos reales de la columna', () => {
	it('formato dueño:campo (el que escriben hoy MessageDialog y la cola)', () => {
		expect(normalizeContactKey('participant:email')).toBe('participant');
		expect(normalizeContactKey('participant:cellPhone')).toBe('participant');
		expect(normalizeContactKey('inviter:email')).toBe('inviter');
		expect(normalizeContactKey('emergencyContact1:cellPhone')).toBe('emergencyContact1');
	});

	it('nombre de campo a secas (el formato original de la columna)', () => {
		expect(normalizeContactKey('cellPhone')).toBe('participant');
		expect(normalizeContactKey('email')).toBe('participant');
		expect(normalizeContactKey('homePhone')).toBe('participant');
		expect(normalizeContactKey('inviterEmail')).toBe('inviter');
		expect(normalizeContactKey('emergencyContact1CellPhone')).toBe('emergencyContact1');
		expect(normalizeContactKey('emergencyContact2Email')).toBe('emergencyContact2');
	});

	it('dueño a secas (lo que devuelve el motor de secuencias)', () => {
		expect(normalizeContactKey('participant')).toBe('participant');
		expect(normalizeContactKey('emergencyContact1')).toBe('emergencyContact1');
		expect(normalizeContactKey('inviter')).toBe('inviter');
		expect(normalizeContactKey('tableLeader')).toBe('tableLeader');
		expect(normalizeContactKey('responsibility')).toBe('responsibility');
	});

	it('las filas viejas sin clave son del propio caminante', () => {
		expect(normalizeContactKey('')).toBe('participant');
		expect(normalizeContactKey('   ')).toBe('participant');
		expect(normalizeContactKey(null)).toBe('participant');
		expect(normalizeContactKey(undefined)).toBe('participant');
	});

	it('la etiqueta nunca sale en crudo, sea cual sea el formato', () => {
		// El síntoma que se vio en pantalla: "participant:email: Pepe Toño".
		expect(contactKeyLabel('participant:email')).toBe('Caminante');
		expect(contactKeyLabel('inviter:email')).toBe('Invitador');
		expect(contactKeyLabel('cellPhone')).toBe('Caminante');
		expect(contactKeyLabel('emergencyContact1CellPhone')).toBe('Familiar 1');
		for (const k of ['participant:email', 'inviter:email', 'cellPhone', '', null]) {
			expect(contactKeyLabel(k as any)).not.toContain(':');
		}
	});
});
