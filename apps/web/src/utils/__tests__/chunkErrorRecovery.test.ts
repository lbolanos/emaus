import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
	shouldReloadForChunkError,
	isChunkLoadError,
	_resetForTests,
} from '../chunkErrorRecovery';

describe('chunkErrorRecovery', () => {
	beforeEach(() => {
		_resetForTests();
		sessionStorage.clear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('shouldReloadForChunkError', () => {
		it('returns true on the first call', () => {
			expect(shouldReloadForChunkError()).toBe(true);
		});

		it('sets sessionStorage count and timestamp', () => {
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
			shouldReloadForChunkError();
			expect(sessionStorage.getItem('chunk_error_reload_count')).toBe('1');
			expect(sessionStorage.getItem('chunk_error_reload_ts')).toBe(
				String(new Date('2026-01-01T00:00:00Z').getTime()),
			);
		});

		it('blocks re-entrant calls via in-flight latch', () => {
			expect(shouldReloadForChunkError()).toBe(true);
			expect(shouldReloadForChunkError()).toBe(false);
		});

		it('throttles calls within 30 seconds', () => {
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
			expect(shouldReloadForChunkError()).toBe(true);

			// Reset latch to simulate new navigation attempt
			_resetForTests();
			vi.setSystemTime(new Date('2026-01-01T00:00:15Z')); // 15s later
			expect(shouldReloadForChunkError()).toBe(false);
		});

		it('allows calls after throttle window passes', () => {
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
			expect(shouldReloadForChunkError()).toBe(true);

			_resetForTests();
			vi.setSystemTime(new Date('2026-01-01T00:00:31Z')); // 31s later
			expect(shouldReloadForChunkError()).toBe(true);
		});

		it('stops after MAX_RELOADS (3) are exhausted', () => {
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
			expect(shouldReloadForChunkError()).toBe(true);

			_resetForTests();
			vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
			expect(shouldReloadForChunkError()).toBe(true);

			_resetForTests();
			vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
			expect(shouldReloadForChunkError()).toBe(true);

			// 4th attempt should be blocked
			_resetForTests();
			vi.setSystemTime(new Date('2026-01-01T00:03:00Z'));
			expect(shouldReloadForChunkError()).toBe(false);
		});

		it('increments count correctly across calls', () => {
			vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
			shouldReloadForChunkError();
			expect(sessionStorage.getItem('chunk_error_reload_count')).toBe('1');

			_resetForTests();
			vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
			shouldReloadForChunkError();
			expect(sessionStorage.getItem('chunk_error_reload_count')).toBe('2');

			_resetForTests();
			vi.setSystemTime(new Date('2026-01-01T00:02:00Z'));
			shouldReloadForChunkError();
			expect(sessionStorage.getItem('chunk_error_reload_count')).toBe('3');
		});

		it('returns false when sessionStorage throws (Safari Private Browsing)', () => {
			const originalSetItem = sessionStorage.setItem;
			sessionStorage.setItem = vi.fn(() => {
				throw new DOMException('QuotaExceededError');
			});

			expect(shouldReloadForChunkError()).toBe(false);
			sessionStorage.setItem = originalSetItem;
		});
	});

	describe('isChunkLoadError', () => {
		it('detects "Failed to fetch dynamically imported module"', () => {
			const err = new Error('Failed to fetch dynamically imported module: /assets/Foo-abc123.js');
			expect(isChunkLoadError(err)).toBe(true);
		});

		it('detects "Importing a module script failed"', () => {
			const err = new Error('Importing a module script failed');
			expect(isChunkLoadError(err)).toBe(true);
		});

		it('detects "error loading dynamically imported module"', () => {
			const err = new Error('error loading dynamically imported module');
			expect(isChunkLoadError(err)).toBe(true);
		});

		it('detects ChunkLoadError by name', () => {
			const err = new Error('some message');
			err.name = 'ChunkLoadError';
			expect(isChunkLoadError(err)).toBe(true);
		});

		it('returns false for unrelated errors', () => {
			expect(isChunkLoadError(new Error('Network timeout'))).toBe(false);
			expect(isChunkLoadError(new Error('Cannot read properties of null'))).toBe(false);
			expect(isChunkLoadError(new TypeError('undefined is not a function'))).toBe(false);
		});
	});
});
