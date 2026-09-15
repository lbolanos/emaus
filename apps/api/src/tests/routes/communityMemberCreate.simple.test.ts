/**
 * POST /api/communities/:id/members/create
 *
 * Tests de CONTRATO HTTP del alta manual con reconocimiento de persona
 * existente (dos fases): validación Zod en la frontera, shape exacto del 409
 * (sin datos de contacto de candidatos) y audit del vínculo. La lógica de
 * matching vive en communityService.test.ts — aquí el service va mockeado.
 */
import express from 'express';
import request from 'supertest';

const mockCreateCommunityMember = jest.fn();
const mockAuditLog = jest.fn().mockResolvedValue(undefined);

jest.mock('../../services/communityService', () => ({
	CommunityService: class {
		createCommunityMember(...args: any[]) {
			return mockCreateCommunityMember(...args);
		}
	},
	// Misma forma que la clase real — el controller discrimina con instanceof,
	// y como controller y test reciben el MISMO mock, el check funciona.
	MemberCreateConflictError: class MemberCreateConflictError extends Error {
		constructor(
			public readonly code: any,
			public readonly payload: any,
			message: string,
		) {
			super(message);
			this.name = 'MemberCreateConflictError';
		}
	},
}));
jest.mock('../../services/communityAuditService', () => ({
	communityAuditService: { log: mockAuditLog },
	CommunityAuditAction: {
		MEMBER_CREATE: 'community.member.create',
		MEMBER_LINKED: 'community.member.linked',
	},
}));
jest.mock('../../services/recaptchaService', () => ({
	RecaptchaService: class {},
}));
jest.mock('../../services/communityAttendanceStats', () => ({
	RetreatCommunityMismatchError: class extends Error {},
	getAttendanceStats: jest.fn(),
	getServerAttendanceForRetreat: jest.fn(),
}));
jest.mock('../../services/participantMergeService', () => ({
	ParticipantMergeError: class extends Error {},
	findDuplicateCandidatesForCommunity: jest.fn(),
	mergeParticipants: jest.fn(),
	previewMerge: jest.fn(),
}));
jest.mock('../../middleware/isAuthenticated', () => ({
	isAuthenticated: (req: any, _res: any, next: any) => {
		req.user = { id: 'user-route-test' };
		next();
	},
}));
// requireCommunityAccess es el que corre en esta ruta (y puebla req.user para
// el audit); el resto de exports existen para que el import del router cargue.
jest.mock('../../middleware/authorization', () => ({
	authorizationService: {},
	requirePermission: () => (_req: any, _res: any, next: any) => next(),
	requireRole: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityAccess: () => (req: any, _res: any, next: any) => {
		req.user = { id: 'user-route-test' };
		next();
	},
	requireCommunityOwner: () => (_req: any, _res: any, next: any) => next(),
	requireCommunityMeetingAccess: () => (_req: any, _res: any, next: any) => next(),
}));

import communityRoutes from '../../routes/communityRoutes';
import { MemberCreateConflictError } from '../../services/communityService';

const app = express();
app.use(express.json());
app.use('/communities', communityRoutes);

const COMMUNITY_ID = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222';
const url = `/communities/${COMMUNITY_ID}/members/create`;

const VALID_BODY = {
	firstName: 'Juan',
	lastName: 'Pérez',
	email: 'juan@example.com',
	cellPhone: '5551234567',
};

describe('POST /communities/:id/members/create (validación, 409 y audit)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('400 sin firstName — antes el body llegaba crudo al service', async () => {
		const response = await request(app)
			.post(url)
			.send({ ...VALID_BODY, firstName: '' });

		expect(response.status).toBe(400);
		expect(mockCreateCommunityMember).not.toHaveBeenCalled();
	});

	it("email: '' NO da 400 (trampa Zod del repo) y llega al service tal cual", async () => {
		mockCreateCommunityMember.mockResolvedValue({ id: 'm-blank-email' });

		const response = await request(app)
			.post(url)
			.send({ ...VALID_BODY, email: '' });

		expect(response.status).toBe(201);
		expect(mockCreateCommunityMember).toHaveBeenCalledWith(
			COMMUNITY_ID,
			expect.objectContaining({ email: '' }),
		);
	});

	it('400 con linkParticipantId y forceNewParticipant juntos (exclusión mutua)', async () => {
		const response = await request(app)
			.post(url)
			.send({
				...VALID_BODY,
				linkParticipantId: PARTICIPANT_ID,
				forceNewParticipant: true,
			});

		expect(response.status).toBe(400);
		expect(mockCreateCommunityMember).not.toHaveBeenCalled();
	});

	it('409 EXISTING_PARTICIPANT_FOUND: candidates con identidad mínima, sin contacto', async () => {
		mockCreateCommunityMember.mockRejectedValue(
			new MemberCreateConflictError(
				'EXISTING_PARTICIPANT_FOUND',
				{
					candidates: [
						{
							participantId: PARTICIPANT_ID,
							firstName: 'Ana',
							lastName: 'Ruiz',
							matchedBy: 'email',
						},
					],
				},
				'Ya existe una persona registrada con ese correo o teléfono.',
			),
		);

		const response = await request(app).post(url).send(VALID_BODY);

		expect(response.status).toBe(409);
		expect(response.body.code).toBe('EXISTING_PARTICIPANT_FOUND');
		expect(response.body.message).toContain('Ya existe');
		expect(response.body.candidates).toHaveLength(1);
		// SECURITY: solo los 4 campos de identidad — nada de email/cellPhone
		// que convierta el endpoint en un oracle de enumeración.
		expect(Object.keys(response.body.candidates[0]).sort()).toEqual(
			['firstName', 'lastName', 'matchedBy', 'participantId'].sort(),
		);
		expect(response.body.member).toBeUndefined();
	});

	it('409 ALREADY_MEMBER con member {memberId, firstName, lastName}', async () => {
		mockCreateCommunityMember.mockRejectedValue(
			new MemberCreateConflictError(
				'ALREADY_MEMBER',
				{
					member: {
						memberId: 'm-existing',
						firstName: 'Juanito',
						lastName: 'Pérez',
					},
				},
				'Esa persona ya es miembro de esta comunidad.',
			),
		);

		const response = await request(app).post(url).send(VALID_BODY);

		expect(response.status).toBe(409);
		expect(response.body.code).toBe('ALREADY_MEMBER');
		expect(response.body.member).toEqual({
			memberId: 'm-existing',
			firstName: 'Juanito',
			lastName: 'Pérez',
		});
	});

	it('201 con linked:true audita community.member.linked con metadata del vínculo', async () => {
		mockCreateCommunityMember.mockResolvedValue({
			id: 'm-linked',
			participantId: 'p-linked',
			linked: true,
			matchedBy: 'phone',
			changedFields: ['firstName'],
		});

		const response = await request(app)
			.post(url)
			.send({ ...VALID_BODY, linkParticipantId: PARTICIPANT_ID });

		expect(response.status).toBe(201);
		expect(mockAuditLog).toHaveBeenCalledTimes(1);
		expect(mockAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'community.member.linked',
				resourceType: 'community_member',
				resourceId: 'm-linked',
				communityId: COMMUNITY_ID,
				actorUserId: 'user-route-test',
				metadata: {
					participantId: 'p-linked',
					matchedBy: 'phone',
					changedFields: ['firstName'],
				},
			}),
		);
	});

	it('201 sin flags audita community.member.create (no linked)', async () => {
		mockCreateCommunityMember.mockResolvedValue({
			id: 'm-new',
			participantId: 'p-new',
		});

		const response = await request(app).post(url).send(VALID_BODY);

		expect(response.status).toBe(201);
		expect(mockAuditLog).toHaveBeenCalledTimes(1);
		const event = mockAuditLog.mock.calls[0][0];
		expect(event.action).toBe('community.member.create');
		expect(event.metadata).toEqual({ forceNewParticipant: false });
	});

	it('409 PHONE_DUPLICATE_IN_COMMUNITY llega como code, no como 500', async () => {
		mockCreateCommunityMember.mockRejectedValue(
			new Error('PHONE_DUPLICATE_IN_COMMUNITY'),
		);

		const response = await request(app).post(url).send(VALID_BODY);

		expect(response.status).toBe(409);
		expect(response.body.code).toBe('PHONE_DUPLICATE_IN_COMMUNITY');
		expect(mockAuditLog).not.toHaveBeenCalled();
	});
});
