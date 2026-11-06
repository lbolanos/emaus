/**
 * DTOs del puente de lectura de WhatsApp (specs/whatsapp-inbox).
 *
 * Contratos compartidos API → web. El contenido sensible vive acotado por
 * diseño: `WaLinkDto` nunca expone `linkedPhone` a terceros (solo al dueño lo
 * llena el controller), y los mensajes solo traen texto — la multimedia no se
 * descarga (D9 de la spec) y viaja como tipo.
 */

export const WA_LINK_STATUSES = [
	'pending',
	'qr',
	'connected',
	'error',
	'logged_out',
	'expired',
] as const;

export type WaLinkStatus = (typeof WA_LINK_STATUSES)[number];

/** Vínculo de una cuenta de staff con el retiro (dueño incluido). */
export interface WaLinkDto {
	id: string;
	retreatId: string;
	userId: string;
	ownerName: string;
	status: WaLinkStatus;
	/** Solo presente cuando el llamador es el dueño (o superadmin). */
	linkedPhone?: string | null;
	connectedAt?: string | Date | null;
	lastSyncAt?: string | Date | null;
	lastError?: string | null;
	createdAt: string | Date;
}

/** Motivos tipados de rechazo de vinculación (UI muestra mensaje por caso). */
export type WaLinkRefusalReason =
	| 'disabled'
	| 'outside_window'
	| 'cap_reached'
	| 'already_linked';

/** Conversación consolidada: un chat 1:1 con un caminante del retiro. */
export interface WaConversationDto {
	chatJid: string;
	chatPhone: string;
	/** Participante del retiro cuyo teléfono matcheó (para ficha y deep link). */
	participantId: string;
	participantFirstName: string;
	participantLastName: string;
	country: string | null;
	lastMessageAt: string | Date;
	lastMessagePreview: string | null;
	messageCount: number;
	unreadCount: number;
}

/** Mensaje persistido (solo entrantes de caminantes, texto/caption). */
export interface WaInboxMessageDto {
	id: string;
	chatJid: string;
	timestamp: string | Date;
	body: string | null;
	/** Tipo declarado por WhatsApp (text, image, audio, …) para el placeholder 📎. */
	messageType: string;
}
