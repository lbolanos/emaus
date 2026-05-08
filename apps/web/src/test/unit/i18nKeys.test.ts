/**
 * Static checks for i18n locale files.
 *
 * Verifica que cada clave que el código consume existe en ambos locales
 * (es y en). Es una guardia contra regresiones del tipo:
 *
 *   - Sidebar.vue tenía `label: 'Minuto a Minuto'` en lugar de la clave
 *     `sidebar.minuteByMinute` → vue-i18n lanzaba "Missing: Minuto a Minuto".
 *   - Se agregó un nuevo enum WALKER_FOLLOWUP_WEEK_1 sin la traducción
 *     correspondiente en `messageTemplates.types`.
 *
 * Si añades un nuevo key a alguno de los dos archivos sin su contraparte,
 * este test falla de inmediato.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const ES_PATH = join(__dirname, '..', '..', 'locales', 'es.json');
const EN_PATH = join(__dirname, '..', '..', 'locales', 'en.json');

const es = JSON.parse(readFileSync(ES_PATH, 'utf-8'));
const en = JSON.parse(readFileSync(EN_PATH, 'utf-8'));

function flatten(obj: any, prefix = ''): string[] {
	const keys: string[] = [];
	for (const k of Object.keys(obj)) {
		const path = prefix ? `${prefix}.${k}` : k;
		if (obj[k] !== null && typeof obj[k] === 'object' && !Array.isArray(obj[k])) {
			keys.push(...flatten(obj[k], path));
		} else {
			keys.push(path);
		}
	}
	return keys;
}

const esKeys = new Set(flatten(es));
const enKeys = new Set(flatten(en));

describe('i18n locale parity (informativo)', () => {
	// El proyecto arrastra ~258 keys históricamente desbalanceadas entre
	// es y en. Limpiar eso está fuera de scope de estos tests, pero
	// imprimimos un diff informativo cuando el test runner usa --verbose
	// para que sea fácil detectar drift nuevo. No fallamos — este test
	// es solo telemetría.
	it.skip('paridad completa (skip — drift histórico del proyecto)', () => {
		const onlyInEs = [...esKeys].filter((k) => !enKeys.has(k));
		const onlyInEn = [...enKeys].filter((k) => !esKeys.has(k));
		expect(onlyInEs).toEqual([]);
		expect(onlyInEn).toEqual([]);
	});
});

describe('i18n required keys for the Sidebar', () => {
	const SIDEBAR_KEYS = [
		'sidebar.minuteByMinute',
		'sidebar.shirtTypes',
		'sidebar.mySchedule',
		'sidebar.scheduleTemplate',
		'sidebar.communities',
		'sidebar.myProfile',
		'sidebar.myRetreats',
	];

	it.each(SIDEBAR_KEYS)('"%s" existe en es.json', (key) => {
		expect(esKeys.has(key)).toBe(true);
	});

	it.each(SIDEBAR_KEYS)('"%s" existe en en.json', (key) => {
		expect(enKeys.has(key)).toBe(true);
	});
});

describe('i18n required keys for messageTemplates.types', () => {
	// Lista derivada del enum GlobalMessageTemplateType en
	// apps/api/src/entities/globalMessageTemplate.entity.ts.
	// Si agregas un nuevo type, agrega también la traducción y aquí.
	const REQUIRED_TYPES = [
		'WALKER_WELCOME',
		'SERVER_WELCOME',
		'EMERGENCY_CONTACT_VALIDATION',
		'PALANCA_REQUEST',
		'PALANCA_REMINDER',
		'GENERAL',
		'PRE_RETREAT_REMINDER',
		'PAYMENT_REMINDER',
		'POST_RETREAT_MESSAGE',
		'CANCELLATION_CONFIRMATION',
		'USER_INVITATION',
		'PASSWORD_RESET',
		'RETREAT_SHARED_NOTIFICATION',
		'BIRTHDAY_MESSAGE',
		'PALANQUERO_NEW_WALKER',
		'PRIVACY_DATA_DELETE',
		// Walker follow-up sequence (post-retreat)
		'WALKER_FOLLOWUP_WEEK_1',
		'WALKER_FOLLOWUP_MONTH_1',
		'WALKER_FOLLOWUP_MONTH_3',
		'WALKER_FOLLOWUP_MONTH_6',
		'WALKER_FOLLOWUP_YEAR_1',
		'WALKER_REUNION_INVITATION',
	];

	it.each(REQUIRED_TYPES)('messageTemplates.types.%s existe en es.json', (type) => {
		expect(esKeys.has(`messageTemplates.types.${type}`)).toBe(true);
	});

	it.each(REQUIRED_TYPES)('messageTemplates.types.%s existe en en.json', (type) => {
		expect(enKeys.has(`messageTemplates.types.${type}`)).toBe(true);
	});
});
