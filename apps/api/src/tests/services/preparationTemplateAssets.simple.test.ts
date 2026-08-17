// Guard de integridad de las plantillas markdown de las preparaciones.
//
// Razón de ser: los .docx que estas plantillas reemplazaron traían quemadas
// las fechas de un retiro pasado ("Polanco III"), así que cada retiro nuevo
// recibía el calendario de otro. Este test falla si alguien reintroduce una
// fecha literal, usa un placeholder que nadie resuelve, o referencia una
// imagen que no se desplegó.
//
// Usa __dirname a propósito: corre bajo Jest/ts-jest (CommonJS), nunca dentro
// del bundle ESM de producción — a diferencia del código de src/, donde
// __dirname crashea el API al arrancar.

import * as fs from 'fs';
import * as path from 'path';
import { DEFAULT_PREPARATION_DOCS } from '@/data/preparationDocSeeder';

const DOCS_DIR = path.resolve(__dirname, '../../data/preparation-docs');
const PUBLIC_DIR = path.resolve(__dirname, '../../../../web/public');

// Los únicos placeholders que el pipeline sabe resolver: {retreat.*} vía
// buildRetreatReplacements y {preparations.*} vía el scope nuevo.
const KNOWN_PLACEHOLDERS = new Set([
	'retreat.parish',
	'retreat.startDate',
	'retreat.endDate',
	'retreat.maxWalkers',
	'retreat.maxServers',
	'retreat.walkerArrivalTime',
	'retreat.serverArrivalTimeFriday',
	'retreat.cost',
	'retreat.paymentInfo',
	'retreat.type',
	'retreat.number',
	'preparations.table',
	'preparations.count',
	'preparations.firstDate',
	'preparations.lastDate',
]);

// Restos del retiro del que venían los .docx originales.
const BURNED_IN_LITERALS = [
	'Polanco',
	'23 de Mayo',
	'23 de marzo',
	'30 caminantes',
	'17 de enero',
	'24 de enero',
	'31 de enero',
];

const readTemplate = (asset: string) => fs.readFileSync(path.join(DOCS_DIR, asset), 'utf-8');

describe('plantillas de las preparaciones', () => {
	it('todas las plantillas del manifest existen y tienen contenido', () => {
		for (const doc of DEFAULT_PREPARATION_DOCS) {
			const file = path.join(DOCS_DIR, doc.asset);
			expect(fs.existsSync(file)).toBe(true);
			expect(readTemplate(doc.asset).trim().length).toBeGreaterThan(500);
		}
	});

	it('conserva el .docx original de cada semana para la descarga opcional', () => {
		for (const doc of DEFAULT_PREPARATION_DOCS) {
			expect(fs.existsSync(path.join(DOCS_DIR, doc.legacyAsset))).toBe(true);
		}
	});

	it('ninguna plantilla trae fechas ni cupos de otro retiro quemados', () => {
		for (const doc of DEFAULT_PREPARATION_DOCS) {
			const content = readTemplate(doc.asset);
			for (const literal of BURNED_IN_LITERALS) {
				expect(`${doc.asset}: ${content.includes(literal)}`).toBe(`${doc.asset}: false`);
			}
		}
	});

	it('solo usa placeholders que el motor sabe resolver', () => {
		for (const doc of DEFAULT_PREPARATION_DOCS) {
			const used = [...readTemplate(doc.asset).matchAll(/\{([a-zA-Z][a-zA-Z.]*)\}/g)].map(
				(m) => m[1],
			);
			for (const key of used) {
				expect(`${doc.asset}: ${key}`).toBe(
					`${doc.asset}: ${KNOWN_PLACEHOLDERS.has(key) ? key : 'DESCONOCIDO'}`,
				);
			}
		}
	});

	it('el documento de Servicio inserta el calendario en vez de listarlo a mano', () => {
		const servicio = readTemplate('semana1-servicio.md');
		expect(servicio).toContain('{preparations.table}');
		expect(servicio).toContain('{retreat.maxWalkers}');
		expect(servicio).toContain('{retreat.serverArrivalTimeFriday}');
	});

	it('todas las imágenes referenciadas están desplegadas, y no hay huérfanas', () => {
		const referenced = new Set<string>();
		for (const doc of DEFAULT_PREPARATION_DOCS) {
			for (const match of readTemplate(doc.asset).matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
				const src = match[1];
				referenced.add(src);
				expect(`${src}: ${fs.existsSync(path.join(PUBLIC_DIR, src))}`).toBe(`${src}: true`);
			}
		}

		const assetsRoot = path.join(PUBLIC_DIR, 'preparation-assets');
		if (!fs.existsSync(assetsRoot)) return;
		for (const dir of fs.readdirSync(assetsRoot)) {
			for (const file of fs.readdirSync(path.join(assetsRoot, dir))) {
				const src = `/preparation-assets/${dir}/${file}`;
				expect(`${src}: ${referenced.has(src)}`).toBe(`${src}: true`);
			}
		}
	});
});
