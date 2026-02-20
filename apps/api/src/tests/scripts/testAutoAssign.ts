/**
 * Test script: Run autoAssignBedsForRetreat against real database
 * and verify scoring-based assignments are correct.
 *
 * Usage: npx tsx src/tests/scripts/testAutoAssign.ts
 */
import 'reflect-metadata';
import { AppDataSource } from '../../data-source';
import { autoAssignBedsForRetreat } from '../../services/participantService';

const RETREAT_ID = '8cd14a47-6934-4d18-81e9-6e6b4e8b5e9e';

async function main() {
	console.log('Initializing database connection...');
	await AppDataSource.initialize();
	console.log('Database connected.\n');

	// Run auto-assign
	console.log('Running autoAssignBedsForRetreat...');
	const result = await autoAssignBedsForRetreat(RETREAT_ID);
	console.log(`Result: ${result.assigned} assigned, ${result.skipped} skipped\n`);

	// Query the results
	const assignments = await AppDataSource.query(`
		SELECT
			p.firstName || ' ' || p.lastName as name,
			p.type,
			CAST((strftime('%Y', 'now') - strftime('%Y', p.birthDate)) AS INTEGER) as age,
			p.snores,
			rb.type as bed_type,
			rb.roomNumber,
			rb.floor
		FROM retreat_bed rb
		JOIN participants p ON rb.participantId = p.id
		WHERE rb.retreatId = ?
		ORDER BY p.type, age ASC
	`, [RETREAT_ID]);

	console.log('=== ASSIGNMENT RESULTS ===\n');
	console.log('Name'.padEnd(45) + 'Type'.padEnd(10) + 'Age'.padEnd(5) + 'Snores'.padEnd(8) + 'Bed Type'.padEnd(16) + 'Room'.padEnd(6) + 'Floor');
	console.log('-'.repeat(95));

	let issues = 0;
	for (const a of assignments) {
		const flag = (a.age >= 65 && a.bed_type === 'litera_arriba') ? ' ⚠️ OLD+TOP' : '';
		console.log(
			`${a.name.padEnd(45)}${a.type.padEnd(10)}${String(a.age).padEnd(5)}${(a.snores ? 'Yes' : 'No').padEnd(8)}${a.bed_type.padEnd(16)}${a.roomNumber.padEnd(6)}${a.floor}${flag}`
		);
		if (a.age >= 65 && a.bed_type === 'litera_arriba') issues++;
	}

	console.log('\n=== VERIFICATION ===\n');

	// Check: Older participants should NOT be on top bunks (unless no other option)
	const oldOnTop = assignments.filter((a: any) => a.age >= 60 && a.bed_type === 'litera_arriba');
	const youngOnBottom = assignments.filter((a: any) => a.age <= 35 && a.bed_type === 'litera_abajo');
	const totalOnTop = assignments.filter((a: any) => a.bed_type === 'litera_arriba');
	const totalOnBottom = assignments.filter((a: any) => a.bed_type === 'litera_abajo');

	console.log(`Total assigned: ${assignments.length}`);
	console.log(`On top bunks (litera_arriba): ${totalOnTop.length}`);
	console.log(`On bottom bunks (litera_abajo): ${totalOnBottom.length}`);
	console.log(`Age 60+ on top bunks: ${oldOnTop.length} ${oldOnTop.length === 0 ? '✅' : '⚠️'}`);
	console.log(`Age ≤35 on bottom bunks: ${youngOnBottom.length}`);

	// Check snoring grouping
	const roomSnoreStatus: Record<string, Set<string>> = {};
	for (const a of assignments) {
		if (!roomSnoreStatus[a.roomNumber]) roomSnoreStatus[a.roomNumber] = new Set();
		roomSnoreStatus[a.roomNumber].add(a.snores ? 'snorer' : 'non-snorer');
	}
	const mixedRooms = Object.entries(roomSnoreStatus).filter(([_, statuses]) => statuses.size > 1);
	console.log(`\nRooms with mixed snoring: ${mixedRooms.length} out of ${Object.keys(roomSnoreStatus).length}`);
	if (mixedRooms.length > 0) {
		for (const [room, statuses] of mixedRooms) {
			const occupants = assignments.filter((a: any) => a.roomNumber === room);
			console.log(`  Room ${room}: ${occupants.map((o: any) => `${o.name.split(' ')[0]}(${o.snores ? 'S' : 'N'})`).join(', ')}`);
		}
	}

	// Summary of age distribution by bed type
	console.log('\n=== AGE DISTRIBUTION BY BED TYPE ===\n');
	const bedTypes = ['litera_arriba', 'litera_abajo', 'normal', 'colchon'];
	for (const bt of bedTypes) {
		const onType = assignments.filter((a: any) => a.bed_type === bt);
		if (onType.length === 0) continue;
		const ages = onType.map((a: any) => a.age);
		const avgAge = (ages.reduce((s: number, a: number) => s + a, 0) / ages.length).toFixed(1);
		const minAge = Math.min(...ages);
		const maxAge = Math.max(...ages);
		console.log(`${bt.padEnd(16)}: ${onType.length} occupants, avg age ${avgAge}, range ${minAge}-${maxAge}`);
	}

	// Specific check: JOSÉ DE JESÚS SÁNCHEZ ORTIZ (age 81)
	const sanchez = assignments.find((a: any) => a.name.includes('SÁNCHEZ'));
	if (sanchez) {
		console.log(`\n=== SPECIFIC CHECK: JOSÉ DE JESÚS SÁNCHEZ ORTIZ ===`);
		console.log(`Age: ${sanchez.age}, Bed: ${sanchez.bed_type}, Room: ${sanchez.roomNumber}, Floor: ${sanchez.floor}`);
		console.log(sanchez.bed_type === 'litera_arriba' ? '⚠️ STILL ON TOP BUNK' : '✅ NOT on top bunk (scoring system working)');
	}

	await AppDataSource.destroy();
	console.log('\nDone.');
}

main().catch(console.error);
