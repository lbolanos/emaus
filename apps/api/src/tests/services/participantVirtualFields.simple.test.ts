// Regression guard for a recurring class of runtime-only bug (2026-08-24):
//
//   Several Participant properties are VIRTUAL: they are declared on the entity
//   without @Column because their source of truth lives in retreat_participants
//   (per-retreat data). They get populated at query time. Writing them through a
//   query builder targeting Participant compiles, passes lint and passes tsc,
//   but throws at runtime:
//
//     Property "tableId" was not found in "Participant". Make sure your query
//     is correct.
//
//   Real incident: the Excel import created all 35 participants and then blew up
//   in the bed/table assignment phase, which did
//   `.update(Participant).set({ tableId })`. The API answered 400 and the whole
//   assignment transaction rolled back, so the retreat was left with the
//   participants imported but no beds or tables assigned.
//
// Rule: writes to a virtual field must target RetreatParticipant, never
// Participant. This test scans the API source for the broken pattern.

import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

// Properties declared on Participant WITHOUT @Column — their column lives on
// retreat_participants. Keep in sync with participant.entity.ts.
const VIRTUAL_FIELDS = [
	'id_on_retreat',
	'type',
	'tableId',
	'tableMesa',
	'family_friend_color',
	'isScholarship',
	'scholarshipAmount',
	'isCancelled',
	'bagMade',
	'attendanceConfirmation',
	'mealCount',
	'takesFridayMeal',
];

const API_SRC = path.resolve(__dirname, '../..');
const ENTITY_FILE = path.join(API_SRC, 'entities/participant.entity.ts');

const collectSourceFiles = (dir: string, acc: string[] = []): string[] => {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === 'node_modules' || entry.name === 'tests') continue;
			collectSourceFiles(full, acc);
		} else if (entry.name.endsWith('.ts')) {
			acc.push(full);
		}
	}
	return acc;
};

describe('Participant virtual fields must not be written through Participant', () => {
	it('keeps the documented virtual fields free of @Column on the entity', () => {
		const source = fs.readFileSync(ENTITY_FILE, 'utf8');
		const lines = source.split('\n');
		const stillVirtual: string[] = [];

		for (const field of VIRTUAL_FIELDS) {
			const declIndex = lines.findIndex((line) =>
				new RegExp(`^\\s*${field}[?!]?\\s*:`).test(line),
			);
			if (declIndex === -1) continue; // field renamed or removed — other tests cover that
			// Walk back over decorators/comments: a @Column right above means it
			// became a real column and can be dropped from VIRTUAL_FIELDS.
			let cursor = declIndex - 1;
			while (cursor >= 0 && lines[cursor].trim().startsWith('@')) {
				if (lines[cursor].includes('@Column')) break;
				cursor--;
			}
			const hasColumn = cursor >= 0 && lines[cursor].includes('@Column');
			if (!hasColumn) stillVirtual.push(field);
		}

		expect(stillVirtual.length).toBeGreaterThan(0);
	});

	it('has no .update(Participant).set({ <virtual field> }) anywhere in the API', () => {
		const offenders: string[] = [];

		for (const file of collectSourceFiles(API_SRC)) {
			const source = fs.readFileSync(file, 'utf8');
			// Normalize whitespace so the chained builder fits one searchable string.
			const flat = source.replace(/\s+/g, ' ');
			const pattern = /\.update\(\s*Participant\s*\)\s*\.set\(\s*\{([^}]*)\}/g;

			let match: RegExpExecArray | null;
			while ((match = pattern.exec(flat)) !== null) {
				const assigned = match[1];
				for (const field of VIRTUAL_FIELDS) {
					// Matches both `{ tableId }` (shorthand) and `{ tableId: x }`.
					if (new RegExp(`(^|[\\s,{])${field}\\s*(:|,|$)`).test(assigned.trim())) {
						offenders.push(
							`${path.relative(API_SRC, file)} → .update(Participant).set({ ${field} … }) — write it to RetreatParticipant instead`,
						);
					}
				}
			}
		}

		expect(offenders).toEqual([]);
	});
});
