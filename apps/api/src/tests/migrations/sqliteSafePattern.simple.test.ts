/**
 * Static guard for SQLite migrations going forward.
 *
 * The "recreate table" pattern (CREATE new + COPY + DROP old + RENAME)
 * silently casacades to FK-bound child tables when run inside the
 * implicit transaction TypeORM opens by default — `PRAGMA foreign_keys = OFF`
 * is ignored mid-transaction. The fix is `transaction = false`.
 *
 * Rule: any migration with timestamp >= CUTOFF that contains DROP TABLE
 * or PRAGMA foreign_keys=OFF MUST declare `transaction = false`. Older
 * migrations are grandfathered (legacy code already shipped; rewriting
 * the file does not change the state of any DB where it has run).
 *
 * The cutoff is the timestamp right after the data-loss incident on
 * 2026-05-07: 20260507230000. All migrations BEFORE that point are
 * treated as legacy. Anything we author from now on must follow the
 * pattern documented in `.ruler/skills/sqlite-migrations/SKILL.md`.
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SQLITE_MIGRATIONS = join(__dirname, '..', '..', 'migrations', 'sqlite');

// Migrations created on/after this timestamp must follow the safe pattern.
// 20260507230000 = right after the AddPublicRegistrationToCommunity bug.
const SAFE_PATTERN_CUTOFF = '20260507230000';

function listMigrationFiles(): string[] {
	return readdirSync(SQLITE_MIGRATIONS).filter((f) => f.endsWith('.ts'));
}

function extractTimestamp(filename: string): string | null {
	// Filenames look like `20260507240000_AddWalkerFollowupTemplates.ts` or
	// `1699774320000-FixParticipantCommunicationsUserFk.ts` (legacy).
	const m = filename.match(/^(\d{14}|\d{13})/);
	return m ? m[1] : null;
}

function readMigration(file: string): string {
	return readFileSync(join(SQLITE_MIGRATIONS, file), 'utf-8');
}

function stripComments(src: string): string {
	return src
		.split('\n')
		.filter((l) => {
			const t = l.trim();
			return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
		})
		.join('\n');
}

function isAfterCutoff(timestamp: string | null): boolean {
	if (!timestamp) return false;
	// Handle legacy 13-digit timestamps (epoch ms) — those are always pre-cutoff.
	if (timestamp.length === 13) return false;
	return timestamp >= SAFE_PATTERN_CUTOFF;
}

describe('SQLite migration safety guard (post-2026-05-07)', () => {
	const files = listMigrationFiles();
	const futureFiles = files.filter((f) => isAfterCutoff(extractTimestamp(f)));

	it('finds at least our 3 post-bug migrations (sanity)', () => {
		// AddWalkerFollowupTemplates, RestoreCommunityChildrenInline, ImportGlobalTemplatesToCommunities
		expect(futureFiles.length).toBeGreaterThanOrEqual(3);
	});

	it.each(futureFiles)(
		'%s — if it does DROP TABLE, must declare `transaction = false`',
		(file) => {
			const code = stripComments(readMigration(file));
			const hasDropTable = /\bDROP\s+TABLE\b/i.test(code);
			if (!hasDropTable) {
				return;
			}
			const hasTransactionFalse = /\btransaction\s*=\s*false\b/.test(code);
			if (!hasTransactionFalse) {
				throw new Error(
					`${file} contiene DROP TABLE pero no declara \`transaction = false\`. ` +
						`SQLite ignora PRAGMA foreign_keys=OFF dentro de la transacción que ` +
						`TypeORM abre por defecto, así que el DROP cascadeará a las tablas hijas. ` +
						`Ver .ruler/skills/sqlite-migrations/SKILL.md`,
				);
			}
		},
	);

	it.each(futureFiles)(
		'%s — if it sets PRAGMA foreign_keys = OFF, must also declare `transaction = false`',
		(file) => {
			const code = stripComments(readMigration(file));
			const hasPragmaOff = /PRAGMA\s+foreign_keys\s*=\s*OFF/i.test(code);
			if (!hasPragmaOff) {
				return;
			}
			const hasTransactionFalse = /\btransaction\s*=\s*false\b/.test(code);
			if (!hasTransactionFalse) {
				throw new Error(
					`${file} ejecuta PRAGMA foreign_keys = OFF pero no declara ` +
						`\`transaction = false\`. El PRAGMA es ignorado silenciosamente ` +
						`dentro de una transacción multi-sentencia (SQLite docs). ` +
						`Ver .ruler/skills/sqlite-migrations/SKILL.md`,
				);
			}
		},
	);

	// Documentation regression check: the migration that caused the original
	// bug is preserved verbatim (we don't edit it because it already ran in
	// every environment where it was going to run; rewriting it changes
	// nothing). What we want to guarantee is that nobody adds another file
	// like it without the safe pattern.
	it('grandfather check — AddPublicRegistrationToCommunity is acknowledged', () => {
		const file = '20260507120000_AddPublicRegistrationToCommunity.ts';
		if (!files.includes(file)) {
			return;
		}
		const code = readMigration(file);
		expect(/CREATE\s+TABLE\s+"community_new"/i.test(code)).toBe(true);
	});
});
