import type { Server as HttpServer } from 'http';
import type { RequestHandler } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { passport } from './services/authService';
import { authorizationService } from './middleware/authorization';
import { config } from './config';
import { AppDataSource } from './data-source';
import { Retreat } from './entities/retreat.entity';

type AnyMw = (req: any, res: any, next: (err?: any) => void) => void;

let io: SocketIOServer | null = null;

function wrap(mw: AnyMw) {
	return (socket: any, next: (err?: any) => void) => mw(socket.request, {}, next);
}

export function initRealtime(httpServer: HttpServer, sessionMiddleware: RequestHandler): SocketIOServer {
	const frontendUrl = config.frontend.url;
	const isDevelopment = frontendUrl.includes('localhost');

	io = new SocketIOServer(httpServer, {
		path: '/api/socket.io',
		cors: {
			origin: (origin, cb) => {
				if (!origin) return cb(null, isDevelopment);
				const allowed = [frontendUrl, 'http://localhost:5173', 'http://localhost:3084'];
				if (allowed.includes(origin)) return cb(null, true);
				return cb(null, false);
			},
			credentials: true,
		},
	});

	io.use(wrap(sessionMiddleware as AnyMw));
	io.use(wrap(passport.initialize() as AnyMw));
	io.use(wrap(passport.session() as AnyMw));

	// Anonymous connections are ALLOWED — required for the auth-less big-screen
	// view at `/mam/<slug>`. Every per-event handler that needs auth checks
	// `req.user.id` itself before doing anything sensitive. The
	// `public:schedule:subscribe` event validates the retreat by slug + isPublic
	// instead of requiring an authenticated user.

	io.on('connection', (socket) => {
		const reqUser = () => (socket.request as any).user;

		socket.on('reception:subscribe', async (retreatId: unknown, ack?: (ok: boolean) => void) => {
			const user = reqUser();
			if (!user?.id || typeof retreatId !== 'string' || !retreatId) {
				ack?.(false);
				return;
			}
			try {
				const ok = await authorizationService.hasRetreatAccess(user.id, retreatId);
				if (!ok) {
					ack?.(false);
					return;
				}
				await socket.join(receptionRoom(retreatId));
				ack?.(true);
			} catch {
				ack?.(false);
			}
		});

		socket.on('reception:unsubscribe', (retreatId: unknown) => {
			if (typeof retreatId === 'string' && retreatId) {
				void socket.leave(receptionRoom(retreatId));
			}
		});

		socket.on('sequences:subscribe', async (retreatId: unknown, ack?: (ok: boolean) => void) => {
			const user = reqUser();
			if (!user?.id || typeof retreatId !== 'string' || !retreatId) {
				ack?.(false);
				return;
			}
			try {
				const ok = await authorizationService.hasRetreatAccess(user.id, retreatId);
				if (!ok) {
					ack?.(false);
					return;
				}
				await socket.join(sequencesRoom(retreatId));
				ack?.(true);
			} catch {
				ack?.(false);
			}
		});

		socket.on('sequences:unsubscribe', (retreatId: unknown) => {
			if (typeof retreatId === 'string' && retreatId) {
				void socket.leave(sequencesRoom(retreatId));
			}
		});

		// Cartas de familias: badge del sidebar + bandeja en vivo (permiso
		// letter:read — contenido sensible, mismo criterio que la ruta).
		socket.on('letters:subscribe', async (retreatId: unknown, ack?: (ok: boolean) => void) => {
			const user = reqUser();
			if (!user?.id || typeof retreatId !== 'string' || !retreatId) {
				ack?.(false);
				return;
			}
			try {
				const ok = await authorizationService.hasRetreatAccess(user.id, retreatId);
				const canRead = ok
					? await authorizationService.hasPermission(user.id, 'letter:read')
					: false;
				if (!canRead) {
					ack?.(false);
					return;
				}
				await socket.join(lettersRoom(retreatId));
				ack?.(true);
			} catch {
				ack?.(false);
			}
		});

		socket.on('letters:unsubscribe', (retreatId: unknown) => {
			if (typeof retreatId === 'string' && retreatId) {
				void socket.leave(lettersRoom(retreatId));
			}
		});

		socket.on('inbox:subscribe', async (retreatId: unknown, ack?: (ok: boolean) => void) => {
			const user = reqUser();
			if (!user?.id || typeof retreatId !== 'string' || !retreatId) {
				ack?.(false);
				return;
			}
			try {
				const hasAccess = await authorizationService.hasRetreatAccess(user.id, retreatId);
				if (!hasAccess) {
					ack?.(false);
					return;
				}
				// El contenido del inbox (conversaciones privadas de caminantes) es
				// más sensible que la cola de salida: exige además el permiso
				// específico (S5 de specs/whatsapp-inbox).
				const allowed = await authorizationService.hasPermission(user.id, 'whatsappInbox:read');
				if (!allowed) {
					ack?.(false);
					return;
				}
				await socket.join(inboxRoom(retreatId));
				ack?.(true);
			} catch {
				ack?.(false);
			}
		});

		socket.on('inbox:unsubscribe', (retreatId: unknown) => {
			if (typeof retreatId === 'string' && retreatId) {
				void socket.leave(inboxRoom(retreatId));
			}
		});

		socket.on('schedule:subscribe', async (retreatId: unknown, ack?: (ok: boolean) => void) => {
			const user = reqUser();
			if (!user?.id || typeof retreatId !== 'string' || !retreatId) {
				ack?.(false);
				return;
			}
			try {
				const ok = await authorizationService.hasRetreatAccess(user.id, retreatId);
				if (!ok) {
					ack?.(false);
					return;
				}
				await socket.join(scheduleRoom(retreatId));
				// Also join the global schedule room so attachment-changed events
				// (which aren't keyed by retreatId) reach everyone with MaM open.
				await socket.join(SCHEDULE_GLOBAL_ROOM);
				ack?.(true);
			} catch {
				ack?.(false);
			}
		});

		socket.on('schedule:unsubscribe', (retreatId: unknown) => {
			if (typeof retreatId === 'string' && retreatId) {
				void socket.leave(scheduleRoom(retreatId));
				void socket.leave(SCHEDULE_GLOBAL_ROOM);
			}
		});

		/**
		 * Public big-screen view (auth-less) subscribe. The client passes the
		 * retreat slug; the server resolves to retreatId, verifies isPublic,
		 * and joins the public schedule room. From there, any
		 * emit*PublicMam(...) call reaches the projector instantly.
		 *
		 * The ack returns the retreatId so the client knows what changed
		 * once events start flowing.
		 */
		socket.on(
			'public:schedule:subscribe',
			async (slug: unknown, ack?: (result: { ok: boolean; retreatId?: string }) => void) => {
				if (typeof slug !== 'string' || !slug) {
					ack?.({ ok: false });
					return;
				}
				try {
					const repo = AppDataSource.getRepository(Retreat);
					const retreat = await repo.findOne({ where: { slug } });
					if (!retreat || !retreat.isPublic) {
						ack?.({ ok: false });
						return;
					}
					await socket.join(publicScheduleRoom(retreat.id));
					ack?.({ ok: true, retreatId: retreat.id });
				} catch {
					ack?.({ ok: false });
				}
			},
		);

		socket.on('public:schedule:unsubscribe', async (retreatId: unknown) => {
			if (typeof retreatId === 'string' && retreatId) {
				void socket.leave(publicScheduleRoom(retreatId));
			}
		});
	});

	return io;
}

export function getIo(): SocketIOServer | null {
	return io;
}

export function receptionRoom(retreatId: string): string {
	return `retreat:${retreatId}:reception`;
}

export type ReceptionCheckinPayload = {
	retreatId: string;
	participantId: string;
	checkedIn: boolean;
	checkedInAt: string | null;
};

export type ReceptionBagMadePayload = {
	retreatId: string;
	participantId: string;
	bagMade: boolean;
};

export function emitReceptionCheckin(payload: ReceptionCheckinPayload): void {
	io?.to(receptionRoom(payload.retreatId)).emit('reception:checkin', payload);
}

export function emitReceptionBagMade(payload: ReceptionBagMadePayload): void {
	io?.to(receptionRoom(payload.retreatId)).emit('reception:bag-made', payload);
}

// --- Sequences inbox (bandeja de WhatsApp de Secuencias) ---

export function sequencesRoom(retreatId: string): string {
	return `retreat:${retreatId}:sequences`;
}

/** Acciones (manuales o del motor) que cambian la bandeja de un retiro. */
export type SequenceQueueAction =
	| 'dispatched'
	| 'skipped'
	| 'opened'
	| 'retried'
	| 'discarded'
	| 'assigned'
	| 'enqueued';

export type SequenceQueueChangedPayload = {
	retreatId: string;
	action: SequenceQueueAction;
	scheduledMessageIds: string[];
};

/**
 * Notifica a las vistas con la bandeja de Secuencias abierta que la cola
 * cambió: despacho, omisión, asignación, reintento/descarte, o pendientes
 * nuevos encolados por el motor. Un solo evento — la reacción del cliente
 * siempre es refetch (bandeja + stats).
 */
export function emitSequenceQueueChanged(payload: SequenceQueueChangedPayload): void {
	io?.to(sequencesRoom(payload.retreatId)).emit('sequences:queue-changed', payload);
}

// --- Cartas de familias (bandeja de revisión + badge del sidebar) ---

export function lettersRoom(retreatId: string): string {
	return `retreat:${retreatId}:letters`;
}

export type LetterReceivedPayload = {
	retreatId: string;
	letterId: string;
	participantName: string;
};

/**
 * Carta nueva aceptada en el buzón del retiro (webhook del Email Worker).
 * La bandeja de cartas refetch y el badge del sidebar incrementa.
 */
export function emitLetterReceived(payload: LetterReceivedPayload): void {
	io?.to(lettersRoom(payload.retreatId)).emit('letters:received', payload);
}

// --- WhatsApp inbox (bandeja de lectura del puente, specs/whatsapp-inbox) ---

export function inboxRoom(retreatId: string): string {
	return `retreat:${retreatId}:inbox`;
}

export type InboxChangedPayload = {
	retreatId: string;
	/** Mensajes nuevos insertados en el último ciclo de ingesta. */
	newCount: number;
	/** Para el toast in-app: remitente y vista previa del último mensaje. */
	senderName?: string | null;
	preview?: string | null;
	/**
	 * v1.4: new messages from emergency contacts. Count only: the room is
	 * shared by users without participant:health, so the contact is never
	 * named here (the client shows the toast only to those who can see it).
	 */
	contactCount?: number;
};

/**
 * Notifica a las vistas con la bandeja WhatsApp abierta que llegaron mensajes
 * nuevos de caminantes. Un solo evento — la reacción del cliente siempre es
 * refetch (conversaciones + hilo activo). La sala exige whatsappInbox:read.
 */
export function emitInboxChanged(payload: InboxChangedPayload): void {
	io?.to(inboxRoom(payload.retreatId)).emit('inbox:changed', payload);
}

// --- Schedule (Minuto a Minuto) ---

export function scheduleRoom(retreatId: string): string {
	return `retreat:${retreatId}:schedule`;
}

/**
 * Auth-less room for the big-screen view at `/mam/<slug>`. Joined via
 * `public:schedule:subscribe(slug)` after the server validates the retreat
 * has `isPublic=true`. Receives a subset of schedule events (started,
 * completed, updated, delay) so the projector reflects coordinator actions
 * instantly without polling.
 *
 * The room is keyed by retreatId (not slug) so a slug change doesn't break
 * existing subscribers, and so the same emit pattern works for both the
 * authenticated `scheduleRoom` and the public mirror.
 */
export function publicScheduleRoom(retreatId: string): string {
	return `public:retreat:${retreatId}:schedule`;
}

/**
 * Helper that emits to BOTH the authenticated schedule room AND the public
 * mirror room in a single call. Use for events that should reach the
 * big-screen view (status changes, delays, generic updates). For sensitive
 * events (bell, upcoming, attachment-changed), keep the authenticated-only
 * `io.to(scheduleRoom(...))` pattern.
 */
function emitToBoth(retreatId: string, event: string, payload: unknown): void {
	io?.to(scheduleRoom(retreatId)).emit(event, payload);
	io?.to(publicScheduleRoom(retreatId)).emit(event, payload);
}

/**
 * Global schedule room — every client subscribed to ANY retreat's schedule
 * also joins this room. Used for events that aren't tied to a single retreat,
 * specifically `schedule:attachment-changed`: attachments are keyed by
 * canonical responsabilityName so a single edit should reach all open MaM
 * views regardless of which retreat they're showing.
 */
export const SCHEDULE_GLOBAL_ROOM = 'schedule:global';

export type ScheduleItemStartedPayload = {
	retreatId: string;
	itemId: string;
	actualStartTime: string;
};

export type ScheduleItemCompletedPayload = {
	retreatId: string;
	itemId: string;
	actualEndTime: string;
};

export type ScheduleUpcomingPayload = {
	retreatId: string;
	itemId: string;
	name: string;
	startTime: string;
	minutesUntil: number;
	targetParticipantIds: string[];
};

export type ScheduleUpdatedPayload = {
	retreatId: string;
	itemId: string;
};

export type ScheduleBellPayload = {
	retreatId: string;
	message?: string;
};

export type ScheduleDelayPayload = {
	retreatId: string;
	itemId: string;
	minutesDelta: number;
};

export function emitScheduleItemStarted(payload: ScheduleItemStartedPayload): void {
	// Mirror to public room — projector needs to know AHORA changed instantly.
	emitToBoth(payload.retreatId, 'schedule:item-started', payload);
}

export function emitScheduleItemCompleted(payload: ScheduleItemCompletedPayload): void {
	emitToBoth(payload.retreatId, 'schedule:item-completed', payload);
}

export function emitScheduleUpcoming(payload: ScheduleUpcomingPayload): void {
	// Authenticated only — this is a per-user push notification with target
	// participant IDs; not relevant to anonymous projectors.
	io?.to(scheduleRoom(payload.retreatId)).emit('schedule:upcoming', payload);
}

export function emitScheduleUpdated(payload: ScheduleUpdatedPayload): void {
	emitToBoth(payload.retreatId, 'schedule:updated', payload);
}

export function emitScheduleBell(payload: ScheduleBellPayload): void {
	// Authenticated only — internal coordinator notification, not for projector.
	io?.to(scheduleRoom(payload.retreatId)).emit('schedule:bell', payload);
}

export function emitScheduleDelay(payload: ScheduleDelayPayload): void {
	emitToBoth(payload.retreatId, 'schedule:delay', payload);
}

export type ScheduleAttachmentChangedPayload = {
	responsabilityName: string;
	action: 'created' | 'updated' | 'deleted';
	attachmentId: string;
	kind: 'file' | 'markdown';
};

/**
 * Broadcast to ALL clients with MaM open (regardless of retreat). The client
 * decides whether to refresh based on whether `responsabilityName` matches
 * any item in its current retreat. Cheap broadcast — typical retreat has
 * <50 servers connected at peak.
 */
export function emitScheduleAttachmentChanged(
	payload: ScheduleAttachmentChangedPayload,
): void {
	io?.to(SCHEDULE_GLOBAL_ROOM).emit('schedule:attachment-changed', payload);
}
