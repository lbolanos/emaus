import { Request, Response } from 'express';
import { getUserFromRequest } from '../utils/auth';
import {
	createTestimonial,
	getTestimonials,
	getTestimonialsByRetreat,
	getUserTestimonials,
	updateTestimonial,
	deleteTestimonial,
	approveForLanding,
	revokeLandingApproval,
	getLandingTestimonials,
	getUserDefaultVisibility,
	setUserDefaultVisibility,
} from '../services/testimonialService';

// ==================== CRUD OPERATIONS ====================

export const createTestimonialController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { content, retreatId, visibility, allowLandingPage } = req.body;
		const testimonial = await createTestimonial(
			user.id,
			content,
			retreatId,
			visibility,
			allowLandingPage ?? false,
		);

		res.status(201).json(testimonial);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getTestimonialsController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const testimonials = await getTestimonials(user.id);
		res.json(testimonials);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getTestimonialsByRetreatController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { retreatId } = req.params;
		const testimonials = await getTestimonialsByRetreat(retreatId, user.id);
		res.json(testimonials);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const getUserTestimonialsController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { userId } = req.params;
		const testimonials = await getUserTestimonials(userId, user.id);
		res.json(testimonials);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const updateTestimonialController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { id } = req.params;
		const { content, visibility, allowLandingPage } = req.body;

		const testimonial = await updateTestimonial(Number(id), user.id, {
			content,
			visibility,
			allowLandingPage,
		});

		res.json(testimonial);
	} catch (error: any) {
		const statusCode = error.message.includes('permiso') ? 403 : 500;
		res.status(statusCode).json({ message: error.message });
	}
};

export const deleteTestimonialController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { id } = req.params;
		await deleteTestimonial(Number(id), user.id);
		res.json({ message: 'Testimonio eliminado' });
	} catch (error: any) {
		const statusCode = error.message.includes('permiso') ? 403 : 500;
		res.status(statusCode).json({ message: error.message });
	}
};

// ==================== LANDING PAGE ====================

export const approveForLandingController = async (req: Request, res: Response): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { id } = req.params;
		const testimonial = await approveForLanding(Number(id), user.id);
		res.json(testimonial);
	} catch (error: any) {
		const statusCode =
			error.message.includes('superadmin') || error.message.includes('permiso') ? 403 : 500;
		res.status(statusCode).json({ message: error.message });
	}
};

export const revokeLandingApprovalController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { id } = req.params;
		const testimonial = await revokeLandingApproval(Number(id), user.id);
		res.json(testimonial);
	} catch (error: any) {
		const statusCode =
			error.message.includes('superadmin') || error.message.includes('permiso') ? 403 : 500;
		res.status(statusCode).json({ message: error.message });
	}
};

export const getLandingTestimonialsController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		// This endpoint is public - no authentication required
		const testimonials = await getLandingTestimonials();
		res.json(testimonials);
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

// ==================== USER PROFILE ====================

export const getDefaultVisibilityController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const visibility = await getUserDefaultVisibility(user.id);
		res.json({ testimonialVisibilityDefault: visibility });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};

export const setDefaultVisibilityController = async (
	req: Request,
	res: Response,
): Promise<void> => {
	try {
		const user = getUserFromRequest(req);
		if (!user) {
			res.status(401).json({ message: 'Usuario no autenticado' });
			return;
		}

		const { testimonialVisibilityDefault } = req.body;
		await setUserDefaultVisibility(user.id, testimonialVisibilityDefault);
		res.json({ message: 'Visibilidad por defecto actualizada', testimonialVisibilityDefault });
	} catch (error: any) {
		res.status(500).json({ message: error.message });
	}
};
