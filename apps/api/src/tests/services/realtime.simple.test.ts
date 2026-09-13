// Tests for the realtime (socket.io) helpers in apps/api/src/realtime.ts
//
// Pure unit tests with a mocked socket.io server. These verify:
//   - receptionRoom() / sequencesRoom() naming conventions
//   - emitReceptionCheckin / emitReceptionBagMade route events to the correct room
//   - emitSequenceQueueChanged routes the sequences inbox event to the correct room
//   - emit helpers no-op silently when realtime has not been initialized

jest.mock('../../services/authService', () => ({
	passport: {
		initialize: () => (_req: any, _res: any, next: any) => next(),
		session: () => (_req: any, _res: any, next: any) => next(),
	},
}));

jest.mock('../../middleware/authorization', () => ({
	authorizationService: { hasRetreatAccess: jest.fn().mockResolvedValue(true) },
}));

jest.mock('../../config', () => ({
	config: { frontend: { url: 'http://localhost:5173' } },
}));

const emitMock = jest.fn();
const toMock = jest.fn(() => ({ emit: emitMock }));
const useMock = jest.fn();
const onMock = jest.fn();

jest.mock('socket.io', () => ({
	Server: jest.fn().mockImplementation(() => ({
		use: useMock,
		on: onMock,
		to: toMock,
	})),
}));

import {
	receptionRoom,
	emitReceptionCheckin,
	emitReceptionBagMade,
	sequencesRoom,
	emitSequenceQueueChanged,
	initRealtime,
} from '../../realtime';

describe('receptionRoom', () => {
	it('builds the expected room name from a retreat id', () => {
		expect(receptionRoom('abc-123')).toBe('retreat:abc-123:reception');
	});

	it('returns different rooms for different retreats (isolation)', () => {
		expect(receptionRoom('r1')).not.toBe(receptionRoom('r2'));
	});
});

describe('sequencesRoom', () => {
	it('builds the expected room name from a retreat id', () => {
		expect(sequencesRoom('abc-123')).toBe('retreat:abc-123:sequences');
	});

	it('returns different rooms for different retreats (isolation)', () => {
		expect(sequencesRoom('r1')).not.toBe(sequencesRoom('r2'));
	});
});

describe('emit helpers (uninitialized)', () => {
	beforeEach(() => {
		emitMock.mockClear();
		toMock.mockClear();
	});

	it('emitReceptionCheckin is a no-op when realtime has not been initialized', () => {
		// initRealtime has not been called yet; module-level io is null.
		expect(() =>
			emitReceptionCheckin({
				retreatId: 'r1',
				participantId: 'p1',
				checkedIn: true,
				checkedInAt: new Date().toISOString(),
			}),
		).not.toThrow();
		expect(toMock).not.toHaveBeenCalled();
		expect(emitMock).not.toHaveBeenCalled();
	});

	it('emitReceptionBagMade is a no-op when realtime has not been initialized', () => {
		expect(() =>
			emitReceptionBagMade({ retreatId: 'r1', participantId: 'p1', bagMade: true }),
		).not.toThrow();
		expect(toMock).not.toHaveBeenCalled();
	});

	it('emitSequenceQueueChanged is a no-op when realtime has not been initialized', () => {
		expect(() =>
			emitSequenceQueueChanged({
				retreatId: 'r1',
				action: 'dispatched',
				scheduledMessageIds: ['sm-1'],
			}),
		).not.toThrow();
		expect(toMock).not.toHaveBeenCalled();
	});
});

describe('emit helpers (after initRealtime)', () => {
	beforeAll(() => {
		const fakeHttp: any = {};
		const fakeSession: any = (_req: any, _res: any, next: any) => next();
		initRealtime(fakeHttp, fakeSession);
	});

	beforeEach(() => {
		emitMock.mockClear();
		toMock.mockClear();
	});

	it('emitReceptionCheckin targets the reception room for the retreat', () => {
		const payload = {
			retreatId: 'r42',
			participantId: 'p1',
			checkedIn: true,
			checkedInAt: '2026-04-23T12:00:00.000Z',
		};
		emitReceptionCheckin(payload);

		expect(toMock).toHaveBeenCalledWith('retreat:r42:reception');
		expect(emitMock).toHaveBeenCalledWith('reception:checkin', payload);
	});

	it('emitReceptionBagMade targets the reception room for the retreat', () => {
		const payload = { retreatId: 'r42', participantId: 'p1', bagMade: true };
		emitReceptionBagMade(payload);

		expect(toMock).toHaveBeenCalledWith('retreat:r42:reception');
		expect(emitMock).toHaveBeenCalledWith('reception:bag-made', payload);
	});

	it('different retreats emit to isolated rooms', () => {
		emitReceptionCheckin({
			retreatId: 'r-alpha',
			participantId: 'p1',
			checkedIn: true,
			checkedInAt: null,
		});
		emitReceptionCheckin({
			retreatId: 'r-beta',
			participantId: 'p2',
			checkedIn: false,
			checkedInAt: null,
		});
		expect(toMock).toHaveBeenNthCalledWith(1, 'retreat:r-alpha:reception');
		expect(toMock).toHaveBeenNthCalledWith(2, 'retreat:r-beta:reception');
	});

	it('emitSequenceQueueChanged targets the sequences room with the full payload', () => {
		const payload = {
			retreatId: 'r42',
			action: 'dispatched' as const,
			scheduledMessageIds: ['sm-1', 'sm-2'],
		};
		emitSequenceQueueChanged(payload);

		expect(toMock).toHaveBeenCalledWith('retreat:r42:sequences');
		expect(emitMock).toHaveBeenCalledWith('sequences:queue-changed', payload);
	});

	it('emitSequenceQueueChanged isolates retreats (enqueued batches go to their own room)', () => {
		emitSequenceQueueChanged({
			retreatId: 'r-alpha',
			action: 'enqueued',
			scheduledMessageIds: ['sm-a1', 'sm-a2'],
		});
		emitSequenceQueueChanged({
			retreatId: 'r-beta',
			action: 'enqueued',
			scheduledMessageIds: ['sm-b1'],
		});
		expect(toMock).toHaveBeenNthCalledWith(1, 'retreat:r-alpha:sequences');
		expect(toMock).toHaveBeenNthCalledWith(2, 'retreat:r-beta:sequences');
	});
});
