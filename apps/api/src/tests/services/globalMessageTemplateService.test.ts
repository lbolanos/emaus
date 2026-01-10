import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { GlobalMessageTemplateService } from '@/services/globalMessageTemplateService';
import {
	GlobalMessageTemplate,
	GlobalMessageTemplateType,
} from '@/entities/globalMessageTemplate.entity';
import { Retreat } from '@/entities/retreat.entity';
import { User } from '@/entities/user.entity';

describe('GlobalMessageTemplateService', () => {
	let service: GlobalMessageTemplateService;
	let testUser: User;
	let testRetreat: Retreat;

	beforeAll(async () => {
		await setupTestDatabase();
		service = new GlobalMessageTemplateService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Also explicitly clear global_message_templates
		await TestDataFactory.getDataSource().query('DELETE FROM global_message_templates;');
		testUser = await TestDataFactory.createTestUser();
		testRetreat = await TestDataFactory.createTestRetreat();
	});

	describe('Template CRUD', () => {
		it('should get all templates ordered by name', async () => {
			// Create multiple templates with valid enum types
			await TestDataFactory.createGlobalMessageTemplate({
				name: 'Zebra Template',
				type: GlobalMessageTemplateType.GENERAL,
			});
			await TestDataFactory.createGlobalMessageTemplate({
				name: 'Alpha Template',
				type: GlobalMessageTemplateType.WALKER_WELCOME,
			});
			await TestDataFactory.createGlobalMessageTemplate({
				name: 'Middle Template',
				type: GlobalMessageTemplateType.SERVER_WELCOME,
			});

			const templates = await service.getAll();

			expect(templates.length).toBeGreaterThanOrEqual(3);
			// Check they're ordered by name
			const names = templates.map((t) => t.name);
			const sortedNames = [...names].sort();
			expect(names).toEqual(sortedNames);
		});

		it('should get template by id', async () => {
			const template = await TestDataFactory.createGlobalMessageTemplate({
				name: 'Find Me Template',
				type: GlobalMessageTemplateType.GENERAL,
			});

			const found = await service.getById(template.id);

			expect(found).not.toBeNull();
			expect(found?.id).toBe(template.id);
			expect(found?.name).toBe('Find Me Template');
		});

		it('should return null for non-existent template id', async () => {
			const found = await service.getById('non-existent-id');
			expect(found).toBeNull();
		});

		it('should get templates by type', async () => {
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.WALKER_WELCOME,
				isActive: true,
			});
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.WALKER_WELCOME,
				isActive: true,
			});
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SERVER_WELCOME,
				isActive: true,
			});
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.WALKER_WELCOME,
				isActive: false,
			});

			const templates = await service.getByType(GlobalMessageTemplateType.WALKER_WELCOME);

			expect(templates.length).toBe(2);
			expect(templates.every((t) => t.isActive)).toBe(true);
		});

		it('should create new template', async () => {
			const templateData = {
				name: 'New Template',
				type: GlobalMessageTemplateType.GENERAL,
				message: '<h1>Subject</h1><p>Body</p>',
				isActive: true,
			};

			const template = await service.create(templateData);

			expect(template).toBeDefined();
			expect(template.id).toBeDefined();
			expect(template.name).toBe('New Template');
			expect(template.type).toBe(GlobalMessageTemplateType.GENERAL);
		});

		it('should update template', async () => {
			const template = await TestDataFactory.createGlobalMessageTemplate({
				name: 'Original Name',
				type: GlobalMessageTemplateType.GENERAL,
			});

			const updated = await service.update(template.id, {
				name: 'Updated Name',
				message: '<h1>New Subject</h1>',
			});

			expect(updated).not.toBeNull();
			expect(updated?.name).toBe('Updated Name');
			expect(updated?.message).toContain('New Subject');
		});

		it('should return null when updating non-existent template', async () => {
			const result = await service.update('non-existent-id', { name: 'New Name' });
			expect(result).toBeNull();
		});

		it('should delete template', async () => {
			const template = await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.GENERAL,
			});

			const deleted = await service.delete(template.id);

			expect(deleted).toBe(true);

			// Verify it's gone
			const found = await service.getById(template.id);
			expect(found).toBeNull();
		});

		it('should return false when deleting non-existent template', async () => {
			const deleted = await service.delete('non-existent-id');
			expect(deleted).toBe(false);
		});

		it('should toggle template active status', async () => {
			const template = await TestDataFactory.createGlobalMessageTemplate({
				isActive: true,
				type: GlobalMessageTemplateType.GENERAL,
			});

			const toggled = await service.toggleActive(template.id);

			expect(toggled).not.toBeNull();
			expect(toggled?.isActive).toBe(false);

			// Toggle back
			const toggledAgain = await service.toggleActive(template.id!);
			expect(toggledAgain?.isActive).toBe(true);
		});

		it('should return null when toggling non-existent template', async () => {
			const result = await service.toggleActive('non-existent-id');
			expect(result).toBeNull();
		});
	});

	describe('Template Processing', () => {
		it('should replace {user.displayName} variable', async () => {
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				message: '<h1>Reset</h1><p>Hello {user.displayName}, reset your password.</p>',
			});

			const result = await service.processTemplate(GlobalMessageTemplateType.SYS_PASSWORD_RESET, {
				user: { displayName: 'John Doe', email: 'john@example.com' },
			});

			expect(result.html).toContain('Hello John Doe');
			expect(result.html).not.toContain('{user.displayName}');
		});

		it('should replace {user.email} variable', async () => {
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				message: '<p>Email: {user.email}</p>',
			});

			const result = await service.processTemplate(GlobalMessageTemplateType.SYS_PASSWORD_RESET, {
				user: { displayName: 'John', email: 'test@example.com' },
			});

			expect(result.html).toContain('test@example.com');
			expect(result.html).not.toContain('{user.email}');
		});

		it('should replace custom variables', async () => {
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SYS_EMAIL_VERIFICATION,
				message: '<p>Reset URL: {resetUrl}</p><p>Token: {token}</p>',
			});

			const result = await service.processTemplate(
				GlobalMessageTemplateType.SYS_EMAIL_VERIFICATION,
				{
					resetUrl: 'https://example.com/reset',
					token: 'abc123',
				},
			);

			expect(result.html).toContain('https://example.com/reset');
			expect(result.html).toContain('abc123');
		});

		it('should extract subject from <h1> tag', async () => {
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				name: 'Password Reset',
				message: '<h1>Reset Your Password</h1><p>Click the link below.</p>',
			});

			const result = await service.processTemplate(
				GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				{},
			);

			expect(result.subject).toBe('Reset Your Password');
		});

		it('should extract subject from <h2> tag', async () => {
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				name: 'Fallback Name',
				message: '<h2>Reset Password</h2><p>Instructions</p>',
			});

			const result = await service.processTemplate(
				GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				{},
			);

			expect(result.subject).toBe('Reset Password');
		});

		it('should use template name if no heading found', async () => {
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				name: 'My Default Subject',
				message: '<p>Just a paragraph, no heading.</p>',
			});

			const result = await service.processTemplate(
				GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				{},
			);

			expect(result.subject).toBe('My Default Subject');
		});

		it('should convert HTML to plain text', async () => {
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				message:
					'<h1>Subject</h1><p>Paragraph 1</p><p>Paragraph 2</p><ul><li>Item 1</li><li>Item 2</li></ul>',
			});

			const result = await service.processTemplate(
				GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				{},
			);

			expect(result.text).toContain('Paragraph 1');
			expect(result.text).toContain('Paragraph 2');
			expect(result.text).toContain('• Item 1');
			expect(result.text).toContain('• Item 2');
		});

		it('should throw error for non-existent template', async () => {
			await expect(
				service.processTemplate(GlobalMessageTemplateType.SYS_PASSWORD_RESET, {}),
			).rejects.toThrow('Template not found');
		});
	});

	describe('Copy to Retreat', () => {
		it('should copy template to retreat', async () => {
			const globalTemplate = await TestDataFactory.createGlobalMessageTemplate({
				name: 'Retreat Template',
				type: GlobalMessageTemplateType.GENERAL,
				message: '<h1>Retreat Welcome</h1><p>Welcome to the retreat!</p>',
			});

			const copied = await service.copyToRetreat(globalTemplate.id, testRetreat.id);

			expect(copied).not.toBeNull();
			expect(copied?.retreatId).toBe(testRetreat.id);
			expect(copied?.name).toBe('Retreat Template');
			expect(copied?.type).toBe(GlobalMessageTemplateType.GENERAL);
		});

		it('should update existing retreat template', async () => {
			const globalTemplate = await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.GENERAL,
				message: '<p>Original message</p>',
			});

			// First copy
			await service.copyToRetreat(globalTemplate.id, testRetreat.id);

			// Update global template
			await service.update(globalTemplate.id, { message: '<p>Updated message</p>' });

			// Copy again - should update existing
			const updated = await service.copyToRetreat(globalTemplate.id, testRetreat.id);

			expect(updated).not.toBeNull();
			expect(updated?.message).toContain('Updated message');
		});

		it('should not copy system templates (SYS_ prefix)', async () => {
			const sysTemplate = await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SYS_PASSWORD_RESET,
				message: '<p>System template</p>',
			});

			const copied = await service.copyToRetreat(sysTemplate.id, testRetreat.id);

			expect(copied).toBeNull();
		});

		it('should return null for non-existent global template', async () => {
			const copied = await service.copyToRetreat('non-existent-id', testRetreat.id);
			expect(copied).toBeNull();
		});

		it('should copy all active templates to retreat', async () => {
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.WALKER_WELCOME,
				isActive: true,
				message: '<p>Active 1</p>',
			});
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SERVER_WELCOME,
				isActive: true,
				message: '<p>Active 2</p>',
			});
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.GENERAL,
				isActive: false,
				message: '<p>Inactive</p>',
			});

			const copied = await service.copyAllActiveTemplatesToRetreat(testRetreat);

			// Should only copy active templates (excluding SYS_ prefixed)
			expect(copied.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe('htmlToText helper', () => {
		it('should convert HTML to plain text correctly', async () => {
			await TestDataFactory.createGlobalMessageTemplate({
				type: GlobalMessageTemplateType.SYS_EMAIL_VERIFICATION,
				message: `
					<h1>Main Title</h1>
					<h2>Subtitle</h2>
					<p>First paragraph</p>
					<p>Second paragraph</p>
					<ul>
						<li>Item 1</li>
						<li>Item 2</li>
					</ul>
					<a href="https://example.com">Link text</a>
					<br>
					<p>After break</p>
				`,
			});

			const result = await service.processTemplate(
				GlobalMessageTemplateType.SYS_EMAIL_VERIFICATION,
				{},
			);

			expect(result.text).toContain('Main Title');
			expect(result.text).toContain('Subtitle');
			expect(result.text).toContain('First paragraph');
			expect(result.text).toContain('Second paragraph');
			expect(result.text).toContain('• Item 1');
			expect(result.text).toContain('• Item 2');
			expect(result.text).toContain('Link text');
			expect(result.text).toContain('After break');
		});
	});
});
