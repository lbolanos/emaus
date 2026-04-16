/**
 * Locale-aware comparator factory for sorting lists.
 *
 * Handles:
 * - null/undefined/'' values: always pushed to the end regardless of direction
 * - numbers: numeric comparison
 * - booleans: false < true
 * - strings: Intl.Collator with the given locale, accent-insensitive (sensitivity: 'base'),
 *   and numeric-aware (so "2" sorts before "10")
 */
export function createLocaleComparator(
	locale: string = 'es',
	direction: 'asc' | 'desc' = 'asc',
): (a: unknown, b: unknown) => number {
	const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
	const orderMul = direction === 'asc' ? 1 : -1;
	return (a, b) => {
		const aEmpty = a === null || a === undefined || a === '';
		const bEmpty = b === null || b === undefined || b === '';
		if (aEmpty && bEmpty) return 0;
		if (aEmpty) return 1;
		if (bEmpty) return -1;

		if (typeof a === 'number' && typeof b === 'number') {
			return orderMul * (a - b);
		}
		if (typeof a === 'boolean' && typeof b === 'boolean') {
			return orderMul * (a === b ? 0 : a ? 1 : -1);
		}
		return orderMul * collator.compare(String(a), String(b));
	};
}

/**
 * Resolve a nested property by dot-path. Returns undefined if any segment is missing.
 */
export function getNestedProperty<T = unknown>(obj: unknown, path: string): T | undefined {
	return path.split('.').reduce<unknown>((acc, part) => {
		if (acc === null || acc === undefined) return undefined;
		return (acc as Record<string, unknown>)[part];
	}, obj) as T | undefined;
}
