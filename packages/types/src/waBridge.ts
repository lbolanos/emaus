/**
 * DTOs of the read-only WhatsApp bridge (specs/whatsapp-inbox).
 *
 * Shared API → web contracts. Sensitive content is bounded by design:
 * `WaLinkDto` never exposes `linkedPhone` to third parties (the controller
 * fills it for the owner only), and messages carry text only — media is
 * downloaded on demand and travels as a type (D9).
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

/** A staff account's link to the retreat (owner included). */
export interface WaLinkDto {
	id: string;
	retreatId: string;
	userId: string;
	ownerName: string;
	status: WaLinkStatus;
	/** Present only when the caller is the owner (or superadmin). */
	linkedPhone?: string | null;
	connectedAt?: string | Date | null;
	lastSyncAt?: string | Date | null;
	lastError?: string | null;
	createdAt: string | Date;
}

/** Typed link refusal reasons (the UI shows a message per case). */
export type WaLinkRefusalReason =
	| 'disabled'
	| 'not_enabled'
	| 'outside_window'
	| 'cap_reached'
	| 'already_linked';

/** Who wrote a chat (v1.4, D22): the walker or one of their emergency contacts. */
export type WaSenderKind = 'walker' | 'emergency_contact';

/** Emergency contact a chat belongs to (v1.4); its data needs participant:health. */
export interface WaEmergencyContactDto {
	name: string;
	relation: string;
	/** Contact slot in the walker's record (emergencyContact1 / emergencyContact2). */
	slot: 1 | 2;
}

/** A walker a conversation is grouped under (v1.4, D23). */
export interface WaConversationWalkerDto {
	participantId: string;
	firstName: string;
	lastName: string;
}

/**
 * Consolidated conversation: a 1:1 chat with a walker of the retreat or,
 * since v1.4, with one of their emergency contacts.
 */
export interface WaConversationDto {
	chatJid: string;
	chatPhone: string;
	/** v1.4: the walker themselves or an emergency contact of `forWalkers`. */
	senderKind: WaSenderKind;
	/** v1.4: present for emergency-contact chats (first walker that listed it). */
	contact?: WaEmergencyContactDto | null;
	/**
	 * v1.4: walkers this chat is grouped under — the walker (and whoever shares
	 * the phone) for a walker chat; every walker that listed the number for an
	 * emergency-contact chat (siblings share a contact).
	 */
	forWalkers: WaConversationWalkerDto[];
	/**
	 * First walker of the chat (profile, reply deep link, payment and letter
	 * prefill); for an emergency-contact chat, the walker whose contact it is.
	 */
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

/** Stored message (walker messages and, since v1.3, staff replies). */
export interface WaInboxMessageDto {
	id: string;
	chatJid: string;
	timestamp: string | Date;
	body: string | null;
	/** WhatsApp's declared type (text, image, audio, document…) for its label. */
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
 * Variants of an image downloaded on demand (v1.2): thumb for the thread,
 * large for the viewer and the payment receipt. Both travel as webp
 * data-URLs; the server caches them so a click does not re-download.
 */
export interface WaMediaVariantsDto {
	thumb: string;
	large: string;
}

/** Response of a thread's thumbnail batch: map by messageId. */
export interface WaThreadMediaDto {
	media: Record<string, WaMediaVariantsDto>;
	/** Requested messages that do not apply or could not be downloaded. */
	skipped: number;
}
