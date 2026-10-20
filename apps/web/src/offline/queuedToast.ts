import { watch } from 'vue';
import { useToast } from '@repo/ui';

/**
 * "Saved on the phone" (specs/offline-mode, D11; decided 2026-10-20): when a
 * write waits for signal, the toast the screen shows right after it ("Pago
 * registrado para…", "… marcado como llegado") says so. A separate toast would
 * not do: TOAST_LIMIT is 1 and the screen's own toast replaces it at once.
 * Screens that show no toast get the queue's own one.
 */

/** A screen's toast after a queued write comes right after it (no network). */
export const NOTE_WINDOW_MS = 1500;
/** Bursts (ten arrivals in a row) get one standalone toast, not ten. */
const STANDALONE_EVERY_MS = 10_000;

type Translate = (key: string) => string;

let noteUntil = 0;
let standaloneTimer: ReturnType<typeof setTimeout> | null = null;
let lastStandaloneAt = 0;
let translate: Translate | null = null;

async function getTranslate(): Promise<Translate> {
	if (translate) return translate;
	const { default: i18n } = await import('@/i18n');
	return (i18n as any).global.t as Translate;
}

async function showStandalone(): Promise<void> {
	const now = Date.now();
	if (now - lastStandaloneAt < STANDALONE_EVERY_MS) return;
	lastStandaloneAt = now;
	const t = await getTranslate();
	useToast().toast({ title: t('offline.queued.title'), description: t('offline.queued.description') });
}

/** A write was saved on the phone instead of reaching the server. */
export function noteQueuedWrite(): void {
	noteUntil = Date.now() + NOTE_WINDOW_MS;
	if (standaloneTimer) clearTimeout(standaloneTimer);
	standaloneTimer = setTimeout(() => {
		standaloneTimer = null;
		if (noteUntil === 0) return; // a screen's toast already said it
		noteUntil = 0;
		void showStandalone().catch(() => {});
	}, NOTE_WINDOW_MS);
}

/**
 * Watches the toasts (inside /app, from AppLayout): the first success toast
 * after a queued write gets the note in its description.
 */
export function installQueuedToastNote(t: Translate): void {
	translate = t;
	const toasts = useToast()?.toasts;
	if (!toasts) return;
	const seen = new Set<string>();
	watch(toasts, (list) => {
		for (const item of list ?? []) {
			if (seen.has(item.id)) continue;
			seen.add(item.id);
			if (Date.now() > noteUntil) continue;
			// A screen that already says "Guardado en el teléfono" (the record edit).
			if (item.title === t('offline.queued.title')) {
				noteUntil = 0;
				continue;
			}
			if (item.variant === 'destructive') continue;
			if (item.description !== undefined && typeof item.description !== 'string') continue;
			noteUntil = 0;
			const note = t('offline.queued.note');
			item.description = item.description ? `${item.description} ${note}` : note;
		}
	});
}

/** Only for tests. */
export function _resetQueuedToastForTests(): void {
	noteUntil = 0;
	lastStandaloneAt = 0;
	translate = null;
	if (standaloneTimer) clearTimeout(standaloneTimer);
	standaloneTimer = null;
}
