import { AppDataSource } from '../data-source';
import type { DataSource } from 'typeorm';
import { Testimonial, TestimonialVisibility } from '../entities/testimonial.entity';
import { User } from '../entities/user.entity';
import { UserProfile } from '../entities/userProfile.entity';
import { Friend } from '../entities/friend.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/userRole.entity';
import sanitizeHtml from 'sanitize-html';

// Repositories - will be initialized in functions
let testimonialRepository: any;
let userRepository: any;
let userProfileRepository: any;
let friendRepository: any;
let userRetreatRepository: any;
let userRoleRepository: any;

export const initializeRepositories = (dataSource?: DataSource) => {
	const ds = dataSource || AppDataSource;
	testimonialRepository = ds.getRepository(Testimonial);
	userRepository = ds.getRepository(User);
	userProfileRepository = ds.getRepository(UserProfile);
	friendRepository = ds.getRepository(Friend);
	userRetreatRepository = ds.getRepository(UserRetreat);
	userRoleRepository = ds.getRepository(UserRole);
};

// Initialize with default AppDataSource
initializeRepositories();

// Sanitize HTML content - strip all tags to prevent XSS
const sanitizeContent = (content: string): string => {
	return sanitizeHtml(content, {
		allowedTags: [],
		allowedAttributes: {},
		textFilter: (text) => text.replace(/\n/g, ' '), // Normalize newlines
	});
};

// ==================== VISIBILITY HELPERS ====================

/**
 * Check if user1 and user2 are friends (accepted status)
 */
const areFriends = async (user1Id: string, user2Id: string): Promise<boolean> => {
	const friendship = await friendRepository.findOne({
		where: [
			{ userId: user1Id, friendId: user2Id, status: 'accepted' },
			{ userId: user2Id, friendId: user1Id, status: 'accepted' },
		],
	});
	return !!friendship;
};

/**
 * Check if both users participated in the same retreat
 */
const participatedTogether = async (user1Id: string, user2Id: string): Promise<boolean> => {
	const user1Retreats = await userRetreatRepository.find({
		where: { userId: user1Id },
		select: ['retreatId'],
	});

	const user2Retreats = await userRetreatRepository.find({
		where: { userId: user2Id },
		select: ['retreatId'],
	});

	const user1RetreatIds = new Set(user1Retreats.map((ur: any) => ur.retreatId));
	const user2RetreatIds = new Set(user2Retreats.map((ur: any) => ur.retreatId));

	// Check if there's any common retreat
	for (const retreatId of user1RetreatIds) {
		if (user2RetreatIds.has(retreatId)) {
			return true;
		}
	}

	return false;
};

/**
 * Check if requester is a superadmin
 */
const isSuperadmin = async (userId: string): Promise<boolean> => {
	const user = await userRepository.findOne({
		where: { id: userId },
		relations: ['userRoles', 'userRoles.role'],
	});

	if (!user) return false;

	return user.userRoles.some((ur: any) => ur.role.name === 'superadmin');
};

/**
 * Determine if a testimonial can be viewed by the requester
 */
export const canViewTestimonial = async (
	testimonial: Testimonial,
	requesterId: string | null,
): Promise<boolean> => {
	// Superadmin can see everything
	if (requesterId && (await isSuperadmin(requesterId))) {
		return true;
	}

	// Author can always see their own testimonials
	if (testimonial.userId === requesterId) {
		return true;
	}

	// Not authenticated - only public testimonials
	if (!requesterId) {
		return false;
	}

	switch (testimonial.visibility) {
		case 'public':
			return true;

		case 'friends':
			return await areFriends(testimonial.userId, requesterId);

		case 'retreat_participants':
			return await participatedTogether(testimonial.userId, requesterId);

		case 'private':
		default:
			return false;
	}
};

// ==================== CRUD OPERATIONS ====================

export const createTestimonial = async (
	userId: string,
	content: string,
	retreatId: string | null | undefined,
	visibility: TestimonialVisibility,
	allowLandingPage: boolean,
): Promise<Testimonial> => {
	// Sanitize content to prevent XSS attacks
	const sanitizedContent = sanitizeContent(content);

	if (sanitizedContent.length < 10) {
		throw new Error('El contenido debe tener al menos 10 caracteres');
	}

	if (sanitizedContent.length > 2000) {
		throw new Error('El contenido no puede exceder los 2000 caracteres');
	}

	const testimonial = testimonialRepository.create({
		userId,
		retreatId: retreatId || null,
		content: sanitizedContent,
		visibility,
		allowLandingPage,
	});

	const saved = await testimonialRepository.save(testimonial);

	// Fetch with relations
	const created = await testimonialRepository.findOne({
		where: { id: saved.id },
		relations: ['user', 'retreat'],
	});

	if (!created) {
		throw new Error('Error al crear el testimonio');
	}

	return created;
};

/**
 * Optimized getTestimonials that avoids N+1 query problem
 * by batch loading friendship and participation data
 */
export const getTestimonials = async (requesterId: string | null): Promise<Testimonial[]> => {
	const testimonials = await testimonialRepository.find({
		relations: ['user', 'retreat'],
		order: { createdAt: 'DESC' },
	});

	// Not authenticated - only public testimonials
	if (!requesterId) {
		return testimonials.filter((t: any) => t.visibility === 'public');
	}

	// Check if requester is superadmin
	const superadmin = await isSuperadmin(requesterId);
	if (superadmin) {
		return testimonials; // Superadmin sees everything
	}

	// Batch load user's friendships and retreat participations
	const [friendships, userRetreats] = await Promise.all([
		friendRepository.find({
			where: [
				{ userId: requesterId, status: 'accepted' },
				{ friendId: requesterId, status: 'accepted' },
			],
		}),
		userRetreatRepository.find({
			where: { userId: requesterId },
			select: ['retreatId'],
		}),
	]);

	const friendIds = new Set(
		friendships
			.filter((f: any) => f.userId === requesterId)
			.map((f: any) => f.friendId)
			.concat(friendships.filter((f: any) => f.friendId === requesterId).map((f: any) => f.userId)),
	);
	const userRetreatIds = new Set(userRetreats.map((ur: any) => ur.retreatId));

	// Filter testimonials using pre-loaded data
	return testimonials.filter((testimonial: any) => {
		// Author can see their own
		if (testimonial.userId === requesterId) return true;

		switch (testimonial.visibility) {
			case 'public':
				return true;
			case 'friends':
				return friendIds.has(testimonial.userId);
			case 'retreat_participants':
				// Check if both participated in same retreat
				return userRetreatIds.has(testimonial.retreatId || '');
			case 'private':
			default:
				return false;
		}
	});
};

export const getTestimonialsByRetreat = async (
	retreatId: string,
	requesterId: string | null,
): Promise<Testimonial[]> => {
	const testimonials = await testimonialRepository.find({
		where: { retreatId },
		relations: ['user', 'retreat'],
		order: { createdAt: 'DESC' },
	});

	// Filter by visibility
	const visibleTestimonials: Testimonial[] = [];
	for (const testimonial of testimonials) {
		if (await canViewTestimonial(testimonial, requesterId)) {
			visibleTestimonials.push(testimonial);
		}
	}

	return visibleTestimonials;
};

export const getUserTestimonials = async (
	userId: string,
	requesterId: string | null,
): Promise<Testimonial[]> => {
	const testimonials = await testimonialRepository.find({
		where: { userId },
		relations: ['user', 'retreat'],
		order: { createdAt: 'DESC' },
	});

	// Filter by visibility
	const visibleTestimonials: Testimonial[] = [];
	for (const testimonial of testimonials) {
		if (await canViewTestimonial(testimonial, requesterId)) {
			visibleTestimonials.push(testimonial);
		}
	}

	return visibleTestimonials;
};

export const getTestimonialById = async (
	id: number,
	requesterId: string | null,
): Promise<Testimonial | null> => {
	const testimonial = await testimonialRepository.findOne({
		where: { id },
		relations: ['user', 'retreat'],
	});

	if (!testimonial) {
		return null;
	}

	if (await canViewTestimonial(testimonial, requesterId)) {
		return testimonial;
	}

	return null;
};

export const updateTestimonial = async (
	id: number,
	userId: string,
	updates: {
		content?: string;
		visibility?: TestimonialVisibility;
		allowLandingPage?: boolean;
	},
): Promise<Testimonial> => {
	const testimonial = await testimonialRepository.findOne({
		where: { id },
	});

	if (!testimonial) {
		throw new Error('Testimonio no encontrado');
	}

	// Check ownership
	if (testimonial.userId !== userId) {
		// Allow superadmin to approve for landing
		const superadmin = await isSuperadmin(userId);
		if (!superadmin) {
			throw new Error('No tienes permiso para editar este testimonio');
		}

		// Superadmin can only update allowLandingPage field
		const hasOtherUpdates = Object.keys(updates).some((key) => key !== 'allowLandingPage');
		if (hasOtherUpdates) {
			throw new Error('Los superadmins solo pueden modificar la aprobación de landing page');
		}
	}

	if (updates.content !== undefined) {
		const sanitizedContent = sanitizeContent(updates.content);
		if (sanitizedContent.length < 10) {
			throw new Error('El contenido debe tener al menos 10 caracteres');
		}
		if (sanitizedContent.length > 2000) {
			throw new Error('El contenido no puede exceder los 2000 caracteres');
		}
		testimonial.content = sanitizedContent;
	}

	if (updates.visibility !== undefined) {
		testimonial.visibility = updates.visibility;
	}

	if (updates.allowLandingPage !== undefined) {
		testimonial.allowLandingPage = updates.allowLandingPage;
	}

	const saved = await testimonialRepository.save(testimonial);

	// Fetch with relations to return complete data
	const withRelations = await testimonialRepository.findOne({
		where: { id: saved.id },
		relations: ['user', 'retreat'],
	});

	if (!withRelations) {
		throw new Error('Error al cargar el testimonio actualizado');
	}

	return withRelations;
};

export const deleteTestimonial = async (id: number, userId: string): Promise<void> => {
	const testimonial = await testimonialRepository.findOne({
		where: { id },
	});

	if (!testimonial) {
		throw new Error('Testimonio no encontrado');
	}

	// Check ownership or superadmin
	if (testimonial.userId !== userId && !(await isSuperadmin(userId))) {
		throw new Error('No tienes permiso para eliminar este testimonio');
	}

	await testimonialRepository.remove(testimonial);
};

// ==================== LANDING PAGE ====================

export const approveForLanding = async (id: number, superadminId: string): Promise<Testimonial> => {
	// Verify superadmin
	if (!(await isSuperadmin(superadminId))) {
		throw new Error('Solo los superadmins pueden aprobar testimonios para la landing page');
	}

	const testimonial = await testimonialRepository.findOne({
		where: { id },
	});

	if (!testimonial) {
		throw new Error('Testimonio no encontrado');
	}

	if (!testimonial.allowLandingPage) {
		throw new Error(
			'El usuario no ha autorizado la publicación de este testimonio en la landing page',
		);
	}

	testimonial.approvedForLanding = true;
	return await testimonialRepository.save(testimonial);
};

export const revokeLandingApproval = async (
	id: number,
	superadminId: string,
): Promise<Testimonial> => {
	// Verify superadmin
	if (!(await isSuperadmin(superadminId))) {
		throw new Error('Solo los superadmins pueden revocar la aprobación de testimonios');
	}

	const testimonial = await testimonialRepository.findOne({
		where: { id },
	});

	if (!testimonial) {
		throw new Error('Testimonio no encontrado');
	}

	testimonial.approvedForLanding = false;
	return await testimonialRepository.save(testimonial);
};

export const getLandingTestimonials = async (): Promise<Testimonial[]> => {
	const testimonials = await testimonialRepository.find({
		where: {
			allowLandingPage: true,
			approvedForLanding: true,
		},
		relations: ['user', 'retreat'],
		order: { createdAt: 'DESC' },
		take: 10,
	});
	return testimonials;
};

// ==================== USER PROFILE ====================

export const getUserDefaultVisibility = async (userId: string): Promise<TestimonialVisibility> => {
	const user = await userRepository.findOne({
		where: { id: userId },
		relations: ['profile'],
	});

	return user?.profile?.testimonialVisibilityDefault || 'private';
};

export const setUserDefaultVisibility = async (
	userId: string,
	visibility: TestimonialVisibility,
): Promise<void> => {
	const user = await userRepository.findOne({
		where: { id: userId },
		relations: ['profile'],
	});

	if (!user?.profile) {
		throw new Error('Perfil de usuario no encontrado');
	}

	user.profile.testimonialVisibilityDefault = visibility;
	await userProfileRepository.save(user.profile);
};
