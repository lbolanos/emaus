/**
 * Regenera `src/data/canonicalDocHashes.ts`: el SHA-256 de cada revisión canónica de
 * los documentos operativos (charlas, responsabilidades e instrucciones de equipo).
 *
 * Para qué sirve: el contenido se copia a la base cuando se crea un retiro y cuando
 * arranca el API, y nada sobrescribe una copia existente. Una migración de refresco
 * necesita distinguir "esta fila es la canónica intacta" de "esta la editó un
 * coordinador", y lo único que queda del texto viejo una vez editado el fuente es su
 * hash. De ahí que haya que congelarlo ANTES de tocar el contenido.
 *
 * Flujo al cambiar estos textos:
 *   1. `pnpm --filter api exec vite-node scripts/freeze-canonical-doc-hashes.ts`
 *      (con el árbol limpio: lee el contenido actual, que pasa a ser "la revisión previa")
 *   2. editar los diccionarios
 *   3. escribir la migración de refresco que compare contra esos hashes
 *
 * Los hashes se ACUMULAN: el archivo generado conserva las revisiones anteriores además
 * de la actual, porque en una base vieja puede vivir cualquiera de ellas.
 *
 * Rutas contra `process.cwd()` (que es `apps/api`), nunca `__dirname`: el bundle de prod
 * es ESM y `__dirname` no existe ahí.
 */
import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { charlaDocumentation, responsibilityDocumentation } from '../src/data/charlaDocumentation';
import { SERVICE_TEAM_INSTRUCTIONS } from '../src/data/serviceTeamInstructions';

const root = process.cwd();
const outFile = resolve(root, 'src/data/canonicalDocHashes.ts');

/** Migraciones de backfill que embebieron su propia copia literal de las instrucciones. */
const BACKFILL_MIGRATIONS = [
	'src/migrations/sqlite/20260603120000_AddMissingServiceTeams.ts',
	'src/migrations/sqlite/20260605020000_AddComprasSacerdotesTeams.ts',
];

const sha256 = (value: string) => createHash('sha256').update(value, 'utf-8').digest('hex');

type Bucket = Map<string, Set<string>>;

const add = (bucket: Bucket, name: string, content: string) => {
	if (!name || !content) return;
	if (!bucket.has(name)) bucket.set(name, new Set());
	bucket.get(name)!.add(sha256(content));
};

/** Conserva lo ya congelado: en una base vieja puede vivir cualquier revisión previa. */
const seedFromExisting = (docs: Bucket, teams: Bucket) => {
	if (!existsSync(outFile)) return;
	const previous = readFileSync(outFile, 'utf-8');
	const sections: Array<[RegExp, Bucket]> = [
		[/PREVIOUS_DOC_HASHES[^{]*\{([\s\S]*?)\n\};/, docs],
		[/PREVIOUS_TEAM_INSTRUCTION_HASHES[^{]*\{([\s\S]*?)\n\};/, teams],
	];
	for (const [pattern, bucket] of sections) {
		const body = previous.match(pattern)?.[1];
		if (!body) continue;
		// Las claves las escribe JSON.stringify, así que JSON.parse las devuelve tal cual.
		const entry = /("(?:[^"\\]|\\.)*")\s*:\s*\[([\s\S]*?)\]/g;
		let match: RegExpExecArray | null;
		while ((match = entry.exec(body))) {
			const name = JSON.parse(match[1]) as string;
			if (!bucket.has(name)) bucket.set(name, new Set());
			for (const hash of match[2].match(/[0-9a-f]{64}/g) ?? []) bucket.get(name)!.add(hash);
		}
	}
};

const docs: Bucket = new Map();
const teams: Bucket = new Map();
seedFromExisting(docs, teams);

for (const [name, content] of Object.entries(charlaDocumentation)) add(docs, name, content);
for (const [name, content] of Object.entries(responsibilityDocumentation)) add(docs, name, content);
for (const [name, content] of Object.entries(SERVICE_TEAM_INSTRUCTIONS)) add(teams, name, content);

for (const file of BACKFILL_MIGRATIONS) {
	const src = readFileSync(resolve(root, file), 'utf-8');
	const array = src.match(/=\s*(\[[\s\S]*?\n\];)/);
	if (!array) throw new Error(`No pude extraer el array literal de ${file}`);
	for (const team of JSON.parse(array[1].replace(/;$/, ''))) {
		if (team.instructions) add(teams, team.name, team.instructions);
	}
}

const render = (bucket: Bucket) =>
	Array.from(bucket.keys())
		.sort((a, b) => a.localeCompare(b, 'es'))
		.map(
			(name) =>
				`\t${JSON.stringify(name)}: [\n${Array.from(bucket.get(name)!)
					.sort()
					.map((hash) => `\t\t'${hash}',`)
					.join('\n')}\n\t],`,
		)
		.join('\n');

writeFileSync(
	outFile,
	`// GENERATED FILE - do not edit by hand.
//
// SHA-256 de cada revisión canónica conocida de los documentos operativos. La migración
// de refresco los usa para distinguir una copia canónica intacta (segura de actualizar)
// de una que un coordinador editó (se deja como está).
//
// Un nombre puede tener varios hashes: el mismo texto se sembró desde fuentes distintas a
// lo largo del tiempo (los diccionarios de datos y las copias literales embebidas en las
// migraciones de backfill AddMissingServiceTeams / AddComprasSacerdotesTeams), y las
// revisiones anteriores se conservan porque en una base vieja puede vivir cualquiera.
//
// Dos grupos porque unos cuantos nombres (Sacerdotes, Compras, Snacks, Transporte, Cuartos,
// Salón) existen a la vez como documento de responsabilidad y como equipo de servicio, con
// contenidos distintos: cruzarlos refrescaría el texto equivocado.
//
// ESTE MÓDULO NO DEBE IMPORTAR NADA: las migraciones lo cargan en producción, donde
// cualquier cadena de imports que llegue a @repo/types muere con "Unknown file extension .ts".
//
// Regenerar con: pnpm --filter api exec vite-node scripts/freeze-canonical-doc-hashes.ts

/** charlaDocumentation + responsibilityDocumentation → responsability_attachment.content, retreat_responsibilities.description */
export const PREVIOUS_DOC_HASHES: Record<string, string[]> = {
${render(docs)}
};

/** SERVICE_TEAM_INSTRUCTIONS → service_teams.instructions */
export const PREVIOUS_TEAM_INSTRUCTION_HASHES: Record<string, string[]> = {
${render(teams)}
};
`,
	'utf-8',
);

const total = (bucket: Bucket) =>
	Array.from(bucket.values()).reduce((sum, hashes) => sum + hashes.size, 0);
console.log(
	`Congelado en src/data/canonicalDocHashes.ts: ${docs.size} documentos (${total(docs)} revisiones), ` +
		`${teams.size} equipos (${total(teams)} revisiones)`,
);
