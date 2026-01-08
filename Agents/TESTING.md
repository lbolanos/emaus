# Testing Guide

This guide explains how to run tests and how to create new tests in the Retreat Logistics Management System.

## Table of Contents

- [Quick Start](#quick-start)
- [Running Tests](#running-tests)
- [Test Architecture](#test-architecture)
- [Creating Tests](#creating-tests)
  - [Component Tests](#component-tests)
  - [Store Tests](#store-tests)
  - [Service Tests](#service-tests)
- [Testing Patterns](#testing-patterns)
- [Common Pitfalls](#common-pitfalls)
- [Test Status](#test-status)

## Quick Start

```bash
# Run all tests (API + Web)
pnpm test

# Run only web/frontend tests
pnpm test:web

# Run only API tests
pnpm test:api

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

## Running Tests

### From Project Root

```bash
# Run all tests
pnpm test

# Run web tests only (Vitest)
pnpm test:web

# Run API tests only (Jest)
pnpm test:api

# Run specific test file
pnpm vitest run ParticipantList.test.ts

# Run tests in watch mode (re-run on file changes)
pnpm test:watch

# Run tests with coverage report
pnpm test:coverage

# Run tests with UI interface
pnpm vitest --ui
```

### From Web App Directory

```bash
cd apps/web

# Run all web tests
pnpm test

# Run with watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run with UI
pnpm test:ui
```

### From API Directory

```bash
cd apps/api

# Run all API tests
pnpm test

# Run field mapping tests
pnpm test:field-mapping

# Run with coverage
pnpm test:coverage
```

## Test Architecture

### Frontend (Web) - Vitest + Vue Test Utils

```
apps/web/src/
├── components/
│   └── __tests__/
│       ├── Sidebar.test.ts           # Component tests
│       ├── ParticipantList.test.ts   # Component tests
│       └── ImportParticipantsModal.test.ts
├── stores/
│   └── __tests__/
│       ├── authStore.test.ts         # Store tests
│       ├── retreatStore.test.ts      # Store tests
│       └── participantStore.test.ts  # Store tests
└── test/
    ├── setup.ts                      # Global test setup
    └── utils.ts                      # Test utilities
```

### Backend (API) - Jest

```
apps/api/src/
└── tests/
    ├── services/
    │   └── fieldMapping.simple.test.ts  # Service tests
    └── jest.setup.ts                    # Global test setup
```

## Creating Tests

### Component Tests

Component tests verify the behavior, rendering, and user interactions of Vue components.

#### Basic Structure

```typescript
// apps/web/src/components/__tests__/MyComponent.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import MyComponent from '../MyComponent.vue';
import { createTestWrapper, cleanupMocks } from '../../test/utils';

// Mock axios FIRST (before any imports that use it)
vi.mock('axios', () => {
	const mockAxios = {
		create: vi.fn(() => ({
			get: vi.fn(),
			post: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
			interceptors: {
				request: { use: vi.fn() },
				response: { use: vi.fn() },
			},
		})),
		defaults: {
			baseURL: '',
			withCredentials: false,
		},
	};
	return {
		default: mockAxios,
		...mockAxios,
	};
});

// Mock CSRF utility
vi.mock('@/utils/csrf', () => ({
	setupCsrfInterceptor: vi.fn(),
	getCsrfToken: vi.fn(async () => 'mock-csrf-token'),
}));

// Mock runtime config
vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: vi.fn(() => 'http://localhost:3001/api'),
}));

// Mock telemetry service
vi.mock('@/services/telemetryService', () => ({
	telemetryService: {
		isTelemetryActive: vi.fn(() => false),
		trackApiCallTime: vi.fn(),
		trackError: vi.fn(),
	},
}));

// Mock API service
vi.mock('@/services/api', () => {
	const mockApiGet = vi.fn(() => Promise.resolve({ data: [] }));
	const mockApiPost = vi.fn(() => Promise.resolve({ data: {} }));
	return {
		api: {
			get: mockApiGet,
			post: mockApiPost,
			put: vi.fn(),
			delete: vi.fn(),
		},
	};
});

// Mock @repo/ui components
vi.mock('@repo/ui', () => ({
	Button: { template: '<button><slot /></button>' },
	useToast: () => ({ toast: vi.fn() }),
}));

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
	useI18n: () => ({
		t: (key: string) => key,
	}),
}));

// Mock lucide-vue-next icons
vi.mock('lucide-vue-next', () => ({
	IconName: { template: '<div data-icon="IconName" />' },
}));

describe('MyComponent', () => {
	let wrapper: VueWrapper<any>;
	let pinia: any;

	beforeEach(async () => {
		pinia = createPinia();
		setActivePinia(pinia);

		// Initialize stores if needed
		const { useAuthStore } = await import('@/stores/authStore');
		const authStore = useAuthStore();
		authStore.user = createMockUser();
		authStore.isAuthenticated = true;

		wrapper = createTestWrapper(MyComponent, {
			props: {
				// component props here
			},
			global: {
				mocks: {
					$t: (key: string) => key,
				},
			},
		});

		await nextTick();
	});

	afterEach(() => {
		wrapper?.unmount();
		cleanupMocks();
	});

	describe('Rendering', () => {
		it('should render the component', () => {
			expect(wrapper.exists()).toBe(true);
		});

		it('should display expected content', () => {
			expect(wrapper.text()).toContain('Expected Text');
		});
	});

	describe('User Interactions', () => {
		it('should handle button click', async () => {
			const button = wrapper.find('button');
			await button.trigger('click');
			await nextTick();

			// Assert expected behavior
			expect(wrapper.emitted('click')).toBeTruthy();
		});
	});

	describe('Props', () => {
		it('should accept prop values', async () => {
			await wrapper.setProps({ title: 'Test Title' });
			await nextTick();

			expect(wrapper.props('title')).toBe('Test Title');
		});
	});
});
```

#### Key Patterns

1. **Always mock axios and related modules FIRST** - Before importing anything else
2. **Use dynamic imports** - For stores to avoid hoisting issues
3. **Clean up mocks** - Use `cleanupMocks()` in afterEach
4. **Wait for Vue ticks** - Use `await nextTick()` after state changes

### Store Tests

Store tests verify Pinia store state management, actions, and getters.

#### Basic Structure

```typescript
// apps/web/src/stores/__tests__/myStore.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// Mock axios FIRST
vi.mock('axios', () => {
  const mockAxios = {
    create: vi.fn(() => ({...})),
    defaults: { baseURL: '', withCredentials: false },
  };
  return {
    default: mockAxios,
    ...mockAxios,
  };
});

// Mock API service
const mockApi = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock('@/services/api', () => ({
  api: mockApi,
}));

// Mock @repo/ui toast
vi.mock('@repo/ui', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

describe('MyStore', () => {
  let store: any;
  let useMyStore: any;

  beforeEach(async () => {
    (window.localStorage as any)?._reset?.();
    setActivePinia(createPinia());

    const myStoreModule = await import('../myStore');
    useMyStore = myStoreModule.useMyStore;
    store = useMyStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('State Management', () => {
    it('should initialize with default state', () => {
      expect(store.items).toEqual([]);
      expect(store.loading).toBe(false);
      expect(store.error).toBe(null);
    });
  });

  describe('Actions', () => {
    it('should fetch items successfully', async () => {
      const mockData = [{ id: 1, name: 'Item 1' }];
      mockApi.get.mockResolvedValue({ data: mockData });

      await store.fetchItems();

      expect(mockApi.get).toHaveBeenCalledWith('/items');
      expect(store.items).toEqual(mockData);
      expect(store.loading).toBe(false);
    });

    it('should handle fetch errors', async () => {
      const errorMessage = 'Failed to fetch';
      mockApi.get.mockRejectedValue({
        response: { data: { message: errorMessage } },
      });

      await expect(store.fetchItems()).rejects.toThrow();
      expect(store.error).toBeTruthy();
    });
  });
});
```

#### Key Patterns

1. **Export mock API** - Export from mock factory for use in tests
2. **Reset localStorage** - Call `_reset()` in beforeEach
3. **Test async actions** - Use async/await with expect().rejects.toThrow()

### Service Tests (Backend)

Service tests verify business logic and API interactions.

#### Basic Structure

```typescript
// apps/api/src/tests/services/myService.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FieldMappingService } from '../services/fieldMappingService';

describe('FieldMappingService', () => {
	let service: FieldMappingService;

	beforeEach(() => {
		service = new FieldMappingService();
	});

	afterEach(() => {
		jest.clearAllMocks();
	});

	describe('mapSpanishToEnglish', () => {
		it('should map Spanish field names to English', () => {
			const result = service.mapSpanishToEnglish({
				Nombre: 'John',
				Apellidos: 'Doe',
				Correo: 'john@example.com',
			});

			expect(result).toEqual({
				firstName: 'John',
				lastName: 'Doe',
				email: 'john@example.com',
			});
		});

		it('should handle unmapped fields', () => {
			const result = service.mapSpanishToEnglish({
				UnknownField: 'value',
			});

			expect(result).toEqual({
				unknownField: 'value',
			});
		});
	});
});
```

## Testing Patterns

### Mock Factory Pattern

Always define mocks inside `vi.mock()` factory functions:

```typescript
// ✅ CORRECT
vi.mock('@/services/api', () => {
  const mockApiGet = vi.fn(() => Promise.resolve({ data: [] }));
  return {
    api: { get: mockApiGet, ... },
    mockApiGet,
  };
});

// ❌ INCORRECT - causes hoisting errors
const mockApiGet = vi.fn();
vi.mock('@/services/api', () => ({
  api: { get: mockApiGet },
}));
```

### Dynamic Import Pattern

Use dynamic imports to avoid mock hoisting issues:

```typescript
// ✅ CORRECT
beforeEach(async () => {
	const { useAuthStore } = await import('@/stores/authStore');
	const authStore = useAuthStore();
	// configure store...
});

// ❌ INCORRECT - can cause initialization errors
import { useAuthStore } from '@/stores/authStore';
beforeEach(() => {
	const authStore = useAuthStore();
	// configure store...
});
```

### Error Handling Pattern

Use try/catch for error state verification:

```typescript
// ✅ CORRECT
it('should handle errors', async () => {
	mockApi.get.mockRejectedValue(new Error('Failed'));

	try {
		await store.fetchData();
	} catch (e) {
		// Expected error
	}

	expect(store.error).toBe('Failed');
});

// ❌ INCORRECT - error state may not persist
it('should handle errors', async () => {
	mockApi.get.mockRejectedValue(new Error('Failed'));

	await expect(store.fetchData()).rejects.toThrow();
	expect(store.error).toBe('Failed'); // May fail
});
```

## Common Pitfalls

### 1. Mock Hoisting Errors

**Problem**: `Cannot access 'X' before initialization`

**Solution**: Define all variables inside the `vi.mock()` factory function

### 2. Store Initialization Issues

**Problem**: Store is undefined or not properly initialized

**Solution**: Use dynamic imports and `setActivePinia(createPinia())`

### 3. Teleport Components Not Rendering

**Problem**: Components using `Teleport` don't render in tests

**Solution**: Tests should check if elements exist before asserting, or simplify to check component existence

### 4. Async State Changes

**Problem**: Test fails because state hasn't updated yet

**Solution**: Always use `await nextTick()` after state changes

### 5. localStorage/sessionStorage Pollution

**Problem**: Tests affect each other through localStorage

**Solution**: Use `localStorage._reset()` in beforeEach (from vitest setup)

## Test Status

### ✅ Passing Tests (193 total)

| Category                              | File                                                                | Tests | Status  |
| ------------------------------------- | ------------------------------------------------------------------- | ----- | ------- |
| **Field Mapping**                     | `apps/api/src/tests/services/fieldMapping.simple.test.ts`           | 15    | ✅ Pass |
| **Auth Store**                        | `apps/web/src/stores/__tests__/authStore.test.ts`                   | 22    | ✅ Pass |
| **Retreat Store**                     | `apps/web/src/stores/__tests__/retreatStore.test.ts`                | 39    | ✅ Pass |
| **Participant Store**                 | `apps/web/src/stores/__tests__/participantStore.test.ts`            | 32    | ✅ Pass |
| **Sidebar Component**                 | `apps/web/src/components/__tests__/Sidebar.test.ts`                 | 16    | ✅ Pass |
| **ParticipantList Component**         | `apps/web/src/components/__tests__/ParticipantList.test.ts`         | 40    | ✅ Pass |
| **ImportParticipantsModal Component** | `apps/web/src/components/__tests__/ImportParticipantsModal.test.ts` | 44    | ✅ Pass |

### Test Utilities

Located in `apps/web/src/test/utils.ts`:

```typescript
// Create a test wrapper with common configurations
createTestWrapper(component, options);

// Create mock data
createMockUser(overrides);
createMockRetreat(overrides);
createMockParticipant(overrides);

// Clean up after tests
cleanupMocks();

// Accessibility helpers
a11y.hasAriaAttributes(element, attributes);
a11y.isKeyboardAccessible(element);
```

### Global Setup

Located in `apps/web/src/test/setup.ts`:

- Configures localStorage/sessionStorage mocks
- Sets up test environment
- Provides global test utilities

## Best Practices

1. **Test Behavior, Not Implementation**
   - Test what the component does, not how it does it
   - Focus on user-facing behavior

2. **Keep Tests Isolated**
   - Each test should be independent
   - Clean up state in afterEach
   - Don't rely on test execution order

3. **Use Descriptive Names**
   - Test names should describe the scenario
   - Use `describe` blocks to group related tests
   - Follow the pattern: "should [expected behavior] when [condition]"

4. **Mock External Dependencies**
   - Always mock API calls
   - Mock third-party libraries
   - Use consistent mock data

5. **Test Edge Cases**
   - Empty states
   - Error conditions
   - Boundary values
   - Invalid inputs

## CI/CD Integration

Tests run automatically on:

- Push to `master`, `main`, or `develop` branches
- Pull requests to these branches

See `.github/workflows/ci.yml` for CI configuration.

## Additional Resources

- [Vitest Documentation](https://vitest.dev/)
- [Vue Test Utils](https://test-utils.vuejs.org/)
- [Jest Documentation](https://jestjs.io/)
- [Pinia Testing Guide](https://pinia.vuejs.org/cookbook/testing.html)
