import type { Server as HttpServer } from 'http';
import type { RequestHandler } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { passport } from './services/authService';
import { authorizationService } from './middleware/authorization';
import { config } from './config';

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
				const allowed = [frontendUrl, 'http://localhost:5173', 'http://localhost:3001'];
				if (allowed.includes(origin)) return cb(null, true);
				return cb(null, false);
			},
			credentials: true,
		},
	});

	io.use(wrap(sessionMiddleware as AnyMw));
	io.use(wrap(passport.initialize() as AnyMw));
	io.use(wrap(passport.session() as AnyMw));

	io.use((socket, next) => {
		const req: any = socket.request;
		if (req.user && req.user.id) return next();
		return next(new Error('unauthorized'));
	});

	io.on('connection', (socket) => {
		const user = (socket.request as any).user;

		socket.on('reception:subscribe', async (retreatId: unknown, ack?: (ok: boolean) => void) => {
			if (typeof retreatId !== 'string' || !retreatId) {
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

		socket.on('schedule:subscribe', async (retreatId: unknown, ack?: (ok: boolean) => void) => {
			if (typeof retreatId !== 'string' || !retreatId) {
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
				ack?.(true);
			} catch {
				ack?.(false);
			}
		});

		socket.on('schedule:unsubscribe', (retreatId: unknown) => {
			if (typeof retreatId === 'string' && retreatId) {
				void socket.leave(scheduleRoom(retreatId));
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

// --- Schedule (Minuto a Minuto) ---

export function scheduleRoom(retreatId: string): string {
	return `retreat:${retreatId}:schedule`;
}

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
	io?.to(scheduleRoom(payload.retreatId)).emit('schedule:item-started', payload);
}

export function emitScheduleItemCompleted(payload: ScheduleItemCompletedPayload): void {
	io?.to(scheduleRoom(payload.retreatId)).emit('schedule:item-completed', payload);
}

export function emitScheduleUpcoming(payload: ScheduleUpcomingPayload): void {
	io?.to(scheduleRoom(payload.retreatId)).emit('schedule:upcoming', payload);
}

export function emitScheduleUpdated(payload: ScheduleUpdatedPayload): void {
	io?.to(scheduleRoom(payload.retreatId)).emit('schedule:updated', payload);
}

export function emitScheduleBell(payload: ScheduleBellPayload): void {
	io?.to(scheduleRoom(payload.retreatId)).emit('schedule:bell', payload);
}

export function emitScheduleDelay(payload: ScheduleDelayPayload): void {
	io?.to(scheduleRoom(payload.retreatId)).emit('schedule:delay', payload);
}
