/**
 * The flyer endpoints, exercised through the real routers with the middleware stubbed.
 *
 * The service tests already cover who may touch which template. What they cannot see is
 * the wiring: an endpoint that forgets `requirePermission`, or that runs the controller
 * before validation, looks exactly the same from the service's side. This repo has been
 * bitten by a mis-wired authorization middleware before (the G3 IDOR), so the wiring gets
 * its own test.
 */
import express from 'express';
import request from 'supertest';

const permissionCalls: string[] = [];
let authenticated = true;
let permitted = true;

jest.mock('../../middleware/isAuthenticated', () => ({
	isAuthenticated: (req: any, res: any, next: any) => {
		if (!authenticated) return res.status(401).json({ message: 'Unauthorized' });
		req.user = { id: 'u1' };
		next();
	},
}));

jest.mock('../../middleware/authorization', () => ({
	requirePermission: (permission: string) => (_req: any, res: any, next: any) => {
		permissionCalls.push(permission);
		if (!permitted) return res.status(403).json({ message: 'Forbidden' });
		next();
	},
}));

const controller = {
	getFlyerTemplates: jest.fn((_req: any, res: any) => res.json([])),
	createFlyerTemplate: jest.fn((_req: any, res: any) => res.status(201).json({ id: 't1' })),
	updateFlyerTemplate: jest.fn((_req: any, res: any) => res.json({ id: 't1' })),
	deleteFlyerTemplate: jest.fn((_req: any, res: any) => res.status(204).end()),
};
jest.mock('../../controllers/flyerTemplateController', () => controller);

const assetController = {
	uploadFlyerAsset: jest.fn((_req: any, res: any) => res.json({ url: 'https://cdn/x.webp' })),
};
jest.mock('../../controllers/flyerAssetController', () => assetController);

import flyerTemplateRoutes from '../../routes/flyerTemplateRoutes';
import flyerAssetRoutes from '../../routes/flyerAssetRoutes';

const app = express();
app.use(express.json());
app.use('/flyer-templates', flyerTemplateRoutes);
app.use('/flyer-assets', flyerAssetRoutes);

const TEMPLATE_ID = '7c1f3b52-9f4a-4d6e-8a21-2f0c5d9e1a44';

const VALID_TEMPLATE = {
	name: 'Mi diseño',
	scope: 'personal',
	communityId: null,
	layout: { layoutVersion: 2, blocks: [] },
};

describe('flyer routes', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		permissionCalls.length = 0;
		authenticated = true;
		permitted = true;
	});

	describe('authentication', () => {
		it.each([
			['get', '/flyer-templates'],
			['post', '/flyer-templates'],
			['put', `/flyer-templates/${TEMPLATE_ID}`],
			['delete', `/flyer-templates/${TEMPLATE_ID}`],
			['post', '/flyer-assets'],
		])('rejects %s %s without a session', async (method, path) => {
			authenticated = false;
			const response = await (request(app) as any)[method](path).send({});

			expect(response.status).toBe(401);
		});
	});

	describe('authorization', () => {
		it.each([
			['get', '/flyer-templates', {}],
			['post', '/flyer-templates', VALID_TEMPLATE],
			['put', `/flyer-templates/${TEMPLATE_ID}`, { name: 'Otro' }],
			['delete', `/flyer-templates/${TEMPLATE_ID}`, {}],
			['post', '/flyer-assets', { kind: 'logo', dataUrl: 'data:image/png;base64,AAAA' }],
		])('gates %s %s behind retreat:update', async (method, path, body) => {
			await (request(app) as any)[method](path).send(body);

			expect(permissionCalls).toEqual(['retreat:update']);
		});

		it('does not reach the controller when the permission is denied', async () => {
			permitted = false;
			const response = await request(app).post('/flyer-templates').send(VALID_TEMPLATE);

			expect(response.status).toBe(403);
			expect(controller.createFlyerTemplate).not.toHaveBeenCalled();
		});

		it('does not reach the asset controller either', async () => {
			permitted = false;
			const response = await request(app)
				.post('/flyer-assets')
				.send({ kind: 'logo', dataUrl: 'data:image/png;base64,AAAA' });

			expect(response.status).toBe(403);
			expect(assetController.uploadFlyerAsset).not.toHaveBeenCalled();
		});
	});

	describe('validation', () => {
		it('rejects a template with no name before the controller runs', async () => {
			const response = await request(app)
				.post('/flyer-templates')
				.send({ ...VALID_TEMPLATE, name: '' });

			expect(response.status).toBe(400);
			expect(controller.createFlyerTemplate).not.toHaveBeenCalled();
		});

		it('rejects an invented scope', async () => {
			const response = await request(app)
				.post('/flyer-templates')
				.send({ ...VALID_TEMPLATE, scope: 'everyone' });

			expect(response.status).toBe(400);
		});

		it('rejects a template id that is not an id', async () => {
			const response = await request(app).put('/flyer-templates/not-an-id').send({ name: 'Otro' });

			expect(response.status).toBe(400);
			expect(controller.updateFlyerTemplate).not.toHaveBeenCalled();
		});

		it('rejects an asset that is not an image data URL', async () => {
			const response = await request(app)
				.post('/flyer-assets')
				.send({ kind: 'logo', dataUrl: 'https://evil.example/x.png' });

			expect(response.status).toBe(400);
			expect(assetController.uploadFlyerAsset).not.toHaveBeenCalled();
		});

		it('lets a valid request through to its controller', async () => {
			await request(app).post('/flyer-templates').send(VALID_TEMPLATE).expect(201);
			expect(controller.createFlyerTemplate).toHaveBeenCalled();

			await request(app).get('/flyer-templates').expect(200);
			expect(controller.getFlyerTemplates).toHaveBeenCalled();
		});
	});
});
