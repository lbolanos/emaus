import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

// authStore arrastra @/services/api → @/utils/csrf (toca axios.defaults).
// Mockeamos esa cadena para poder importar el store en aislamiento.
vi.mock('axios', () => {
	const mockAxios = {
		create: vi.fn(() => ({
			get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn(),
			interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
		})),
		defaults: { baseURL: '', withCredentials: false },
	};
	return { default: mockAxios, ...mockAxios };
});
vi.mock('@/utils/csrf', () => ({
	setupCsrfInterceptor: vi.fn(),
	getCsrfToken: vi.fn(async () => 'mock-csrf-token'),
}));
vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: vi.fn(() => 'http://localhost:3001/api'),
}));

import { useMyParticipantId } from '@/composables/useMyParticipantId';
import { useAuthStore } from '@/stores/authStore';

describe('useMyParticipantId', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	it('lo lee del nivel superior del user (ruta de producción)', () => {
		const auth = useAuthStore();
		// getUserProfile solo trae roles+permissions; participantId vive en user.
		auth.user = { id: 'u1', participantId: 'pid-1' } as any;
		auth.userProfile = { roles: [], permissions: [] } as any;
		expect(useMyParticipantId().value).toBe('pid-1');
	});

	it('lo lee de user.participant.id (forma anidada en user)', () => {
		const auth = useAuthStore();
		auth.user = { id: 'u1', participant: { id: 'pid-2' } } as any;
		auth.userProfile = { roles: [], permissions: [] } as any;
		expect(useMyParticipantId().value).toBe('pid-2');
	});

	it('NO lee de userProfile — solo es fuente el objeto user', () => {
		const auth = useAuthStore();
		// userProfile trae participantId pero user no → debe resolver null.
		auth.user = { id: 'u1' } as any;
		auth.userProfile = { participantId: 'pid-X', participant: { id: 'pid-Y' } } as any;
		expect(useMyParticipantId().value).toBeNull();
	});

	it('devuelve null cuando no hay participant vinculado', () => {
		const auth = useAuthStore();
		auth.user = { id: 'u1' } as any;
		auth.userProfile = { roles: [], permissions: [] } as any;
		expect(useMyParticipantId().value).toBeNull();
	});
});
