/**
 * Device storage for working without signal (specs/offline-mode).
 *
 * Three key-value stores in one IndexedDB database:
 * - `responses`: GET answers the app can show without signal (M2);
 * - `outbox`: writes waiting to be sent (M4);
 * - `meta`: small facts such as the saved permission profile.
 *
 * A thin wrapper on purpose (no extra dependency): every caller goes through
 * `KeyValueStore`, and tests swap in `createMemoryStore()`.
 */

export type StoreName = 'responses' | 'outbox' | 'meta';

export interface KeyValueStore {
	get<T>(store: StoreName, key: string): Promise<T | undefined>;
	put<T>(store: StoreName, key: string, value: T): Promise<void>;
	delete(store: StoreName, key: string): Promise<void>;
	entries<T>(store: StoreName): Promise<Array<[string, T]>>;
	clear(store: StoreName): Promise<void>;
}

const DB_NAME = 'emaus-offline';
const DB_VERSION = 1;
const STORES: StoreName[] = ['responses', 'outbox', 'meta'];

/**
 * Set on the first write. Reads and deletes skip IndexedDB until then, so a
 * browser that never logged in (a walker on the public registration page) never
 * gets the database created just by being asked whether it has anything.
 */
const USED_FLAG = 'emaus-offline-used';

export function offlineStorageWasUsed(): boolean {
	try {
		return localStorage.getItem(USED_FLAG) === '1';
	} catch {
		return true;
	}
}

function markOfflineStorageUsed(): void {
	try {
		localStorage.setItem(USED_FLAG, '1');
	} catch {
		// private mode: IndexedDB will decide by itself
	}
}

const promisify = <T>(request: IDBRequest<T>): Promise<T> =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

export function createIndexedDbStore(factory: IDBFactory = indexedDB): KeyValueStore {
	let dbPromise: Promise<IDBDatabase> | null = null;

	const open = (): Promise<IDBDatabase> => {
		if (!dbPromise) {
			dbPromise = new Promise((resolve, reject) => {
				const request = factory.open(DB_NAME, DB_VERSION);
				request.onupgradeneeded = () => {
					const db = request.result;
					for (const name of STORES) {
						if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
					}
				};
				request.onsuccess = () => {
					const db = request.result;
					// Another tab upgrading the schema: let it, reopen on next use.
					db.onversionchange = () => {
						db.close();
						dbPromise = null;
					};
					resolve(db);
				};
				request.onerror = () => {
					dbPromise = null;
					reject(request.error);
				};
			});
		}
		return dbPromise;
	};

	const run = async <T>(
		store: StoreName,
		mode: IDBTransactionMode,
		action: (s: IDBObjectStore) => IDBRequest<T>,
	): Promise<T> => {
		const db = await open();
		return promisify(action(db.transaction(store, mode).objectStore(store)));
	};

	return {
		get: async <T>(store: StoreName, key: string) => {
			if (!offlineStorageWasUsed()) return undefined;
			return run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
		},
		put: async (store, key, value) => {
			markOfflineStorageUsed();
			await run(store, 'readwrite', (s) => s.put(value, key));
		},
		delete: async (store, key) => {
			if (!offlineStorageWasUsed()) return;
			await run(store, 'readwrite', (s) => s.delete(key));
		},
		entries: async <T>(store: StoreName) => {
			if (!offlineStorageWasUsed()) return [];
			const db = await open();
			const s = db.transaction(store, 'readonly').objectStore(store);
			const [keys, values] = await Promise.all([
				promisify(s.getAllKeys()),
				promisify(s.getAll() as IDBRequest<T[]>),
			]);
			return keys.map((k, i) => [String(k), values[i]] as [string, T]);
		},
		clear: async (store) => {
			if (!offlineStorageWasUsed()) return;
			await run(store, 'readwrite', (s) => s.clear());
		},
	};
}

export function createMemoryStore(): KeyValueStore {
	const data: Record<StoreName, Map<string, unknown>> = {
		responses: new Map(),
		outbox: new Map(),
		meta: new Map(),
	};
	// Structured clone like IndexedDB does, so callers cannot mutate stored values.
	const copy = <T>(value: T): T => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
	return {
		get: async <T>(store: StoreName, key: string) => copy(data[store].get(key) as T | undefined),
		put: async (store, key, value) => {
			data[store].set(key, copy(value));
		},
		delete: async (store, key) => {
			data[store].delete(key);
		},
		entries: async <T>(store: StoreName) =>
			[...data[store].entries()].map(([k, v]) => [k, copy(v as T)] as [string, T]),
		clear: async (store) => {
			data[store].clear();
		},
	};
}

let current: KeyValueStore | null = null;

/** IndexedDB when the browser has it; memory otherwise (private modes, old engines). */
export function getOfflineStore(): KeyValueStore {
	if (!current) {
		current =
			typeof indexedDB !== 'undefined' ? createIndexedDbStore(indexedDB) : createMemoryStore();
	}
	return current;
}

/** Only for tests. */
export function setOfflineStoreForTests(store: KeyValueStore | null): void {
	current = store;
}
