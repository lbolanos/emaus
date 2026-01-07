import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock marked FIRST before any imports that use it
vi.mock('marked', () => ({
	marked: {
		parse: vi.fn((markdown: string) => {
			return `<p>Parsed: ${markdown}</p>`;
		}),
	},
}));

// Mock dynamic imports for markdown files
vi.mock('@/docs/en/walkers.md?raw', () => ({
	default: '# Walkers\n\nContent for walkers',
}));
vi.mock('@/docs/es/walkers.md?raw', () => ({
	default: '# Caminantes\n\nContenido para caminantes',
}));

describe('helpStore', () => {
	let helpStore: any;
	let useHelpStore: any;

	beforeEach(async () => {
		setActivePinia(createPinia());

		const helpStoreModule = await import('../helpStore');
		useHelpStore = helpStoreModule.useHelpStore;
		helpStore = useHelpStore();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Initial State', () => {
		it('should initialize with default state', () => {
			expect(helpStore.isPanelOpen).toBe(false);
			expect(helpStore.currentTopic).toBe(null);
			expect(helpStore.searchQuery).toBe('');
			expect(helpStore.locale).toBe('es');
		});

		it('should have content cache as Map', () => {
			// The cache is internal, but we can verify through behavior
			expect(helpStore.currentTopicContent).toBe(null);
		});
	});

	describe('Panel State Management', () => {
		it('should open panel without topic', () => {
			helpStore.openPanel();
			expect(helpStore.isPanelOpen).toBe(true);
			expect(helpStore.currentTopic).toBe(null);
		});

		it('should open panel with topic', () => {
			helpStore.openPanel('walkers');
			expect(helpStore.isPanelOpen).toBe(true);
			expect(helpStore.currentTopic).toBe('walkers');
		});

		it('should close panel', () => {
			helpStore.openPanel('walkers');
			helpStore.closePanel();
			expect(helpStore.isPanelOpen).toBe(false);
		});

		it('should toggle panel from closed to open', () => {
			expect(helpStore.isPanelOpen).toBe(false);
			helpStore.togglePanel();
			expect(helpStore.isPanelOpen).toBe(true);
		});

		it('should toggle panel from open to closed', () => {
			helpStore.openPanel();
			expect(helpStore.isPanelOpen).toBe(true);
			helpStore.togglePanel();
			expect(helpStore.isPanelOpen).toBe(false);
		});
	});

	describe('Topic Management', () => {
		it('should set current topic', () => {
			helpStore.setTopic('servers');
			expect(helpStore.currentTopic).toBe('servers');
		});

		it('should update topic when opening panel with topic', () => {
			helpStore.openPanel('bed-assignments');
			expect(helpStore.currentTopic).toBe('bed-assignments');
		});
	});

	describe('Content Loading', () => {
		it('should load markdown content for English locale', async () => {
			helpStore.locale = 'en';
			const content = await helpStore.loadTopicContent('walkers');

			expect(content).toBeTruthy();
			expect(typeof content).toBe('string');
			expect(content).toContain('<p>Parsed:');
		});

		it('should load markdown content for Spanish locale', async () => {
			helpStore.locale = 'es';
			const content = await helpStore.loadTopicContent('walkers');

			expect(content).toBeTruthy();
			expect(typeof content).toBe('string');
		});

		it('should cache loaded content', async () => {
			helpStore.locale = 'en';
			await helpStore.loadTopicContent('walkers');

			// Load again - should use cache
			const content2 = await helpStore.loadTopicContent('walkers');

			// Verify marked.parse was called only once (due to cache)
			const marked = await import('marked');
			expect(marked.marked.parse).toHaveBeenCalledTimes(1);
		});

		it('should handle missing content gracefully', async () => {
			const content = await helpStore.loadTopicContent('non-existent-topic');
			expect(content).toBe(null);
		});

		it('should handle import errors gracefully', async () => {
			// Force an import error by mocking a failing import
			vi.doMock('@/docs/en/error-test.md?raw', () => {
				throw new Error('Import failed');
			});

			const content = await helpStore.loadTopicContent('error-test');
			expect(content).toBe(null);
		});
	});

	describe('Computed Properties', () => {
		it('should return null for currentTopicContent when no topic is set', () => {
			expect(helpStore.currentTopicContent).toBe(null);
		});

		it('should return cached content for currentTopicContent', async () => {
			helpStore.locale = 'en';
			helpStore.setTopic('walkers');
			await helpStore.loadTopicContent('walkers');

			const content = helpStore.currentTopicContent;
			expect(content).toBeTruthy();
			expect(typeof content).toBe('string');
		});

		it('should return undefined for uncached topic', () => {
			helpStore.setTopic('not-loaded');
			expect(helpStore.currentTopicContent).toBeUndefined();
		});
	});

	describe('Locale Management', () => {
		it('should have Spanish as default locale', () => {
			expect(helpStore.locale).toBe('es');
		});

		it('should allow locale changes', () => {
			helpStore.locale = 'en';
			expect(helpStore.locale).toBe('en');

			helpStore.locale = 'es';
			expect(helpStore.locale).toBe('es');
		});
	});

	describe('Search Query', () => {
		it('should initialize with empty search query', () => {
			expect(helpStore.searchQuery).toBe('');
		});

		it('should allow search query updates', () => {
			helpStore.searchQuery = 'walkers';
			expect(helpStore.searchQuery).toBe('walkers');
		});
	});

	describe('Initialize Function', () => {
		it('should be a function', () => {
			expect(typeof helpStore.initialize).toBe('function');
		});

		it('should return promise when called', async () => {
			const result = helpStore.initialize();
			expect(result).toBeInstanceOf(Promise);
			await result;
		});
	});
});
