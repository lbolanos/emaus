/**
 * Router guard for `requiresPermission` routes (today only 'participant:health'
 * on food / medicines-report — the health-record views).
 *
 * setup.ts replaces vue-router globally (createRouter / createWebHistory are
 * vi.fn() returning undefined), so importing the real router requires a
 * file-level re-mock that spreads the original module back in.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import router from '../index';

vi.mock('vue-router', async (importOriginal) => ({
	...(await importOriginal<typeof import('vue-router')>()),
}));

// Lazy views only load once a navigation CONFIRMS, but confirming imports
// every matched component (AppLayout included). Mock the ones these
// navigations touch so the real views' dependency trees never load.
vi.mock('@/layouts/AppLayout.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/views/WalkersView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/views/LoginView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/views/FoodView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/views/MedicinesReportView.vue', () => ({ default: { template: '<div />' } }));
vi.mock('@/views/RetreatDashboardView.vue', () => ({ default: { template: '<div />' } }));

const hasPermissionMock = vi.hoisted(() => vi.fn(() => false));
// The guard reads `isSuperadmin.value`, so a plain mutable object stands in
// for the ref the real composable returns (a function here would leave
// `.value` undefined and silently disable the superadmin bypass).
const isSuperadminState = vi.hoisted(() => ({ value: false }));

vi.mock('@/composables/useAuthPermissions', () => ({
	useAuthPermissions: vi.fn(() => ({
		hasPermission: hasPermissionMock,
		isSuperadmin: isSuperadminState,
	})),
}));

vi.mock('@/services/telemetryService', () => ({
	trackPageView: vi.fn(),
}));

// Stores import the api client at module level (retreatStore pulls { api });
// give them an inert mock so no real axios call can escape the test.
vi.mock('@/services/api', () => ({
	api: {
		get: vi.fn(() => Promise.resolve({ data: [] })),
		post: vi.fn(() => Promise.resolve({ data: {} })),
		put: vi.fn(() => Promise.resolve({ data: {} })),
		delete: vi.fn(() => Promise.resolve({ data: {} })),
	},
}));

const RETREAT = {
	id: 'retreat-1',
	parish: 'Parroquia Test',
	startDate: '2026-10-01T00:00:00.000Z',
};

describe('router guard — requiresPermission (participant:health)', () => {
	beforeEach(async () => {
		// mockReturnValue alone keeps the previous tests' call history, which
		// would leak into the not.toHaveBeenCalled() assertions.
		hasPermissionMock.mockClear();
		hasPermissionMock.mockReturnValue(false);
		isSuperadminState.value = false;

		const pinia = createPinia();
		setActivePinia(pinia);

		const { useAuthStore } = await import('@/stores/authStore');
		const authStore = useAuthStore();
		authStore.isAuthenticated = true;
		authStore.userProfile = { roles: [{ role: { name: 'admin' } }] } as any;
		// The first navigation always re-checks auth (5 min debounce on a
		// module-level timestamp); keep that call inert.
		authStore.checkAuthStatus = vi.fn().mockResolvedValue(undefined) as any;

		const { useRetreatStore } = await import('@/stores/retreatStore');
		const retreatStore = useRetreatStore();
		retreatStore.fetchRetreats = vi.fn().mockResolvedValue(undefined) as any;
		retreatStore.selectRetreat = vi.fn() as any;
		retreatStore.retreats = [];
	});

	it('redirects unauthenticated users to login', async () => {
		const { useAuthStore } = await import('@/stores/authStore');
		useAuthStore().isAuthenticated = false;

		await router.push('/app/food');

		expect(router.currentRoute.value.name).toBe('login');
	});

	it('walkers does not consult participant:health', async () => {
		await router.push('/app/walkers');

		expect(router.currentRoute.value.name).toBe('walkers');
		expect(hasPermissionMock).not.toHaveBeenCalled();
	});

	it.each(['food', 'medicines-report'])(
		'denies %s without participant:health and falls back to walkers (no retreats)',
		async (routeName) => {
			await router.push(`/app/${routeName}`);

			// Deny → home → fetchRetreats finds nothing → walkers fallback.
			expect(router.currentRoute.value.name).toBe('walkers');
			expect(hasPermissionMock).toHaveBeenCalledWith('participant:health');
		},
	);

	it('deny lands on the most recent retreat dashboard when retreats exist', async () => {
		const { useRetreatStore } = await import('@/stores/retreatStore');
		const retreatStore = useRetreatStore();
		retreatStore.retreats = [RETREAT] as any;

		await router.push('/app/medicines-report');

		expect(router.currentRoute.value.name).toBe('retreat-dashboard');
		expect(router.currentRoute.value.params.id).toBe('retreat-1');
	});

	it.each(['food', 'medicines-report'])(
		'allows %s when hasPermission(participant:health) is true',
		async (routeName) => {
			hasPermissionMock.mockReturnValue(true);

			await router.push(`/app/${routeName}`);

			expect(router.currentRoute.value.name).toBe(routeName);
		},
	);

	it('superadmin bypasses the permission check entirely', async () => {
		isSuperadminState.value = true;

		await router.push('/app/food');

		expect(router.currentRoute.value.name).toBe('food');
		expect(hasPermissionMock).not.toHaveBeenCalled();
	});
});
