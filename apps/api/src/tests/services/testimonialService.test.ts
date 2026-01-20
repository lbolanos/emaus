import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { UserProfile } from '@/entities/userProfile.entity';
import { Friend } from '@/entities/friend.entity';
import { UserRetreat } from '@/entities/userRetreat.entity';
import { Testimonial, TestimonialVisibility } from '@/entities/testimonial.entity';
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
	setUserDefaultVisibility,
	initializeRepositories,
} from '@/services/testimonialService';

// Helper to get testDataSource
const getTestDataSource = () => TestDataFactory['testDataSource'];

/**
 * Testimonial Service Tests
 *
 * Tests for the testimonial service including:
 * - CRUD operations
 * - Visibility logic (public, friends, retreat_participants, private)
 * - Landing page approval (superadmin only)
 * - User preferences
 */
describe('Testimonial Service', () => {
	let user1: User;
	let user2: User;
	let user3: User;
	let superuser: User;
	let retreat: any;
	let superadminRole: any;

	beforeAll(async () => {
		await setupTestDatabase();

		// Re-initialize testimonial service repositories with test data source
		initializeRepositories();

		// Create superadmin role once (persists across tests)
		superadminRole = await TestDataFactory.createTestRole({ name: 'superadmin' });
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();

		// Create regular users
		user1 = await TestDataFactory.createTestUser({ displayName: 'User One' });
		user2 = await TestDataFactory.createTestUser({ displayName: 'User Two' });
		user3 = await TestDataFactory.createTestUser({ displayName: 'User Three' });
		superuser = await TestDataFactory.createTestUser({ displayName: 'Super User' });

		// Create a retreat
		retreat = await TestDataFactory.createTestRetreat();
	});

	describe('createTestimonial', () => {
		test('should create a testimonial with valid data', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Este retiro cambió mi vida. Muy agradecido por la experiencia.',
				retreat.id,
				'public',
				false,
			);

			expect(testimonial).toBeDefined();
			expect(testimonial.id).toBeDefined();
			expect(testimonial.userId).toBe(user1.id);
			expect(testimonial.content).toBe(
				'Este retiro cambió mi vida. Muy agradecido por la experiencia.',
			);
			expect(testimonial.retreatId).toBe(retreat.id);
			expect(testimonial.visibility).toBe('public');
			expect(testimonial.allowLandingPage).toBe(false);
			expect(testimonial.approvedForLanding).toBe(false);
		});

		test('should create testimonial without retreat', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Comparto mi experiencia personal de crecimiento.',
				null,
				'private',
				false,
			);

			expect(testimonial.retreatId).toBeNull();
		});

		test('should reject testimonial with content < 10 characters', async () => {
			await expect(
				createTestimonial(user1.id, 'Corto', retreat.id, 'public', false),
			).rejects.toThrow('El contenido debe tener al menos 10 caracteres');
		});

		test('should reject testimonial with content > 2000 characters', async () => {
			const longContent = 'x'.repeat(2001);
			await expect(
				createTestimonial(user1.id, longContent, retreat.id, 'public', false),
			).rejects.toThrow('El contenido no puede exceder los 2000 caracteres');
		});

		test('should create testimonial with landing permission', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Una experiencia increíble que recomiendo a todos.',
				retreat.id,
				'public',
				true,
			);

			expect(testimonial.allowLandingPage).toBe(true);
		});
	});

	describe('getTestimonials - Visibility Logic', () => {
		test('should only return public testimonials to unrelated users', async () => {
			// Create testimonials with different visibilities
			await createTestimonial(user1.id, 'Público - todos pueden ver', retreat.id, 'public', false);
			await createTestimonial(user1.id, 'Amigos - solo amigos', retreat.id, 'friends', false);
			await createTestimonial(
				user1.id,
				'Retiro - participantes del retiro',
				retreat.id,
				'retreat_participants',
				false,
			);
			await createTestimonial(user1.id, 'Privado - solo yo', retreat.id, 'private', false);

			// Unrelated user should only see public
			const testimonials = await getTestimonials(user2.id);
			expect(testimonials).toHaveLength(1);
			expect(testimonials[0].visibility).toBe('public');
		});

		test('should return friends testimonials to friends', async () => {
			// Make user1 and user2 friends
			const friendRepository = getTestDataSource().getRepository(Friend);
			await friendRepository.save({
				userId: user1.id,
				friendId: user2.id,
				status: 'accepted',
				initiatedByUser: true,
			});

			await createTestimonial(user1.id, 'Solo amigos', retreat.id, 'friends', false);
			await createTestimonial(user1.id, 'Privado - solo yo', retreat.id, 'private', false);

			const testimonials = await getTestimonials(user2.id);
			expect(testimonials).toHaveLength(1); // Only friends, not private
			expect(testimonials[0].visibility).toBe('friends');
		});

		test('should return retreat_participants testimonials to retreat participants', async () => {
			// Add both users to the same retreat
			const userRetreatRepository = getTestDataSource().getRepository(UserRetreat);
			await userRetreatRepository.save({
				userId: user1.id,
				retreatId: retreat.id,
				roleId: 1,
				status: 'active',
			});
			await userRetreatRepository.save({
				userId: user2.id,
				retreatId: retreat.id,
				roleId: 1,
				status: 'active',
			});

			await createTestimonial(
				user1.id,
				'Participantes del retiro',
				retreat.id,
				'retreat_participants',
				false,
			);
			await createTestimonial(user1.id, 'Privado - solo yo', retreat.id, 'private', false);

			const testimonials = await getTestimonials(user2.id);
			expect(testimonials).toHaveLength(1); // Only retreat_participants, not private
			expect(testimonials[0].visibility).toBe('retreat_participants');
		});

		test('should return own testimonials regardless of visibility', async () => {
			await createTestimonial(user1.id, 'Público para todos', retreat.id, 'public', false);
			await createTestimonial(user1.id, 'Solo amigos', retreat.id, 'friends', false);
			await createTestimonial(
				user1.id,
				'Participantes del retiro',
				retreat.id,
				'retreat_participants',
				false,
			);
			await createTestimonial(user1.id, 'Privado - solo yo', retreat.id, 'private', false);

			const testimonials = await getTestimonials(user1.id);
			expect(testimonials).toHaveLength(4);
		});

		test('should return all testimonials to superadmin', async () => {
			// Make superuser a superadmin
			const { UserRole } = await import('@/entities/userRole.entity');
			const userRoleRepository = getTestDataSource().getRepository(UserRole);
			await userRoleRepository.save({
				userId: superuser.id,
				roleId: superadminRole.id,
			});

			await createTestimonial(user1.id, 'Público para todos', retreat.id, 'public', false);
			await createTestimonial(user1.id, 'Privado - solo yo', retreat.id, 'private', false);

			const testimonials = await getTestimonials(superuser.id);
			expect(testimonials).toHaveLength(2);
		});
	});

	describe('updateTestimonial', () => {
		test('should update own testimonial', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Contenido original',
				retreat.id,
				'private',
				false,
			);

			const updated = await updateTestimonial(testimonial.id, user1.id, {
				content: 'Contenido actualizado',
				visibility: 'public',
				allowLandingPage: true,
			});

			expect(updated.content).toBe('Contenido actualizado');
			expect(updated.visibility).toBe('public');
			expect(updated.allowLandingPage).toBe(true);
		});

		test('should prevent non-owner from updating testimonial', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Contenido original',
				retreat.id,
				'private',
				false,
			);

			await expect(
				updateTestimonial(testimonial.id, user2.id, {
					content: 'Intento de modificación',
				}),
			).rejects.toThrow();
		});

		test('should allow superadmin to approve landing (not modify content)', async () => {
			// Make superuser a superadmin
			const { UserRole } = await import('@/entities/userRole.entity');
			const userRoleRepository = getTestDataSource().getRepository(UserRole);
			await userRoleRepository.save({
				userId: superuser.id,
				roleId: superadminRole.id,
			});

			const testimonial = await createTestimonial(
				user1.id,
				'Contenido válido',
				retreat.id,
				'public',
				true,
			);

			const updated = await updateTestimonial(testimonial.id, superuser.id, {
				allowLandingPage: false,
			});

			expect(updated.allowLandingPage).toBe(false);
		});
	});

	describe('deleteTestimonial', () => {
		test('should delete own testimonial', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Contenido a eliminar',
				retreat.id,
				'private',
				false,
			);

			await deleteTestimonial(testimonial.id, user1.id);

			// Verify it's deleted
			const testimonialRepository = getTestDataSource().getRepository(Testimonial);
			const deleted = await testimonialRepository.findOne({ where: { id: testimonial.id } });
			expect(deleted).toBeNull();
		});

		test('should prevent non-owner from deleting testimonial', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Contenido protegido',
				retreat.id,
				'private',
				false,
			);

			await expect(deleteTestimonial(testimonial.id, user2.id)).rejects.toThrow();
		});

		test('should allow superadmin to delete any testimonial', async () => {
			// Make superuser a superadmin
			const { UserRole } = await import('@/entities/userRole.entity');
			const userRoleRepository = getTestDataSource().getRepository(UserRole);
			await userRoleRepository.save({
				userId: superuser.id,
				roleId: superadminRole.id,
			});

			const testimonial = await createTestimonial(
				user1.id,
				'Contenido válido',
				retreat.id,
				'private',
				false,
			);

			await deleteTestimonial(testimonial.id, superuser.id);

			// Verify it's deleted
			const testimonialRepository = getTestDataSource().getRepository(Testimonial);
			const deleted = await testimonialRepository.findOne({ where: { id: testimonial.id } });
			expect(deleted).toBeNull();
		});
	});

	describe('Landing Page Approval', () => {
		test('should approve testimonial for landing when user authorized', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Excelente experiencia',
				retreat.id,
				'public',
				true, // allowLandingPage = true
			);

			// Make superuser a superadmin
			const { UserRole } = await import('@/entities/userRole.entity');
			const userRoleRepository = getTestDataSource().getRepository(UserRole);
			await userRoleRepository.save({
				userId: superuser.id,
				roleId: superadminRole.id,
			});

			const approved = await approveForLanding(testimonial.id, superuser.id);
			expect(approved.approvedForLanding).toBe(true);
		});

		test('should not approve testimonial for landing if user did not authorize', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Contenido válido',
				retreat.id,
				'public',
				false, // allowLandingPage = false
			);

			// Make superuser a superadmin
			const { UserRole } = await import('@/entities/userRole.entity');
			const userRoleRepository = getTestDataSource().getRepository(UserRole);
			await userRoleRepository.save({
				userId: superuser.id,
				roleId: superadminRole.id,
			});

			await expect(approveForLanding(testimonial.id, superuser.id)).rejects.toThrow(
				'El usuario no ha autorizado la publicación',
			);
		});

		test('should only allow superadmin to approve for landing', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Contenido válido',
				retreat.id,
				'public',
				true,
			);

			await expect(approveForLanding(testimonial.id, user1.id)).rejects.toThrow(
				'Solo los superadmins pueden aprobar',
			);
		});

		test('should revoke landing approval', async () => {
			const testimonial = await createTestimonial(
				user1.id,
				'Contenido válido',
				retreat.id,
				'public',
				true,
			);

			// Make superuser a superadmin
			const { UserRole } = await import('@/entities/userRole.entity');
			const userRoleRepository = getTestDataSource().getRepository(UserRole);
			await userRoleRepository.save({
				userId: superuser.id,
				roleId: superadminRole.id,
			});

			await approveForLanding(testimonial.id, superuser.id);
			expect(testimonial.approvedForLanding).toBe(false); // Not yet refreshed

			const revoked = await revokeLandingApproval(testimonial.id, superuser.id);
			expect(revoked.approvedForLanding).toBe(false);
		});

		test('should get landing testimonials (public endpoint)', async () => {
			// Create testimonial: authorized and approved
			const t1 = await createTestimonial(
				user1.id,
				'Testimonio autorizado y aprobado',
				retreat.id,
				'public',
				true,
			);

			// Make superuser a superadmin
			const { UserRole } = await import('@/entities/userRole.entity');
			const userRoleRepository = getTestDataSource().getRepository(UserRole);
			await userRoleRepository.save({
				userId: superuser.id,
				roleId: superadminRole.id,
			});

			await approveForLanding(t1.id, superuser.id);

			// Create testimonial: authorized but not approved
			await createTestimonial(
				user1.id,
				'Testimonio autorizado pero no aprobado',
				retreat.id,
				'public',
				true,
			);

			// Create testimonial: not authorized
			await createTestimonial(user1.id, 'Testimonio no autorizado', retreat.id, 'public', false);

			const landingTestimonials = await getLandingTestimonials();
			expect(landingTestimonials).toHaveLength(1);
			expect(landingTestimonials[0].id).toBe(t1.id);
		});
	});

	describe('User Preferences', () => {
		test('should set and get default visibility', async () => {
			// Create user profile
			const profileRepository = getTestDataSource().getRepository(UserProfile);
			await profileRepository.save({
				userId: user1.id,
			});

			await setUserDefaultVisibility(user1.id, 'friends' as TestimonialVisibility);

			// Get directly from repository to verify
			const profile = await profileRepository.findOne({ where: { userId: user1.id } });
			expect(profile?.testimonialVisibilityDefault).toBe('friends');
		});

		test('should update existing default visibility', async () => {
			// Create user profile with initial value
			const profileRepository = getTestDataSource().getRepository(UserProfile);
			await profileRepository.save({
				userId: user1.id,
				testimonialVisibilityDefault: 'private' as TestimonialVisibility,
			});

			await setUserDefaultVisibility(user1.id, 'public' as TestimonialVisibility);

			const profile = await profileRepository.findOne({ where: { userId: user1.id } });
			expect(profile?.testimonialVisibilityDefault).toBe('public');
		});
	});

	describe('getTestimonialsByRetreat', () => {
		test('should get testimonials for specific retreat', async () => {
			// Create another retreat
			const retreat2 = await TestDataFactory.createTestRetreat();

			await createTestimonial(user1.id, 'Testimonio retiro 1', retreat.id, 'public', false);
			await createTestimonial(user1.id, 'Testimonio retiro 2', retreat2.id, 'public', false);

			const testimonials = await getTestimonialsByRetreat(retreat.id, user1.id);
			expect(testimonials).toHaveLength(1);
			expect(testimonials[0].retreatId).toBe(retreat.id);
		});

		test('should apply visibility filter to retreat testimonials', async () => {
			await createTestimonial(user1.id, 'Público para todos', retreat.id, 'public', false);
			await createTestimonial(user1.id, 'Privado - solo yo', retreat.id, 'private', false);

			const testimonials = await getTestimonialsByRetreat(retreat.id, user2.id);
			expect(testimonials).toHaveLength(1); // Only public
		});
	});

	describe('getUserTestimonials', () => {
		test('should get testimonials for specific user', async () => {
			await createTestimonial(user1.id, 'Testimonio usuario 1', retreat.id, 'public', false);
			await createTestimonial(user2.id, 'Testimonio usuario 2', retreat.id, 'public', false);

			const testimonials = await getUserTestimonials(user1.id, user1.id);
			expect(testimonials).toHaveLength(1);
			expect(testimonials[0].userId).toBe(user1.id);
		});

		test('should apply visibility filter to user testimonials', async () => {
			await createTestimonial(user1.id, 'Público para todos', retreat.id, 'public', false);
			await createTestimonial(user1.id, 'Privado - solo yo', retreat.id, 'private', false);

			const testimonials = await getUserTestimonials(user1.id, user2.id);
			expect(testimonials).toHaveLength(1); // Only public
		});
	});
});
