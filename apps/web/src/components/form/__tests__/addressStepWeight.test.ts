import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * `country-state-city` ships three JSON assets and its entry point imports all of
 * them: country.json (93 KB), state.json (542 KB) and city.json (7.7 MB, ~150 000
 * cities). The address step of the public registration only ever needs the first
 * two, but it used to `import('country-state-city')`, so opening it downloaded
 * 9 MB — the select stayed disabled on mobile data and the memory spike got the
 * tab killed and reloaded on Safari iOS (reported 2026-09-03).
 *
 * Nothing else catches this: types are erased, the build stays green and the app
 * works fine on a laptop. Hence the source-level guard.
 *
 * The runtime counterpart lives in
 * `tests/e2e/server-registration-mobile.spec.ts`, which budgets the bytes the
 * step is allowed to download.
 */

const resolve = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

const read = (relative: string) => readFileSync(resolve(relative), 'utf-8');

/** A dynamic import of the package root, which is the one that costs 8 MB. */
const IMPORTS_WHOLE_PACKAGE = /import\(\s*['"]country-state-city['"]\s*\)/;

describe('address step payload', () => {
	it('CountrySelector loads only the country list', () => {
		const source = read('../CountrySelector.vue');
		expect(source).not.toMatch(IMPORTS_WHOLE_PACKAGE);
		expect(source).toContain("import('country-state-city/lib/country')");
	});

	it('StateSelector loads only the state list', () => {
		const source = read('../StateSelector.vue');
		expect(source).not.toMatch(IMPORTS_WHOLE_PACKAGE);
		expect(source).toContain("import('country-state-city/lib/state')");
	});

	it('no city list is shipped to the registration form', () => {
		// City is a free-text input: the 7.7 MB catalogue never justified itself.
		expect(existsSync(resolve('../CitySelector.vue'))).toBe(false);

		const step = read('../../registration/Step2AddressInfo.vue');
		expect(step).not.toContain('CitySelector');
		expect(step).not.toMatch(/import\(\s*['"]country-state-city\/lib\/city['"]\s*\)/);
		expect(step).toContain('<Input id="city"');
	});
});
