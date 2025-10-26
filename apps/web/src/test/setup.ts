import { vi } from 'vitest';
import { config } from '@vue/test-utils';

// Mock Vue Router
vi.mock('vue-router', () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		go: vi.fn(),
		back: vi.fn(),
		forward: vi.fn(),
		resolve: vi.fn((to: any) => ({ href: `/mocked-route/${to}` })),
		addRoute: vi.fn(),
		hasRoute: vi.fn(),
		getRoutes: vi.fn(() => []),
		onBeforeRouteLeave: vi.fn(),
		onBeforeRouteUpdate: vi.fn(),
	}),
	useRoute: () => ({
		path: '/mocked-path',
		name: 'mocked-route',
		params: {},
		query: {},
		hash: '',
		fullPath: '/mocked-path',
		matched: [],
		meta: {},
		redirectedFrom: undefined,
	}),
	createRouter: vi.fn(),
	createWebHistory: vi.fn(),
	createWebHashHistory: vi.fn(),
}));

// Mock Pinia stores
vi.mock('pinia', () => ({
	createPinia: vi.fn(() => ({
		_s: new Map(),
		state: {},
		_p: [],
		install: vi.fn(),
	})),
	storeToRefs: vi.fn((store) =>
		Object.keys(store).reduce((acc: Record<string, any>, key) => {
			if (typeof store[key] === 'function') return acc;
			acc[key] = { value: store[key] };
			return acc;
		}, {}),
	),
	defineStore: vi.fn((id, options) => {
		const store = {
			id,
			_p: [],
			$state: {},
			$patch: vi.fn(),
			$reset: vi.fn(),
			$subscribe: vi.fn(),
			$onAction: vi.fn(),
			$dispose: vi.fn(),
		};

		if (typeof options === 'function') {
			const result = options(() => store);
			Object.assign(store, result);
		} else if (options && typeof options.state === 'function') {
			Object.assign(store, options.state());
			if (options.getters) {
				Object.assign(store, options.getters);
			}
			if (options.actions) {
				Object.assign(store, options.actions);
			}
		}

		return store;
	}),
}));

// Mock Vue i18n
vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		locale: { value: 'es' },
		availableLocales: ['es', 'en'],
		t: vi.fn((key: string) => key),
		te: vi.fn(() => true),
		tm: vi.fn(() => ({})),
		rt: vi.fn((key: string) => key),
		d: vi.fn((value: any) => value),
		n: vi.fn((value: number) => value.toString()),
		setLocale: vi.fn(),
		mergeLocaleMessage: vi.fn(),
	}),
}));

// Mock localStorage
const localStorageMock = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
	length: 0,
	key: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
	value: localStorageMock,
});

// Mock sessionStorage
const sessionStorageMock = {
	getItem: vi.fn(),
	setItem: vi.fn(),
	removeItem: vi.fn(),
	clear: vi.fn(),
	length: 0,
	key: vi.fn(),
};
Object.defineProperty(window, 'sessionStorage', {
	value: sessionStorageMock,
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: vi.fn().mockImplementation((query) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: vi.fn(), // deprecated
		removeListener: vi.fn(), // deprecated
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
	observe: vi.fn(),
	unobserve: vi.fn(),
	disconnect: vi.fn(),
}));

// Mock window.getComputedStyle
Object.defineProperty(window, 'getComputedStyle', {
	value: vi.fn(() => ({
		getPropertyValue: vi.fn(() => ''),
	})),
});

// Mock HTMLElement.prototype.scrollIntoView
HTMLElement.prototype.scrollIntoView = vi.fn();

// Mock console methods to reduce noise in tests
global.console = {
	...console,
	warn: vi.fn(),
	error: vi.fn(),
};

// Configure Vue Test Utils
config.global.stubs = {
	'router-link': {
		template: '<a><slot /></a>',
		props: ['to', 'custom'],
	},
	'router-view': {
		template: '<div><slot /></div>',
	},
	transition: {
		template: '<div><slot /></div>',
	},
	'transition-group': {
		template: '<div><slot /></div>',
	},
	teleport: {
		template: '<div><slot /></div>',
	},
	Suspense: {
		template: '<div><slot /></div>',
	},
	ClientOnly: {
		template: '<div><slot /></div>',
	},
};

// Mock @repo/ui components
vi.mock('@repo/ui', () => ({
	Button: {
		name: 'Button',
		template: '<button><slot /></button>',
		props: ['variant', 'size', 'disabled', 'onClick'],
	},
	Input: {
		name: 'Input',
		template: '<input><slot /></input>',
		props: ['modelValue', 'placeholder', 'type', 'disabled'],
	},
	Dialog: {
		name: 'Dialog',
		template: '<div><slot /></div>',
		props: ['open'],
	},
	DialogContent: {
		name: 'DialogContent',
		template: '<div><slot /></div>',
	},
	DialogTitle: {
		name: 'DialogTitle',
		template: '<h2><slot /></h2>',
	},
	DialogDescription: {
		name: 'DialogDescription',
		template: '<p><slot /></p>',
	},
	DialogFooter: {
		name: 'DialogFooter',
		template: '<div><slot /></div>',
	},
	DialogHeader: {
		name: 'DialogHeader',
		template: '<div><slot /></div>',
	},
	Table: {
		name: 'Table',
		template: '<table><slot /></table>',
	},
	TableHeader: {
		name: 'TableHeader',
		template: '<thead><slot /></thead>',
	},
	TableBody: {
		name: 'TableBody',
		template: '<tbody><slot /></tbody>',
	},
	TableRow: {
		name: 'TableRow',
		template: '<tr><slot /></tr>',
	},
	TableHead: {
		name: 'TableHead',
		template: '<th><slot /></th>',
	},
	TableCell: {
		name: 'TableCell',
		template: '<td><slot /></td>',
	},
	Tooltip: {
		name: 'Tooltip',
		template: '<div><slot /></div>',
	},
	TooltipContent: {
		name: 'TooltipContent',
		template: '<div><slot /></div>',
	},
	TooltipProvider: {
		name: 'TooltipProvider',
		template: '<div><slot /></div>',
	},
	TooltipTrigger: {
		name: 'TooltipTrigger',
		template: '<div><slot /></div>',
	},
	Toast: {
		name: 'Toast',
		template: '<div><slot /></div>',
	},
	useToast: () => ({
		toast: vi.fn(),
	}),
}));

// Mock lucide-vue-next icons
vi.mock('lucide-vue-next', () => ({
	ChevronLeft: { name: 'ChevronLeft', template: '<svg></svg>' },
	LogOut: { name: 'LogOut', template: '<svg></svg>' },
	Users: { name: 'Users', template: '<svg></svg>' },
	UtensilsCrossed: { name: 'UtensilsCrossed', template: '<svg></svg>' },
	LayoutDashboard: { name: 'LayoutDashboard', template: '<svg></svg>' },
	Home: { name: 'Home', template: '<svg></svg>' },
	Ban: { name: 'Ban', template: '<svg></svg>' },
	Bed: { name: 'Bed', template: '<svg></svg>' },
	HandHeart: { name: 'HandHeart', template: '<svg></svg>' },
	DollarSign: { name: 'DollarSign', template: '<svg></svg>' },
	NotebookPen: { name: 'NotebookPen', template: '<svg></svg>' },
	Building: { name: 'Building', template: '<svg></svg>' },
	UsersRound: { name: 'UsersRound', template: '<svg></svg>' },
	Salad: { name: 'Salad', template: '<svg></svg>' },
	FileX: { name: 'FileX', template: '<svg></svg>' },
	UserCheck: { name: 'UserCheck', template: '<svg></svg>' },
	ShoppingBag: { name: 'ShoppingBag', template: '<svg></svg>' },
	Pill: { name: 'Pill', template: '<svg></svg>' },
	UserCog: { name: 'UserCog', template: '<svg></svg>' },
	Table: { name: 'Table', template: '<svg></svg>' },
	Settings: { name: 'Settings', template: '<svg></svg>' },
	Package: { name: 'Package', template: '<svg></svg>' },
	Globe: { name: 'Globe', template: '<svg></svg>' },
	Briefcase: { name: 'Briefcase', template: '<svg></svg>' },
	Search: { name: 'Search', template: '<svg></svg>' },
	X: { name: 'X', template: '<svg></svg>' },
	ArrowRight: { name: 'ArrowRight', template: '<svg></svg>' },
	ChevronDown: { name: 'ChevronDown', template: '<svg></svg>' },
	Lock: { name: 'Lock', template: '<svg></svg>' },
	CreditCard: { name: 'CreditCard', template: '<svg></svg>' },
	FileUp: { name: 'FileUp', template: '<svg></svg>' },
	FileCheck: { name: 'FileCheck', template: '<svg></svg>' },
	Loader2: { name: 'Loader2', template: '<svg class="animate-spin"></svg>' },
	Download: { name: 'Download', template: '<svg></svg>' },
	AlertTriangle: { name: 'AlertTriangle', template: '<svg></svg>' },
	CheckCircle: { name: 'CheckCircle', template: '<svg></svg>' },
}));

// Mock axios
vi.mock('axios', () => ({
	default: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn(),
		patch: vi.fn(),
		create: vi.fn(() => ({
			get: vi.fn(),
			post: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
			patch: vi.fn(),
		})),
	},
}));

// Mock ExcelJS
vi.mock('exceljs', () => ({
	Workbook: vi.fn().mockImplementation(() => ({
		addWorksheet: vi.fn().mockReturnValue({
			addRow: vi.fn(),
			getRow: vi.fn().mockReturnValue({
				eachCell: vi.fn(),
			}),
			rowCount: 1,
		}),
		xlsx: {
			load: vi.fn(),
			writeBuffer: vi.fn().mockResolvedValue(Buffer.from('')),
		},
	})),
}));

// Global test utilities
declare global {
	namespace Vi {
		interface JestAssertion<T = any> {
			toBeInTheDocument(): T;
			toHaveClass(className: string): T;
			toBeVisible(): T;
			toHaveTextContent(text: string): T;
			toBeDisabled(): T;
			toBeEnabled(): T;
			toHaveAttribute(attr: string, value?: string): T;
			toHaveStyle(style: Record<string, string>): T;
		}
	}
}

// Custom matchers
expect.extend({
	toBeInTheDocument(received) {
		const pass = received && document.body.contains(received);
		return {
			message: () =>
				pass
					? `expected element not to be in the document`
					: `expected element to be in the document`,
			pass,
		};
	},
	toHaveClass(received, className) {
		const pass = received && received.classList && received.classList.contains(className);
		return {
			message: () =>
				pass
					? `expected element not to have class "${className}"`
					: `expected element to have class "${className}"`,
			pass,
		};
	},
	toBeVisible(received) {
		const pass =
			received &&
			received.style &&
			received.style.display !== 'none' &&
			received.style.visibility !== 'hidden' &&
			received.style.opacity !== '0';
		return {
			message: () =>
				pass ? `expected element not to be visible` : `expected element to be visible`,
			pass,
		};
	},
	toHaveTextContent(received, text) {
		const pass = received && received.textContent && received.textContent.includes(text);
		return {
			message: () =>
				pass
					? `expected element not to have text content "${text}"`
					: `expected element to have text content "${text}"`,
			pass,
		};
	},
	toBeDisabled(received) {
		const pass = received && received.hasAttribute('disabled');
		return {
			message: () =>
				pass ? `expected element not to be disabled` : `expected element to be disabled`,
			pass,
		};
	},
	toBeEnabled(received) {
		const pass = received && !received.hasAttribute('disabled');
		return {
			message: () =>
				pass ? `expected element not to be enabled` : `expected element to be enabled`,
			pass,
		};
	},
	toHaveAttribute(received, name, value) {
		const pass =
			received &&
			received.hasAttribute(name) &&
			(value === undefined || received.getAttribute(name) === value);
		return {
			message: () =>
				pass
					? `expected element not to have attribute "${name}"${value !== undefined ? ` with value "${value}"` : ''}`
					: `expected element to have attribute "${name}"${value !== undefined ? ` with value "${value}"` : ''}`,
			pass,
		};
	},
	toHaveStyle(received, styles) {
		const pass =
			received &&
			Object.entries(styles).every(([prop, val]) => received.style[prop as any] === val);
		return {
			message: () =>
				pass
					? `expected element not to have styles ${JSON.stringify(styles)}`
					: `expected element to have styles ${JSON.stringify(styles)}`,
			pass,
		};
	},
});
