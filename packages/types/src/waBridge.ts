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
	| 'not_enabled'
	| 'outside_window'
	| 'cap_reached'
	| 'already_linked';

/** Conversación consolidada: un chat 1:1 con un caminante del retiro. */
export interface WaConversationDto {
	chatJid: string;
	chatPhone: string;
	/** Participante del retiro cuyo teléfono matcheó (para ficha y deep link). */
	participantId: string | null;
	participantFirstName: string;
	participantLastName: string;
	country: string | null;
	lastMessageAt: string | Date;
	lastMessagePreview: string | null;
	/** Type of the last message (text, image, audio, document…) for its label. */
	lastMessageType?: string;
	/** The last message was a staff reply (shown as "You:"/"X:" in the list). */
	lastMessageFromMe?: boolean;
	messageCount: number;
	/** Unread incoming messages for the calling user. */
	unreadCount: number;
	/** Last staff reply in this chat and who sent it (v1.3, "answered by"). */
	lastReplyAt?: string | Date | null;
	lastReplyByName?: string | null;
	/** The walker wrote after the last staff reply (or nobody replied yet). */
	awaitingReply?: boolean;
	/** Other walkers sharing this phone (e.g. a couple on one phone). */
	sharedWith?: Array<{ id: string; firstName: string; lastName: string }>;
}

/** Mensaje persistido (solo entrantes de caminantes, texto/caption). */
export interface WaInboxMessageDto {
	id: string;
	chatJid: string;
	timestamp: string | Date;
	body: string | null;
	/** Tipo declarado por WhatsApp (text, image, audio, …) para el placeholder 📎. */
	messageType: string;
	/** v1.3: staff reply sent from a linked phone (and who sent it). */
	fromMe?: boolean;
	senderName?: string | null;
	/** v1.3: media metadata from wacli (documents, voice notes). */
	mediaMime?: string | null;
	mediaFileName?: string | null;
	/** v1.3: payment created from this message (duplicate-payment guard). */
	paymentId?: string | null;
	paymentRegisteredByName?: string | null;
	paymentRegisteredAt?: string | Date | null;
	/** v1.3: letter created from this message ("add as letter"). */
	letterId?: string | null;
	letterAddedByName?: string | null;
	letterAddedAt?: string | Date | null;
}

/** On-demand voice note or document (v1.3). */
export interface WaRawMediaDto {
	dataUrl: string;
	mime: string;
	fileName: string | null;
	sizeBytes: number;
}

/**
 * Variantes de una imagen descargada bajo demanda (v1.2): thumb para la lista
 * del hilo, large para el visor y el comprobante del pago. Ambas viajan como
 * data-URL webp; el servidor las cachea para no re-descargar por clic.
 */
export interface WaMediaVariantsDto {
	thumb: string;
	large: string;
}

/** Respuesta del lote de thumbnails de un hilo: mapa por messageId. */
export interface WaThreadMediaDto {
	media: Record<string, WaMediaVariantsDto>;
	/** Mensajes pedidos que no aplican (no imagen / otro retiro / inexistente). */
	skipped: number;
}
