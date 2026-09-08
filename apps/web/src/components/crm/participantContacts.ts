import { buildWhatsAppChatLink, sanitizePhoneForWhatsapp } from '@/utils/phone';

/**
 * Interlocutores de un caminante. `contactKey` empata con
 * `participant_communications.recipientContactKey` y con
 * `sequence_steps.recipientTarget`, así que sirve para filtrar el hilo por
 * "con quién hablamos".
 */
export type ContactKey =
	| 'participant'
	| 'emergencyContact1'
	| 'emergencyContact2'
	| 'inviter';

export interface ParticipantContact {
	key: ContactKey;
	/** Etiqueta de rol («Caminante», «Familiar 1»). */
	role: string;
	name: string;
	/** Parentesco declarado («Mamá», «Esposa»). Sólo contactos de emergencia. */
	relation?: string | null;
	phone: string | null;
	email: string | null;
	whatsappLink: string | null;
}

/**
 * Mismo orden de resolución que usa el motor de secuencias
 * (`cellPhone || homePhone || workPhone`). Si la UI ofreciera otro número que
 * el del envío, el coordinador abriría un chat distinto del que recibió el
 * mensaje.
 */
function firstPhone(...candidates: (string | null | undefined)[]): string | null {
	for (const c of candidates) {
		if (c && sanitizePhoneForWhatsapp(c)) return c;
	}
	return null;
}

function firstText(...candidates: (string | null | undefined)[]): string | null {
	for (const c of candidates) {
		if (c && String(c).trim() !== '') return String(c).trim();
	}
	return null;
}

/**
 * Arma la lista de interlocutores, omitiendo los que no existen.
 *
 * Un contacto se incluye si tiene nombre O algún medio de contacto: una ficha
 * con teléfono y sin nombre sigue siendo alguien a quien se le escribió.
 */
export function buildParticipantContacts(p: any): ParticipantContact[] {
	if (!p) return [];

	const rows: ParticipantContact[] = [];

	const push = (
		key: ContactKey,
		role: string,
		name: string | null,
		relation: string | null,
		phone: string | null,
		email: string | null,
	) => {
		if (!name && !phone && !email) return;
		rows.push({
			key,
			role,
			name: name ?? 'Sin nombre',
			relation,
			phone,
			email,
			whatsappLink: buildWhatsAppChatLink(phone),
		});
	};

	push(
		'participant',
		'Caminante',
		firstText(`${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()),
		null,
		firstPhone(p.cellPhone, p.homePhone, p.workPhone),
		firstText(p.email),
	);

	push(
		'emergencyContact1',
		'Familiar 1',
		firstText(p.emergencyContact1Name),
		firstText(p.emergencyContact1Relation),
		firstPhone(
			p.emergencyContact1CellPhone,
			p.emergencyContact1HomePhone,
			p.emergencyContact1WorkPhone,
		),
		firstText(p.emergencyContact1Email),
	);

	push(
		'emergencyContact2',
		'Familiar 2',
		firstText(p.emergencyContact2Name),
		firstText(p.emergencyContact2Relation),
		firstPhone(
			p.emergencyContact2CellPhone,
			p.emergencyContact2HomePhone,
			p.emergencyContact2WorkPhone,
		),
		firstText(p.emergencyContact2Email),
	);

	// El invitador se identifica por apodo (`invitedBy`), no por nombre completo.
	push(
		'inviter',
		'Invitador',
		firstText(p.invitedBy),
		null,
		firstPhone(p.inviterCellPhone, p.inviterHomePhone, p.inviterWorkPhone),
		firstText(p.inviterEmail),
	);

	return rows;
}

/** Etiqueta legible de un `contactKey` para pintar el evento del hilo. */
export function contactKeyLabel(key: string | null | undefined): string {
	switch (key) {
		case 'emergencyContact1':
			return 'Familiar 1';
		case 'emergencyContact2':
			return 'Familiar 2';
		case 'inviter':
			return 'Invitador';
		case 'tableLeader':
			return 'Líder de mesa';
		case 'responsibility':
			return 'Responsable';
		case 'participant':
		case null:
		case undefined:
			return 'Caminante';
		default:
			return key;
	}
}
