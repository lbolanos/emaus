/**
 * The /schedule/items/:id routes only carry a global permission
 * (`schedule:manage` merges the roles of every retreat). Each handler must
 * resolve the item's retreat and check access to it before acting; otherwise a
 * coordinator of one retreat could edit, delete, start, complete or shift
 * another retreat's items by id.
 */
import * as scheduleController from '../../controllers/retreatScheduleController';
import { retreatScheduleService } from '../../services/retreatScheduleService';
import { authorizationService } from '../../middleware/authorization';

const ITEM_ID = '55555555-5555-4555-8555-555555555555';
const RETREAT_ID = '33333333-3333-4333-8333-333333333333';

type Case = {
	name: string;
	handler: (req: any, res: any) => Promise<unknown>;
	method: keyof typeof retreatScheduleService;
	result: unknown;
	body?: Record<string, unknown>;
};

const CASES: Case[] = [
	{ name: 'updateItem', handler: scheduleController.updateItem, method: 'update', result: { id: ITEM_ID }, body: { name: 'x' } },
	{ name: 'deleteItem', handler: scheduleController.deleteItem, method: 'delete', result: true },
	{ name: 'startItem', handler: scheduleController.startItem, method: 'startItem', result: { id: ITEM_ID } },
	{ name: 'completeItem', handler: scheduleController.completeItem, method: 'completeItem', result: { id: ITEM_ID } },
	{ name: 'shiftItem', handler: scheduleController.shiftItem, method: 'shiftDownstream', result: [], body: { minutesDelta: 5 } },
];

describe('retreatScheduleController — /items/:id retreat access', () => {
	const req = (body: Record<string, unknown> = {}) =>
		({ params: { id: ITEM_ID }, body, user: { id: 'user-1' } }) as any;
	const res = () => {
		const r: any = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis(),
		};
		return r;
	};

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe.each(CASES)('$name', ({ handler, method, result, body }) => {
		it('404 for an unknown item, without acting', async () => {
			jest.spyOn(retreatScheduleService, 'findItemRetreatId').mockResolvedValue(null);
			const action = jest.spyOn(retreatScheduleService, method as any);
			const r = res();

			await handler(req(body), r);

			expect(r.status).toHaveBeenCalledWith(404);
			expect(action).not.toHaveBeenCalled();
		});

		it("403 for an item of a retreat the user can't access, without acting", async () => {
			jest.spyOn(retreatScheduleService, 'findItemRetreatId').mockResolvedValue(RETREAT_ID);
			const access = jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
			const action = jest.spyOn(retreatScheduleService, method as any);
			const r = res();

			await handler(req(body), r);

			expect(access).toHaveBeenCalledWith('user-1', RETREAT_ID);
			expect(r.status).toHaveBeenCalledWith(403);
			expect(action).not.toHaveBeenCalled();
		});

		it('acts when the user has access to the item retreat', async () => {
			jest.spyOn(retreatScheduleService, 'findItemRetreatId').mockResolvedValue(RETREAT_ID);
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
			const action = jest.spyOn(retreatScheduleService, method as any).mockResolvedValue(result as never);
			const r = res();

			await handler(req(body), r);

			expect(action).toHaveBeenCalled();
			expect(r.status).not.toHaveBeenCalledWith(403);
		});
	});
});
