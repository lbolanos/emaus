/**
 * HTTP contract of GET /schedule/retreats/:retreatId/assignment-documents.
 * The route's `schedule:read` permission is global (it merges the roles of any
 * retreat), so the handler must check access to *this* retreat before reading:
 * otherwise a coordinator of one retreat could read another's documents.
 * The service with a real DB is covered in assignmentDocumentsService.test.ts.
 */
import * as scheduleController from '../../controllers/retreatScheduleController';
import { assignmentDocumentsService } from '../../services/assignmentDocumentsService';
import { authorizationService } from '../../middleware/authorization';

const RETREAT_ID = '33333333-3333-4333-8333-333333333333';
const PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444';

describe('retreatScheduleController.assignmentDocuments', () => {
	const req = () =>
		({ params: { retreatId: RETREAT_ID }, user: { id: 'user-1' } }) as any;
	const res = () => {
		const r: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
		return r;
	};

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('403 without access to the retreat, without reading anything', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
		const spy = jest.spyOn(assignmentDocumentsService, 'forRetreat');
		const r = res();

		await scheduleController.assignmentDocuments(req(), r);

		expect(r.status).toHaveBeenCalledWith(403);
		expect(spy).not.toHaveBeenCalled();
	});

	it('returns the documents keyed by participant', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		const data = { moments: [], responsibilityDocuments: [], table: null };
		jest
			.spyOn(assignmentDocumentsService, 'forRetreat')
			.mockResolvedValue(new Map([[PARTICIPANT_ID, data]]));
		const r = res();

		await scheduleController.assignmentDocuments(req(), r);

		expect(assignmentDocumentsService.forRetreat).toHaveBeenCalledWith(RETREAT_ID);
		expect(r.json).toHaveBeenCalledWith({ [PARTICIPANT_ID]: data });
	});

	it('500 when the service fails', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		jest.spyOn(assignmentDocumentsService, 'forRetreat').mockRejectedValue(new Error('boom'));
		const r = res();

		await scheduleController.assignmentDocuments(req(), r);

		expect(r.status).toHaveBeenCalledWith(500);
	});
});
