/**
 * Every i18n key the special-case feature uses must exist in es.json AND
 * en.json. The global vue-i18n mock returns the key itself, so a missing or
 * misspelled key passes every component test and shows up raw in production
 * (troubleshooting #30).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SPECIAL_CASE_CATEGORIES } from '@repo/types';

const SRC = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf-8');

const es = JSON.parse(read('locales/es.json'));
const en = JSON.parse(read('locales/en.json'));

const resolve = (messages: any, key: string): unknown =>
	key.split('.').reduce((acc, part) => (acc == null ? undefined : acc[part]), messages);

const FILES = [
	'components/ParticipantSpecialCaseToggle.vue',
	'views/SpecialCasesView.vue',
	'components/ParticipantList.vue',
	'views/RetreatDashboardView.vue',
];

const OWN_KEY = /^(specialCases\.|sidebar\.specialCases$|retreatDashboard\.specialCases)/;

const staticKeys = FILES.flatMap((file) =>
	[...read(file).matchAll(/\$?t\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]),
).filter((key) => OWN_KEY.test(key));

// Keys built at runtime (`specialCases.categories.${category}`) and the ones
// the sidebar/layout reference as plain strings.
const dynamicKeys = [
	...SPECIAL_CASE_CATEGORIES.map((category) => `specialCases.categories.${category}`),
	'sidebar.specialCases',
];

const KEYS = [...new Set([...staticKeys, ...dynamicKeys])];

describe('special-case i18n keys', () => {
	it('finds the keys in the source (the regex still matches)', () => {
		expect(staticKeys.length).toBeGreaterThan(10);
		expect(KEYS).toContain('specialCases.confirmRemove');
		expect(KEYS).toContain('retreatDashboard.specialCasesPending');
	});

	it.each(KEYS)('"%s" resolves to text in es.json and en.json', (key) => {
		for (const [name, messages] of [
			['es', es],
			['en', en],
		] as const) {
			const value = resolve(messages, key);
			expect(value, `${key} missing in ${name}.json`).toBeTypeOf('string');
			expect((value as string).trim(), `${key} empty in ${name}.json`).not.toBe('');
		}
	});
});
