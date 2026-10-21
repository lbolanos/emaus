import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';

/**
 * specs/offline-mode D11 (decided 2026-10-20): the toast a screen shows right
 * after a write saved on the phone says so; a screen without a toast gets the
 * queue's own one.
 */

const ui = vi.hoisted(() => ({ toasts: null as any, toast: null as any }));

vi.mock('@repo/ui', async () => {
	const { ref, computed } = await import('vue');
	const list = ref<any[]>([]);
	let id = 0;
	ui.toasts = list;
	// Same shape as @repo/ui: newest first, TOAST_LIMIT 1.
	ui.toast = vi.fn((props: any) => {
		list.value = [{ id: String(++id), ...props }, ...list.value].slice(0, 1);
	});
	return { useToast: () => ({ toasts: computed(() => list.value), toast: ui.toast }) };
});

import { installQueuedToastNote, noteQueuedWrite, NOTE_WINDOW_MS, _resetQueuedToastForTests } from '../queuedToast';

const t = (key: string) =>
	({
		'offline.queued.title': 'Guardado en el teléfono',
		'offline.queued.description': 'Sin conexión: se enviará solo cuando vuelva la señal.',
		'offline.queued.note': 'Guardado en el teléfono: se enviará solo cuando vuelva la señal.',
	})[key] ?? key;

const shown = () => ui.toasts.value[0];

describe('queued write → the toast says "saved on the phone"', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		_resetQueuedToastForTests();
		ui.toasts.value = [];
		ui.toast.mockClear();
		installQueuedToastNote(t);
	});

	afterEach(() => vi.useRealTimers());

	it('the screen’s own success toast gets the note, and no second toast follows', async () => {
		noteQueuedWrite();
		ui.toast({ title: 'Pago registrado para Ana' });
		await nextTick();

		expect(shown()).toMatchObject({
			title: 'Pago registrado para Ana',
			description: 'Guardado en el teléfono: se enviará solo cuando vuelva la señal.',
		});
		await vi.advanceTimersByTimeAsync(NOTE_WINDOW_MS + 10);
		expect(ui.toast).toHaveBeenCalledTimes(1);
	});

	it('a description the screen already had is kept', async () => {
		noteQueuedWrite();
		ui.toast({ title: 'Cama asignada', description: 'Cuarto 12.' });
		await nextTick();
		expect(shown().description).toBe('Cuarto 12. Guardado en el teléfono: se enviará solo cuando vuelva la señal.');
	});

	it('a screen with no toast gets the queue’s own one', async () => {
		noteQueuedWrite();
		await vi.advanceTimersByTimeAsync(NOTE_WINDOW_MS + 10);
		expect(shown()).toMatchObject({ title: 'Guardado en el teléfono' });
	});

	it('an error toast is not dressed as saved', async () => {
		noteQueuedWrite();
		ui.toast({ title: 'Error', description: 'algo falló', variant: 'destructive' });
		await nextTick();
		expect(shown().description).toBe('algo falló');
		await vi.advanceTimersByTimeAsync(NOTE_WINDOW_MS + 10);
		expect(shown().title).toBe('Guardado en el teléfono');
	});

	it('a toast long after the write is not touched', async () => {
		noteQueuedWrite();
		await vi.advanceTimersByTimeAsync(NOTE_WINDOW_MS + 10);
		ui.toast({ title: 'Lista actualizada' });
		await nextTick();
		expect(shown().description).toBeUndefined();
	});

	it('a screen that already says it (record edit) is not repeated', async () => {
		noteQueuedWrite();
		ui.toast({ title: 'Guardado en el teléfono', description: 'Sin conexión: se enviará solo cuando vuelva la señal.' });
		await nextTick();
		await vi.advanceTimersByTimeAsync(NOTE_WINDOW_MS + 10);
		expect(ui.toast).toHaveBeenCalledTimes(1);
		expect(shown().description).toBe('Sin conexión: se enviará solo cuando vuelva la señal.');
	});
});
