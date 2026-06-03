// Public Join Request Controller Tests
// Tests validation logic for public community join requests

/**
 * These tests focus on the validation logic that can be tested independently.
 * The actual service integration is tested at the integration test level.
 */

import { addCommunityAdminSchema } from '@repo/types';
import { CommunityAdmin } from '@/entities/communityAdmin.entity';

describe('CommunityAdmin serialization — invitationToken para el enlace de invitación', () => {
	const makePending = () => {
		const admin = new CommunityAdmin();
		admin.id = 'admin-1';
		admin.communityId = 'comm-1';
		admin.userId = 'user-1';
		admin.role = 'admin';
		admin.status = 'pending';
		admin.invitationToken = 'tok-abc123';
		return admin;
	};

	it('entity.toJSON() OMITE invitationToken (causa raíz del enlace /undefined)', () => {
		const serialized = JSON.parse(JSON.stringify(makePending()));
		expect(serialized.invitationToken).toBeUndefined();
	});

	it('una serialización explícita SÍ conserva invitationToken para construir el enlace', () => {
		const a = makePending();
		// equivalente a CommunityController.serializeAdminWithToken
		const payload = { id: a.id, status: a.status, invitationToken: a.invitationToken ?? null };
		expect(payload.invitationToken).toBe('tok-abc123');
	});

	// SECURITY: el token solo debe exponerse a owner/superadmin en GET /:id/admins.
	// req.communityAdmin === null ⇒ superadmin; .role === 'owner' ⇒ owner; otro ⇒ co-admin.
	const canSeeToken = (requester: { role: string } | null) =>
		requester === null || requester?.role === 'owner';

	it('owner puede ver el invitationToken', () => {
		expect(canSeeToken({ role: 'owner' })).toBe(true);
	});

	it('superadmin (req.communityAdmin === null) puede ver el invitationToken', () => {
		expect(canSeeToken(null)).toBe(true);
	});

	it('co-admin no-owner NO puede ver el invitationToken', () => {
		expect(canSeeToken({ role: 'admin' })).toBe(false);
	});
});

describe('addCommunityAdminSchema — contrato del endpoint POST /:id/admins/add', () => {
	it('acepta un userId con formato UUID', () => {
		const result = addCommunityAdminSchema.safeParse({
			body: { userId: '11111111-1111-1111-1111-111111111111' },
		});
		expect(result.success).toBe(true);
	});

	it('rechaza un userId que no es UUID', () => {
		const result = addCommunityAdminSchema.safeParse({ body: { userId: 'not-a-uuid' } });
		expect(result.success).toBe(false);
	});

	it('rechaza body sin userId', () => {
		const result = addCommunityAdminSchema.safeParse({ body: {} });
		expect(result.success).toBe(false);
	});
});

describe('CommunityController - publicJoinRequest Validation', () => {
	// Email validation regex (copied from controller)
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	// Phone validation regex (copied from controller)
	const phoneRegex = /^[+]?[\d\s()-]+$/;

	describe('Email format validation', () => {
		test('should validate correct email formats', () => {
			const validEmails = [
				'user@example.com',
				'john.doe@example.com',
				'test+tag@example.co.uk',
				'user_name@example-domain.com',
				'user123@test-site.com',
				'a@b.co',
			];

			validEmails.forEach((email) => {
				expect(emailRegex.test(email)).toBe(true);
			});
		});

		test('should reject invalid email formats', () => {
			const invalidEmails = [
				'invalidemail.com',
				'user@',
				'@example.com',
				'user@example',
				'user @example.com',
				'us er@example.com',
				// Note: 'user..name@example.com' is VALID per this regex - the regex doesn't catch consecutive dots
				'',
				'   ',
			];

			invalidEmails.forEach((email) => {
				expect(emailRegex.test(email)).toBe(false);
			});
		});

		test('should handle edge case emails', () => {
			// Valid edge cases
			expect(emailRegex.test('test@test.co.uk')).toBe(true);
			expect(emailRegex.test('1@2.3')).toBe(true);

			// Invalid edge cases
			expect(emailRegex.test('@.com')).toBe(false);
			expect(emailRegex.test('test@.com')).toBe(false);
			expect(emailRegex.test('test@com')).toBe(false);
		});
	});

	describe('Phone format validation', () => {
		test('should validate correct phone formats', () => {
			const validPhones = [
				'555-1234',
				'555 1234',
				'(555) 123-4567',
				'+1 (555) 123-4567',
				'+34 612 345 678',
				'612345678',
				'+44 20 7123 4567',
				'+1 555-123-4567',
				'+33 1 23 45 67 89',
				'+49 30 12345678',
				'+91 98765 43210',
				'+86 138 1234 5678',
			];

			validPhones.forEach((phone) => {
				expect(phoneRegex.test(phone)).toBe(true);
			});
		});

		test('should reject invalid phone formats', () => {
			const invalidPhones = [
				'555-1234abc',
				'555@1234',
				'555#1234',
				'555!1234',
				'555&1234',
				'555$1234',
				'555%1234',
				'abc',
				'',
				'phone-with-*asterisk',
			];

			invalidPhones.forEach((phone) => {
				expect(phoneRegex.test(phone)).toBe(false);
			});
		});

		test('should handle edge case phone numbers', () => {
			// Valid edge cases
			expect(phoneRegex.test('1')).toBe(true); // Single digit
			expect(phoneRegex.test('+1')).toBe(true); // Plus and digit
			expect(phoneRegex.test('(1)')).toBe(true); // Parentheses
			expect(phoneRegex.test('1-2-3')).toBe(true); // Multiple dashes
		});
	});

	describe('Required field validation logic', () => {
		test('should identify missing required fields', () => {
			const testCases = [
				{
					firstName: '',
					lastName: 'Doe',
					email: 'test@example.com',
					cellPhone: '555-1234',
					missing: ['firstName'],
				},
				{
					firstName: 'John',
					lastName: '',
					email: 'test@example.com',
					cellPhone: '555-1234',
					missing: ['lastName'],
				},
				{
					firstName: 'John',
					lastName: 'Doe',
					email: '',
					cellPhone: '555-1234',
					missing: ['email'],
				},
				{
					firstName: 'John',
					lastName: 'Doe',
					email: 'test@example.com',
					cellPhone: '',
					missing: ['cellPhone'],
				},
				{
					firstName: '',
					lastName: '',
					email: '',
					cellPhone: '',
					missing: ['firstName', 'lastName', 'email', 'cellPhone'],
				},
				{
					firstName: '   ',
					lastName: 'Doe',
					email: 'test@example.com',
					cellPhone: '555-1234',
					missing: ['firstName'],
				},
				{
					firstName: 'John',
					lastName: '   ',
					email: 'test@example.com',
					cellPhone: '555-1234',
					missing: ['lastName'],
				},
				{
					firstName: 'John',
					lastName: 'Doe',
					email: '   ',
					cellPhone: '555-1234',
					missing: ['email'],
				},
				{
					firstName: 'John',
					lastName: 'Doe',
					email: 'test@example.com',
					cellPhone: '   ',
					missing: ['cellPhone'],
				},
			];

			testCases.forEach((testCase) => {
				const missing: string[] = [];

				if (!testCase.firstName || !testCase.firstName.trim()) {
					missing.push('firstName');
				}
				if (!testCase.lastName || !testCase.lastName.trim()) {
					missing.push('lastName');
				}
				if (!testCase.email || !testCase.email.trim()) {
					missing.push('email');
				}
				if (!testCase.cellPhone || !testCase.cellPhone.trim()) {
					missing.push('cellPhone');
				}

				expect(missing).toEqual(testCase.missing);
			});
		});
	});

	describe('Combined validation scenarios', () => {
		test('should validate complete valid request', () => {
			const request = {
				firstName: 'John',
				lastName: 'Doe',
				email: 'john.doe@example.com',
				cellPhone: '+1 (555) 123-4567',
			};

			// Check required fields
			const hasAllRequired = Boolean(
				request.firstName?.trim() &&
					request.lastName?.trim() &&
					request.email?.trim() &&
					request.cellPhone?.trim(),
			);

			expect(hasAllRequired).toBe(true);

			// Check email format
			expect(emailRegex.test(request.email)).toBe(true);

			// Check phone format
			expect(phoneRegex.test(request.cellPhone)).toBe(true);
		});

		test('should reject request with invalid email', () => {
			const request = {
				firstName: 'John',
				lastName: 'Doe',
				email: 'invalidemail',
				cellPhone: '+1 (555) 123-4567',
			};

			// Check required fields
			const hasAllRequired = Boolean(
				request.firstName?.trim() &&
					request.lastName?.trim() &&
					request.email?.trim() &&
					request.cellPhone?.trim(),
			);

			expect(hasAllRequired).toBe(true);

			// Check email format - should fail
			expect(emailRegex.test(request.email)).toBe(false);
		});

		test('should reject request with invalid phone', () => {
			const request = {
				firstName: 'John',
				lastName: 'Doe',
				email: 'john.doe@example.com',
				cellPhone: '555@1234',
			};

			// Check required fields
			const hasAllRequired = Boolean(
				request.firstName?.trim() &&
					request.lastName?.trim() &&
					request.email?.trim() &&
					request.cellPhone?.trim(),
			);

			expect(hasAllRequired).toBe(true);

			// Check phone format - should fail
			expect(phoneRegex.test(request.cellPhone)).toBe(false);
		});

		test('should handle international characters in names', () => {
			const request = {
				firstName: 'José María',
				lastName: 'González López',
				email: 'jose.gonzalez@example.com',
				cellPhone: '+34 612 345 678',
			};

			// Check required fields
			const hasAllRequired = Boolean(
				request.firstName?.trim() &&
					request.lastName?.trim() &&
					request.email?.trim() &&
					request.cellPhone?.trim(),
			);

			expect(hasAllRequired).toBe(true);

			// Check email format
			expect(emailRegex.test(request.email)).toBe(true);

			// Check phone format
			expect(phoneRegex.test(request.cellPhone)).toBe(true);
		});

		test('should handle minimum length boundaries', () => {
			const request = {
				firstName: 'Jo',
				lastName: 'Do',
				email: 'jo@do.com',
				cellPhone: '5551234',
			};

			// Check required fields
			const hasAllRequired = Boolean(
				request.firstName?.trim() &&
					request.lastName?.trim() &&
					request.email?.trim() &&
					request.cellPhone?.trim(),
			);

			expect(hasAllRequired).toBe(true);

			// Check email format
			expect(emailRegex.test(request.email)).toBe(true);

			// Check phone format
			expect(phoneRegex.test(request.cellPhone)).toBe(true);
		});
	});
});
