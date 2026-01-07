import { describe, it, expect } from 'vitest';
import { helpIndex, getHelpSectionByKey, getHelpTopicByKey, getHelpByRoute } from '../helpIndex';

describe('helpIndex', () => {
	describe('Structure', () => {
		it('should have all required sections', () => {
			const sectionKeys = helpIndex.map((s) => s.key);

			expect(sectionKeys).toContain('getting-started');
			expect(sectionKeys).toContain('walkers');
			expect(sectionKeys).toContain('servers');
			expect(sectionKeys).toContain('tables');
			expect(sectionKeys).toContain('bed-assignments');
			expect(sectionKeys).toContain('payments');
			expect(sectionKeys).toContain('reports');
			expect(sectionKeys).toContain('settings');
		});

		it('should have at least 8 sections', () => {
			expect(helpIndex.length).toBeGreaterThanOrEqual(8);
		});
	});

	describe('Section Validation', () => {
		it('should have valid section objects with all required fields', () => {
			helpIndex.forEach((section) => {
				expect(section.key).toBeTruthy();
				expect(section.title).toBeTruthy();
				expect(section.titleEs).toBeTruthy();
				expect(section.icon).toBeTruthy();
				expect(Array.isArray(section.topics)).toBe(true);
			});
		});

		it('should have unique keys for all sections', () => {
			const keys = helpIndex.map((s) => s.key);
			const uniqueKeys = new Set(keys);
			expect(uniqueKeys.size).toBe(keys.length);
		});

		it('should have routeContext as optional array', () => {
			helpIndex.forEach((section) => {
				if (section.routeContext) {
					expect(Array.isArray(section.routeContext)).toBe(true);
				}
			});
		});
	});

	describe('getHelpSectionByKey', () => {
		it('should return section by exact key match', () => {
			const section = getHelpSectionByKey('walkers');

			expect(section).toBeTruthy();
			expect(section?.key).toBe('walkers');
			expect(section?.title).toBe('Walkers');
			expect(section?.titleEs).toBe('Caminantes');
		});

		it('should return section for bed-assignments', () => {
			const section = getHelpSectionByKey('bed-assignments');

			expect(section).toBeTruthy();
			expect(section?.key).toBe('bed-assignments');
			expect(section?.title).toBe('Bed Assignments');
			expect(section?.titleEs).toBe('Asignaciones de Camas');
		});

		it('should return undefined for non-existent key', () => {
			const section = getHelpSectionByKey('non-existent-section');
			expect(section).toBeUndefined();
		});

		it('should return section for settings', () => {
			const section = getHelpSectionByKey('settings');

			expect(section).toBeTruthy();
			expect(section?.key).toBe('settings');
			expect(section?.title).toBe('Settings');
			expect(section?.titleEs).toBe('Configuración');
		});
	});

	describe('getHelpTopicByKey', () => {
		it('should return topic by section and topic key', () => {
			const topic = getHelpTopicByKey('getting-started', 'overview');

			expect(topic).toBeTruthy();
			expect(topic?.key).toBe('overview');
		});

		it('should return undefined for non-existent section', () => {
			const topic = getHelpTopicByKey('non-existent', 'overview');
			expect(topic).toBeUndefined();
		});

		it('should return undefined for non-existent topic', () => {
			const topic = getHelpTopicByKey('getting-started', 'non-existent');
			expect(topic).toBeUndefined();
		});
	});

	describe('getHelpByRoute', () => {
		it('should match walkers route to walkers section', () => {
			const section = getHelpByRoute('walkers');
			expect(section?.key).toBe('walkers');
		});

		it('should match walkers-view route to walkers section', () => {
			const section = getHelpByRoute('walkers-view');
			expect(section?.key).toBe('walkers');
		});

		it('should match servers route to servers section', () => {
			const section = getHelpByRoute('servers');
			expect(section?.key).toBe('servers');
		});

		it('should match tables route to tables section', () => {
			const section = getHelpByRoute('tables');
			expect(section?.key).toBe('tables');
		});

		it('should match bed-assignments route to bed-assignments section', () => {
			const section = getHelpByRoute('bed-assignments');
			expect(section?.key).toBe('bed-assignments');
		});

		it('should match rooms route to bed-assignments section', () => {
			const section = getHelpByRoute('rooms');
			expect(section?.key).toBe('bed-assignments');
		});

		it('should match payments route to payments section', () => {
			const section = getHelpByRoute('payments');
			expect(section?.key).toBe('payments');
		});

		it('should return undefined for unmatched routes', () => {
			const section = getHelpByRoute('non-existent-route');
			expect(section).toBeUndefined();
		});

		it('should return undefined for empty route name', () => {
			const section = getHelpByRoute('');
			expect(section).toBeUndefined();
		});
	});

	describe('Bilingual Support', () => {
		it('should have both English and Spanish titles for all sections', () => {
			helpIndex.forEach((section) => {
				expect(section.title).not.toBe('');
				expect(section.titleEs).not.toBe('');
				expect(section.title).not.toBe(section.titleEs);
			});
		});

		it('should have different English and Spanish titles', () => {
			helpIndex.forEach((section) => {
				expect(section.title).not.toEqual(section.titleEs);
			});
		});
	});

	describe('Icons', () => {
		it('should have valid icon names for all sections', () => {
			helpIndex.forEach((section) => {
				expect(section.icon).toMatch(/^mdi-/);
			});
		});
	});

	describe('Topics', () => {
		it('should have at least one topic per section', () => {
			helpIndex.forEach((section) => {
				expect(section.topics.length).toBeGreaterThan(0);
			});
		});

		it('should have valid topic objects', () => {
			helpIndex.forEach((section) => {
				section.topics.forEach((topic) => {
					expect(topic.key).toBeTruthy();
					expect(topic.title).toBeTruthy();
					expect(topic.titleEs).toBeTruthy();
					expect(topic.content).toBeTruthy();
				});
			});
		});
	});
});
