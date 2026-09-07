#!/usr/bin/env node
/**
 * Fixture del video de retiros de parejas.
 *
 * Crea (o reutiliza) un retiro `retreat_type='couples'` con parejas FICTICIAS
 * registradas por el API público de pareja, para grabar la demo sin exponer datos
 * reales de ningún retiro. Todo se hace por el API — nunca por sqlite (ver la
 * advertencia CRITICAL del skill demo-videos).
 *
 *   node apps/web/e2e/demo/couples-fixture.mjs           # crea/puebla
 *   node apps/web/e2e/demo/couples-fixture.mjs --status  # solo reporta
 *
 * Imprime el retreatId/slug para que el record script los tome por env.
 */
import { loadEnv } from './demo-lib.mjs';

// loadEnv() normaliza las claves del .env a camelCase (baseUrl/email/password).
const env = loadEnv();
const BASE = env.baseUrl || 'http://localhost:5173';
const API = `${BASE}/api`;
const EMAIL = env.email;
const PASSWORD = env.password;

const SLUG = process.env.DEMO_COUPLES_SLUG || 'demoparejas';
const PARISH = 'Parroquia Santa Ana (demo)';

// Parejas ficticias: nombres inventados, correos @example.com, teléfonos 55-00-xx.
// El correo se comparte a propósito — es la diferencia que el video destaca.
const COUPLES = [
	{ he: 'Andrés', she: 'Paula', last: 'Rivas', email: 'rivas@example.com' },
	{ he: 'Tomás', she: 'Renata', last: 'Ocampo', email: 'ocampo@example.com' },
	{ he: 'Emilio', she: 'Carmen', last: 'Vidal', email: 'vidal@example.com' },
	{ he: 'Rubén', she: 'Sofía', last: 'Lazcano', email: 'lazcano@example.com' },
	{ he: 'Ignacio', she: 'Elena', last: 'Bustos', email: 'bustos@example.com' },
	{ he: 'Damián', she: 'Julia', last: 'Nieto', email: 'nieto@example.com' },
];

const jar = new Map();

const cookieHeader = () =>
	[...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

function absorbCookies(res) {
	const raw = res.headers.getSetCookie?.() ?? [];
	for (const c of raw) {
		const [pair] = c.split(';');
		const idx = pair.indexOf('=');
		if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
	}
}

async function api(path, { method = 'GET', body, csrf } = {}) {
	const headers = { 'Content-Type': 'application/json' };
	if (jar.size) headers.Cookie = cookieHeader();
	if (csrf) headers['X-CSRF-Token'] = csrf;
	const res = await fetch(`${API}${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
	});
	absorbCookies(res);
	const text = await res.text();
	let json;
	try {
		json = text ? JSON.parse(text) : null;
	} catch {
		json = text;
	}
	return { ok: res.ok, status: res.status, json };
}

async function getCsrf() {
	const res = await api('/csrf-token');
	return res.json?.csrfToken;
}

async function login() {
	const csrf = await getCsrf();
	const res = await api('/auth/login', {
		method: 'POST',
		body: { email: EMAIL, password: PASSWORD },
		csrf,
	});
	if (!res.ok) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.json)}`);
	return getCsrf();
}

const ymd = (d) => d.toISOString().slice(0, 10);

async function findRetreatBySlug() {
	const res = await api(`/retreats/public/slug/${SLUG}`);
	return res.ok ? res.json : null;
}

async function createRetreat(csrf) {
	const houses = await api('/houses');
	const house = (houses.json || [])[0];
	if (!house) throw new Error('no houses in this database');

	const start = new Date(Date.now() + 45 * 24 * 3600 * 1000);
	const end = new Date(start.getTime() + 2 * 24 * 3600 * 1000);

	const res = await api('/retreats', {
		method: 'POST',
		csrf,
		body: {
			parish: PARISH,
			startDate: ymd(start),
			endDate: ymd(end),
			houseId: house.id,
			retreat_type: 'couples',
			retreat_number_version: 'I',
			slug: SLUG,
			isPublic: true,
			max_walkers: 20,
			max_servers: 10,
			cost: '$4,000',
			couplesShareRoom: true,
			couplesShareTable: true,
			roleInvitationEnabled: true,
			notifyParticipant: false,
			notifyInviter: false,
		},
	});
	if (!res.ok) throw new Error(`create retreat failed: ${res.status} ${JSON.stringify(res.json)}`);
	return res.json;
}

const spouse = (firstName, lastName, email, phone, birthDate, occupation, snores) => ({
	firstName,
	lastName,
	nickname: firstName,
	birthDate,
	maritalStatus: 'C',
	street: 'Calle Demo',
	houseNumber: '10',
	postalCode: '01000',
	neighborhood: 'Centro',
	city: 'Ciudad de México',
	state: 'CDMX',
	country: 'MX',
	cellPhone: phone,
	email,
	occupation,
	snores,
	hasMedication: false,
	hasDietaryRestrictions: false,
	sacraments: ['marriage'],
	emergencyContact1Name: 'Contacto Demo',
	emergencyContact1Relation: 'Familiar',
	emergencyContact1CellPhone: '5500000000',
});

async function registerCouple(retreatId, c, i, csrf) {
	const phoneA = `55000${String(100 + i * 2).padStart(5, '0')}`.slice(0, 10);
	const phoneB = `55000${String(101 + i * 2).padStart(5, '0')}`.slice(0, 10);
	const body = {
		retreatId,
		type: 'walker',
		acceptedPrivacyNotice: true,
		husband: spouse(c.he, c.last, c.email, phoneA, `197${i}-04-12`, 'Ingeniero', i % 2 === 0),
		wife: spouse(c.she, c.last, c.email, phoneB, `198${i}-09-03`, 'Maestra', false),
	};
	const res = await api('/participants/couple/new', { method: 'POST', csrf, body });
	if (!res.ok) {
		const msg = typeof res.json === 'object' ? JSON.stringify(res.json) : res.json;
		console.warn(`  ! ${c.last}: ${res.status} ${msg}`);
		return null;
	}
	return res.json;
}

async function status(retreatId) {
	const res = await api(`/participants?retreatId=${retreatId}`);
	const list = Array.isArray(res.json) ? res.json : [];
	const linked = list.filter((p) => p.spouseParticipantId).length;
	return { total: list.length, linked };
}

async function main() {
	const statusOnly = process.argv.includes('--status');
	const csrf = await login();

	let retreat = await findRetreatBySlug();
	if (!retreat) {
		if (statusOnly) {
			console.log(`No existe el retiro /${SLUG}`);
			return;
		}
		console.log(`→ Creando retiro de parejas /${SLUG}…`);
		retreat = await createRetreat(csrf);
	}
	console.log(`Retiro: ${retreat.parish || PARISH}  id=${retreat.id}  slug=${SLUG}`);

	if (!statusOnly) {
		const before = await status(retreat.id);
		if (before.linked >= COUPLES.length * 2) {
			console.log(`Ya poblado (${before.linked} participantes vinculados).`);
		} else {
			console.log(`→ Registrando ${COUPLES.length} parejas ficticias…`);
			for (let i = 0; i < COUPLES.length; i++) {
				const created = await registerCouple(retreat.id, COUPLES[i], i, csrf);
				if (created) console.log(`  ✓ ${COUPLES[i].he} y ${COUPLES[i].she} ${COUPLES[i].last}`);
			}
		}
	}

	const after = await status(retreat.id);
	console.log(`Participantes: ${after.total} (vinculados como pareja: ${after.linked})`);
	console.log(`\nDEMO_COUPLES_RETREAT_ID=${retreat.id}\nDEMO_COUPLES_SLUG=${SLUG}`);
}

main().catch((err) => {
	console.error(err.message || err);
	process.exit(1);
});
