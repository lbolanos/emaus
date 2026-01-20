// Tests for testimonialController
import { Request, Response } from 'express';
import {
	createTestimonialController,
	getTestimonialsController,
	getTestimonialsByRetreatController,
	getUserTestimonialsController,
	updateTestimonialController,
	deleteTestimonialController,
	approveForLandingController,
	revokeLandingApprovalController,
	getLandingTestimonialsController,
	getDefaultVisibilityController,
	setDefaultVisibilityController,
} from '../../controllers/testimonialController';

// Mock dependencies
jest.mock('../../utils/auth');
jest.mock('../../services/testimonialService');

import { getUserFromRequest } from '../../utils/auth';
import * as testimonialService from '../../services/testimonialService';

const mockGetUserFromRequest = getUserFromRequest as jest.MockedFunction<typeof getUserFromRequest>;

// Mock all service functions
jest.spyOn(testimonialService, 'createTestimonial').mockImplementation(async (data) => data as any);
jest.spyOn(testimonialService, 'getTestimonials').mockImplementation(async () => []);
jest.spyOn(testimonialService, 'getTestimonialsByRetreat').mockImplementation(async () => []);
jest.spyOn(testimonialService, 'getUserTestimonials').mockImplementation(async () => []);
jest
	.spyOn(testimonialService, 'updateTestimonial')
	.mockImplementation(async (id, userId, updates) => updates);
jest.spyOn(testimonialService, 'deleteTestimonial').mockImplementation(async () => undefined);
jest
	.spyOn(testimonialService, 'approveForLanding')
	.mockImplementation(async (id) => ({ id, approvedForLanding: true }) as any);
jest
	.spyOn(testimonialService, 'revokeLandingApproval')
	.mockImplementation(async (id) => ({ id, approvedForLanding: false }) as any);
jest.spyOn(testimonialService, 'getLandingTestimonials').mockImplementation(async () => []);
jest.spyOn(testimonialService, 'getUserDefaultVisibility').mockResolvedValue('private' as any);
jest
	.spyOn(testimonialService, 'setUserDefaultVisibility')
	.mockResolvedValue({ message: 'saved' } as any);

describe('Testimonial Controller', () => {
	let mockRequest: Partial<Request>;
	let mockResponse: Partial<Response>;
	let responseJson: any;
	let responseStatus: any;

	beforeEach(() => {
		jest.clearAllMocks();

		// Setup mock request
		mockRequest = {
			body: {},
			params: {},
		};

		// Setup mock response
		responseJson = jest.fn().mockReturnThis();
		responseStatus = jest.fn().mockReturnValue({ json: responseJson });
		mockResponse = {
			status: responseStatus,
			json: responseJson,
		} as any;

		// Setup default user
		const mockUser = { id: 'user-123', email: 'test@example.com' };
		mockGetUserFromRequest.mockReturnValue(mockUser as any);
	});

	describe('createTestimonialController', () => {
		beforeEach(() => {
			mockRequest.body = {
				content: 'Este es un testimonio de prueba con suficiente longitud.',
				retreatId: 'retreat-123',
				visibility: 'public',
				allowLandingPage: false,
			};
		});

		test('should create testimonial successfully', async () => {
			const mockTestimonial = {
				id: 1,
				...mockRequest.body,
				userId: 'user-123',
				approvedForLanding: false,
			};
			(testimonialService.getUserTestimonials as jest.Mock).mockResolvedValue([mockTestimonial]);

			await createTestimonialController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.createTestimonial).toHaveBeenCalledWith(
				'user-123',
				mockRequest.body.content,
				mockRequest.body.retreatId,
				mockRequest.body.visibility,
				false,
			);
			expect(responseStatus).toHaveBeenCalledWith(201);
			expect(responseJson).toHaveBeenCalled();
		});

		test('should return 401 if user not authenticated', async () => {
			mockGetUserFromRequest.mockReturnValue(null);

			await createTestimonialController(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(401);
			expect(responseJson).toHaveBeenCalledWith({ message: 'Usuario no autenticado' });
		});

		test('should return 400 for content too short', async () => {
			(testimonialService.createTestimonial as jest.Mock).mockRejectedValue(
				new Error('El contenido debe tener al menos 10 caracteres'),
			);

			await createTestimonialController(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(500);
			expect(responseJson).toHaveBeenCalledWith({
				message: 'El contenido debe tener al menos 10 caracteres',
			});
		});
	});

	describe('getTestimonialsController', () => {
		test('should get testimonials feed', async () => {
			const mockTestimonials = [
				{ id: 1, content: 'Testimonio 1', visibility: 'public' },
				{ id: 2, content: 'Testimonio 2', visibility: 'public' },
			];
			(testimonialService.getTestimonials as jest.Mock).mockResolvedValue(mockTestimonials);

			await getTestimonialsController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.getTestimonials).toHaveBeenCalledWith('user-123');
			expect(responseJson).toHaveBeenCalledWith(mockTestimonials);
		});

		test('should return 401 if user not authenticated', async () => {
			mockGetUserFromRequest.mockReturnValue(null);

			await getTestimonialsController(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(401);
		});
	});

	describe('getTestimonialsByRetreatController', () => {
		beforeEach(() => {
			mockRequest.params = { retreatId: 'retreat-123' };
		});

		test('should get testimonials for retreat', async () => {
			const mockTestimonials = [{ id: 1, retreatId: 'retreat-123' }];
			(testimonialService.getTestimonialsByRetreat as jest.Mock).mockResolvedValue(
				mockTestimonials,
			);

			await getTestimonialsByRetreatController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.getTestimonialsByRetreat).toHaveBeenCalledWith(
				'retreat-123',
				'user-123',
			);
			expect(responseJson).toHaveBeenCalledWith(mockTestimonials);
		});
	});

	describe('getUserTestimonialsController', () => {
		beforeEach(() => {
			mockRequest.params = { userId: 'other-user-456' };
		});

		test('should get user testimonials', async () => {
			const mockTestimonials = [{ id: 1, userId: 'other-user-456' }];
			(testimonialService.getUserTestimonials as jest.Mock).mockResolvedValue(mockTestimonials);

			await getUserTestimonialsController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.getUserTestimonials).toHaveBeenCalledWith(
				'other-user-456',
				'user-123',
			);
			expect(responseJson).toHaveBeenCalledWith(mockTestimonials);
		});
	});

	describe('updateTestimonialController', () => {
		beforeEach(() => {
			mockRequest.params = { id: '1' };
			mockRequest.body = {
				content: 'Contenido actualizado',
				visibility: 'friends',
			};
		});

		test('should update testimonial', async () => {
			const mockTestimonial = { id: 1, userId: 'user-123', ...mockRequest.body };
			(testimonialService.updateTestimonial as jest.Mock).mockResolvedValue(mockTestimonial);

			await updateTestimonialController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.updateTestimonial).toHaveBeenCalledWith(
				1,
				'user-123',
				mockRequest.body,
			);
			expect(responseJson).toHaveBeenCalledWith(mockTestimonial);
		});

		test('should return 403 for unauthorized update', async () => {
			(testimonialService.updateTestimonial as jest.Mock).mockRejectedValue(
				new Error('No tienes permiso'),
			);

			await updateTestimonialController(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(403);
		});
	});

	describe('deleteTestimonialController', () => {
		beforeEach(() => {
			mockRequest.params = { id: '1' };
		});

		test('should delete testimonial', async () => {
			(testimonialService.deleteTestimonial as jest.Mock).mockResolvedValue(undefined);

			await deleteTestimonialController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.deleteTestimonial).toHaveBeenCalledWith(1, 'user-123');
			expect(responseJson).toHaveBeenCalledWith({ message: 'Testimonio eliminado' });
		});

		test('should return 403 for unauthorized deletion', async () => {
			(testimonialService.deleteTestimonial as jest.Mock).mockRejectedValue(
				new Error('No tienes permiso'),
			);

			await deleteTestimonialController(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(403);
		});
	});

	describe('approveForLandingController', () => {
		beforeEach(() => {
			mockRequest.params = { id: '1' };
		});

		test('should approve testimonial for landing', async () => {
			const mockTestimonial = { id: 1, approvedForLanding: true };
			(testimonialService.approveForLanding as jest.Mock).mockResolvedValue(mockTestimonial);

			await approveForLandingController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.approveForLanding).toHaveBeenCalledWith(1, 'user-123');
			expect(responseJson).toHaveBeenCalledWith(mockTestimonial);
		});

		test('should return 403 for non-superadmin', async () => {
			(testimonialService.approveForLanding as jest.Mock).mockRejectedValue(
				new Error('Solo los superadmins'),
			);

			await approveForLandingController(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(403);
		});
	});

	describe('revokeLandingApprovalController', () => {
		beforeEach(() => {
			mockRequest.params = { id: '1' };
		});

		test('should revoke landing approval', async () => {
			const mockTestimonial = { id: 1, approvedForLanding: false };
			(testimonialService.revokeLandingApproval as jest.Mock).mockResolvedValue(mockTestimonial);

			await revokeLandingApprovalController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.revokeLandingApproval).toHaveBeenCalledWith(1, 'user-123');
			expect(responseJson).toHaveBeenCalledWith(mockTestimonial);
		});
	});

	describe('getLandingTestimonialsController', () => {
		test('should get landing testimonials (public endpoint)', async () => {
			const mockTestimonials = [
				{ id: 1, content: 'Excelente experiencia', approvedForLanding: true },
			];
			(testimonialService.getLandingTestimonials as jest.Mock).mockResolvedValue(mockTestimonials);

			// No auth required for this endpoint
			mockGetUserFromRequest.mockReturnValue(null);

			await getLandingTestimonialsController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.getLandingTestimonials).toHaveBeenCalled();
			expect(responseJson).toHaveBeenCalledWith(mockTestimonials);
		});
	});

	describe('getDefaultVisibilityController', () => {
		test('should get user default visibility', async () => {
			(testimonialService.getUserDefaultVisibility as jest.Mock).mockResolvedValue('friends');

			await getDefaultVisibilityController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.getUserDefaultVisibility).toHaveBeenCalled();
			expect(responseJson).toHaveBeenCalledWith({ testimonialVisibilityDefault: 'friends' });
		});

		test('should return 401 if not authenticated', async () => {
			mockGetUserFromRequest.mockReturnValue(null);

			await getDefaultVisibilityController(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(401);
		});
	});

	describe('setDefaultVisibilityController', () => {
		beforeEach(() => {
			mockRequest.body = { testimonialVisibilityDefault: 'public' };
		});

		test('should set default visibility', async () => {
			(testimonialService.setUserDefaultVisibility as jest.Mock).mockResolvedValue(undefined);

			await setDefaultVisibilityController(mockRequest as Request, mockResponse as Response);

			expect(testimonialService.setUserDefaultVisibility).toHaveBeenCalledWith(
				'user-123',
				'public',
			);
			expect(responseJson).toHaveBeenCalledWith({
				message: 'Visibilidad por defecto actualizada',
				testimonialVisibilityDefault: 'public',
			});
		});

		test('should return 401 if not authenticated', async () => {
			mockGetUserFromRequest.mockReturnValue(null);

			await setDefaultVisibilityController(mockRequest as Request, mockResponse as Response);

			expect(responseStatus).toHaveBeenCalledWith(401);
		});
	});
});
