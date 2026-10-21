import { getOfflineStore } from './storage';

/**
 * The last permission profile the server confirmed (specs/offline-mode, D8).
 *
 * Without signal the router cannot ask `/auth/status`, and an unknown session is
 * treated as logged out — the team ended on the login screen at the retreat
 * house. This copy only paints the UI (menus, buttons); every write is still
 * checked by the server when it is sent.
 */

const KEY = 'authProfile';
/** Same as the rolling session: an older profile belongs to an expired session. */
export const MAX_PROFILE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface SavedAuthProfile<T = unknown> {
	status: T;
	savedAt: number;
}

export async function saveAuthProfile<T>(status: T, now: number = Date.now()): Promise<void> {
	try {
		await getOfflineStore().put<SavedAuthProfile<T>>('meta', KEY, { status, savedAt: now });
	} catch (error) {
		console.warn('[offline] could not save the auth profile', error);
	}
}

export async function loadAuthProfile<T>(now: number = Date.now()): Promise<T | null> {
	try {
		const saved = await getOfflineStore().get<SavedAuthProfile<T>>('meta', KEY);
		if (!saved || now - saved.savedAt > MAX_PROFILE_AGE_MS) return null;
		return saved.status;
	} catch {
		return null;
	}
}

export async function clearAuthProfile(): Promise<void> {
	try {
		await getOfflineStore().delete('meta', KEY);
	} catch {
		// nothing saved, or storage unavailable
	}
}
