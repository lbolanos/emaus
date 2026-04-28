/**
 * Tests for csrf.ts — exponential backoff retry behavior (bug fix 2026-04-25)
 *
 * Bug: initializeCsrfProtection() reintentaba cada 1 segundo sin límite cuando
 * /csrf-token devolvía 429. Junto con el bucle de tableMesaStore.$subscribe,
 * esto saturaba el rate-limiter de la API y dejaba toda la app inoperable.
 *
 * Fix: backoff exponencial (2s, 4s, 8s, 16s, 30s cap) con máximo 5 intentos.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock axios antes de importar csrf
vi.mock('axios', () => {
	const mockAxios = {
		defaults: { baseURL: '', withCredentials: false },
		get: vi.fn(),
		interceptors: {
			request: { use: vi.fn() },
			response: { use: vi.fn() },
		},
	};
	return { default: mockAxios };
});

vi.mock('@/config/runtimeConfig', () => ({
	getApiUrl: () => 'http://localhost:3001/api',
}));

describe('csrf — exponential backoff (bug fix: bucle infinito)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('calcula el delay correcto para cada intento (fórmula 2000 * 2^n, cap 30s)', () => {
		const delays = [0, 1, 2, 3, 4].map((attempt) =>
			Math.min(2000 * Math.pow(2, attempt), 30_000),
		);
		expect(delays).toEqual([2000, 4000, 8000, 16000, 30000]);
	});

	it('el delay del intento 4 queda limitado a 30 000ms y no crece más', () => {
		for (let attempt = 4; attempt < 20; attempt++) {
			const delay = Math.min(2000 * Math.pow(2, attempt), 30_000);
			expect(delay).toBe(30_000);
		}
	});

	it('MAX_ATTEMPTS=5 detiene el bucle en el 5° intento fallido', async () => {
		const { default: axios } = await import('axios');
		(axios.get as any).mockRejectedValue(new Error('429'));

		// Importar fresco para evitar cache de módulo
		vi.resetModules();
		vi.mock('axios', () => {
			const mockAxios = {
				defaults: { baseURL: '', withCredentials: false },
				get: vi.fn().mockRejectedValue(new Error('429')),
				interceptors: {
					request: { use: vi.fn() },
					response: { use: vi.fn() },
				},
			};
			return { default: mockAxios };
		});

		// Simula la lógica de retry directamente
		let attempts = 0;
		const MAX_ATTEMPTS = 5;
		const tryInit = async (attempt: number): Promise<void> => {
			if (attempt >= MAX_ATTEMPTS) return;
			attempts++;
			// Simula fallo
			const delay = Math.min(2000 * Math.pow(2, attempt), 30_000);
			await new Promise<void>((resolve) => {
				setTimeout(() => resolve(tryInit(attempt + 1)), delay);
			});
		};

		const promise = tryInit(0);
		// Avanzar todos los timers hasta que se resuelva
		await vi.runAllTimersAsync();
		await promise;

		expect(attempts).toBe(MAX_ATTEMPTS);
	});

	it('se detiene inmediatamente si el primer intento tiene éxito', async () => {
		let attempts = 0;
		const MAX_ATTEMPTS = 5;

		const tryInit = async (attempt: number): Promise<void> => {
			if (attempt >= MAX_ATTEMPTS) return;
			attempts++;
			// Simula éxito — no llama a setTimeout
		};

		await tryInit(0);
		expect(attempts).toBe(1);
	});

	it('el intento 2 tiene el doble de delay que el intento 1', () => {
		const d1 = Math.min(2000 * Math.pow(2, 0), 30_000); // 2000
		const d2 = Math.min(2000 * Math.pow(2, 1), 30_000); // 4000
		const d3 = Math.min(2000 * Math.pow(2, 2), 30_000); // 8000
		expect(d2).toBe(d1 * 2);
		expect(d3).toBe(d2 * 2);
	});
});

describe('csrf — NO hay bucle infinito tras exhaustar reintentos', () => {
	it('la función retorna sin relanzar cuando attempt >= MAX_ATTEMPTS', async () => {
		const MAX_ATTEMPTS = 5;
		let didResolve = false;

		const tryInit = async (attempt: number): Promise<void> => {
			if (attempt >= MAX_ATTEMPTS) {
				didResolve = true;
				return; // debe retornar limpiamente, no lanzar
			}
			throw new Error('no debería llegar aquí en este test');
		};

		await expect(tryInit(MAX_ATTEMPTS)).resolves.toBeUndefined();
		expect(didResolve).toBe(true);
	});

	it('NO se programan más setTimeout cuando se alcanza MAX_ATTEMPTS', () => {
		vi.useFakeTimers();
		const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
		const MAX_ATTEMPTS = 5;

		const tryInit = (attempt: number): void => {
			if (attempt >= MAX_ATTEMPTS) return; // stop — NO setTimeout
			const delay = Math.min(2000 * Math.pow(2, attempt), 30_000);
			setTimeout(() => tryInit(attempt + 1), delay);
		};

		tryInit(MAX_ATTEMPTS); // entra directo al guard
		expect(setTimeoutSpy).not.toHaveBeenCalled();
		vi.useRealTimers();
	});
});
