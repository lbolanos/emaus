import { mount, VueWrapper } from '@vue/test-utils';
import { createPinia, Pinia, setActivePinia } from 'pinia';
import { ComponentPublicInstance } from 'vue';

/**
 * Test utilities for Vue components
 */

export interface TestMountOptions {
	pinia?: Pinia;
	props?: Record<string, any>;
	global?: any;
}

/**
 * Create a test wrapper with common configurations
 */
export function createTestWrapper(component: any, options: TestMountOptions = {}) {
	const pinia = options.pinia || createPinia();
	setActivePinia(pinia);

	const defaultOptions = {
		global: {
			plugins: [pinia],
			stubs: {
				'router-link': true,
				'router-view': true,
				transition: true,
				'transition-group': true,
				teleport: true,
				suspense: true,
				ClientOnly: true,
				...options.global?.stubs,
			},
			mocks: {
				$t: (key: string) => key,
				$router: {
					push: jest.fn(),
					replace: jest.fn(),
					go: jest.fn(),
					back: jest.fn(),
					forward: jest.fn(),
					resolve: jest.fn(() => ({ href: '/mocked-route' })),
				},
				$route: {
					path: '/mocked-path',
					name: 'mocked-route',
					params: {},
					query: {},
					hash: '',
					fullPath: '/mocked-path',
					matched: [],
					meta: {},
					redirectedFrom: undefined,
				},
				...options.global?.mocks,
			},
			...options.global,
		},
	};

	return mount(component, defaultOptions);
}

/**
 * Create a mock user for testing
 */
export function createMockUser(overrides: any = {}) {
	return {
		id: 'test-user-id',
		email: 'test@example.com',
		firstName: 'Test',
		lastName: 'User',
		displayName: 'Test User',
		roles: [
			{
				id: 'role-1',
				name: 'admin',
				permissions: ['read:all', 'write:all', 'delete:all'],
			},
		],
		isActive: true,
		emailVerified: true,
		...overrides,
	};
}

/**
 * Create a mock retreat for testing
 */
export function createMockRetreat(overrides: any = {}) {
	return {
		id: 'test-retreat-id',
		name: 'Test Retreat 2024',
		startDate: new Date('2024-06-01'),
		endDate: new Date('2024-06-03'),
		isPublic: true,
		max_walkers: 50,
		max_servers: 20,
		houseId: 'test-house-id',
		notes: 'Test retreat for unit testing',
		...overrides,
	};
}

/**
 * Create mock participants for testing
 */
export function createMockParticipant(overrides: any = {}) {
	return {
		id: 'test-participant-id',
		firstName: 'Test',
		lastName: 'Participant',
		email: 'participant@test.com',
		type: 'walker',
		cellPhone: '5551234567',
		parish: 'Test Parish',
		totalPaid: 100,
		isCancelled: false,
		retreatId: 'test-retreat-id',
		family_friend_color: '#FF5733',
		tableId: 'test-table-id',
		retreatBedId: 'test-bed-id',
		...overrides,
	};
}

/**
 * Create mock table for testing
 */
export function createMockTable(overrides: any = {}) {
	return {
		id: 'test-table-id',
		name: 'Table 1',
		retreatId: 'test-retreat-id',
		maxWalkers: 8,
		liderId: 'test-leader-id',
		colider1Id: 'test-colider1-id',
		colider2Id: 'test-colider2-id',
		walkers: [],
		...overrides,
	};
}

/**
 * Create mock store state for testing
 */
export function createMockStoreState() {
	return {
		auth: {
			isAuthenticated: true,
			user: createMockUser(),
			userProfile: createMockUser(),
		},
		retreat: {
			selectedRetreatId: 'test-retreat-id',
			selectedRetreat: createMockRetreat(),
			retreats: [createMockRetreat()],
		},
		ui: {
			isSidebarCollapsed: false,
			theme: 'light',
			loading: false,
		},
		participant: {
			walkers: [createMockParticipant({ type: 'walker' })],
			servers: [createMockParticipant({ type: 'server' })],
			partialServers: [createMockParticipant({ type: 'partial_server' })],
			waitingList: [createMockParticipant({ type: 'waiting' })],
			canceled: [createMockParticipant({ isCancelled: true })],
		},
		tableMesa: {
			tables: [createMockTable()],
		},
	};
}

/**
 * Wait for the next Vue tick
 */
export async function nextTick() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Wait for a specific amount of time
 */
export function waitFor(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Flush all pending promises
 */
export async function flushPromises() {
	await nextTick();
	await new Promise((resolve) => setImmediate(resolve));
}

/**
 * Mock a store with initial state
 */
export function mockStore(storeName: string, initialState: any = {}) {
	const store = {
		$id: storeName,
		$state: { ...initialState },
		$patch: jest.fn(),
		$reset: jest.fn(),
		$subscribe: jest.fn(),
		$onAction: jest.fn(),
		$dispose: jest.fn(),
		...initialState,
	};

	return store;
}

/**
 * Create a file mock for testing file uploads
 */
export function createMockFile(overrides: Partial<File> = {}): File {
	const defaultContent = 'test file content';
	const blob = new Blob([defaultContent], { type: 'text/plain' });

	const file = new File([blob], 'test.txt', {
		type: 'text/plain',
		lastModified: Date.now(),
		...overrides,
	});

	return file;
}

/**
 * Create an Excel file mock for testing Excel imports
 */
export function createMockExcelFile(overrides: Partial<File> = {}): File {
	const defaultContent = new ArrayBuffer(8);
	const blob = new Blob([defaultContent], {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	});

	const file = new File([blob], 'test.xlsx', {
		type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		lastModified: Date.now(),
		...overrides,
	});

	return file;
}

/**
 * Mock a component method
 */
export function mockComponentMethod(
	wrapper: VueWrapper,
	methodName: string,
	implementation: (...args: any[]) => any = jest.fn(),
) {
	const component = wrapper.vm as ComponentPublicInstance;
	const originalMethod = (component as any)[methodName];
	(component as any)[methodName] = jest.fn(implementation || originalMethod);

	return {
		restore: () => {
			(component as any)[methodName] = originalMethod;
		},
	};
}

/**
 * Trigger an event on a component element
 */
export function triggerEvent(wrapper: VueWrapper, eventName: string, options: any = {}) {
	const element = wrapper.element as HTMLElement;
	element.dispatchEvent(new Event(eventName, options));
}

/**
 * Set up a mock for window.location
 */
export function mockWindowLocation(href: string = 'http://localhost:3000') {
	Object.defineProperty(window, 'location', {
		value: {
			href,
			origin: 'http://localhost:3000',
			protocol: 'http:',
			host: 'localhost:3000',
			hostname: 'localhost',
			port: '3000',
			pathname: '/',
			search: '',
			hash: '',
			assign: jest.fn(),
			replace: jest.fn(),
			reload: jest.fn(),
		},
		writable: true,
	});
}

/**
 * Clean up mocks after tests
 */
export function cleanupMocks() {
	jest.clearAllMocks();
	localStorageMock.clear();
	sessionStorageMock.clear();
}

/**
 * Test helper for accessibility
 */
export const a11y = {
	/**
	 * Check if an element has proper ARIA attributes
	 */
	hasAriaAttributes: (element: HTMLElement, attributes: string[]) => {
		return attributes.every((attr) => element.hasAttribute(attr));
	},

	/**
	 * Check if an element has proper role
	 */
	hasRole: (element: HTMLElement, role: string) => {
		return element.getAttribute('role') === role;
	},

	/**
	 * Check if an element is keyboard accessible
	 */
	isKeyboardAccessible: (element: HTMLElement) => {
		return (
			element.tabIndex >= 0 ||
			['button', 'input', 'select', 'textarea', 'a'].includes(element.tagName.toLowerCase())
		);
	},
};

/**
 * Wait for next Vue tick
 */
export function waitForTick(): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, 0);
	});
}

/**
 * Performance testing utilities
 */
export const performanceUtils = {
	/**
	 * Measure execution time of a function
	 */
	measure: async <T>(fn: () => T | Promise<T>): Promise<{ result: T; duration: number }> => {
		const start = Date.now();
		const result = await fn();
		const end = Date.now();
		return {
			result,
			duration: end - start,
		};
	},

	/**
	 * Assert that a function executes within a time limit
	 */
	expectToCompleteWithin: async <T>(fn: () => T | Promise<T>, maxMs: number) => {
		const { duration } = await performanceUtils.measure(fn);
		expect(duration).toBeLessThan(maxMs);
	},
};

// Create storage mocks
const localStorageMock = {
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
	clear: jest.fn(),
	length: 0,
	key: jest.fn(),
};

const sessionStorageMock = {
	getItem: jest.fn(),
	setItem: jest.fn(),
	removeItem: jest.fn(),
	clear: jest.fn(),
	length: 0,
	key: jest.fn(),
};

// Set up global mocks
Object.defineProperty(window, 'localStorage', {
	value: localStorageMock,
});

Object.defineProperty(window, 'sessionStorage', {
	value: sessionStorageMock,
});
