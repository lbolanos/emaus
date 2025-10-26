import { importParticipants } from '../../services/participantService';
import { TestDataFactory } from './testDataFactory';
import { ExcelParticipantRow } from '../fixtures/excelFixtures';
import { User, Retreat, Participant } from '../../entities';

/**
 * Utility functions for Excel import testing
 */
export class ExcelImportTestUtils {
	/**
	 * Execute a complete import process with test environment setup
	 */
	static async executeImport(
		participantData: ExcelParticipantRow[],
		userOverrides: Partial<User> = {},
		retreatOverrides: Partial<Retreat> = {},
	): Promise<{
		result: any;
		user: User;
		retreat: Retreat;
		participantsBefore: Participant[];
		participantsAfter: Participant[];
	}> {
		// Setup test environment
		const { user, retreat } = await TestDataFactory.createCompleteTestEnvironment(
			userOverrides,
			retreatOverrides,
		);

		// Get participants before import
		const participantsBefore = await this.getParticipantsForRetreat(retreat.id);

		// Execute import
		const result = await importParticipants(retreat.id, participantData, user);

		// Get participants after import
		const participantsAfter = await this.getParticipantsForRetreat(retreat.id);

		return {
			result,
			user,
			retreat,
			participantsBefore,
			participantsAfter,
		};
	}

	/**
	 * Get all participants for a retreat with relations
	 */
	static async getParticipantsForRetreat(retreatId: string): Promise<Participant[]> {
		const participantRepository = TestDataFactory['testDataSource'].getRepository(Participant);
		return await participantRepository.find({
			where: { retreatId },
			relations: ['retreat', 'tableMesa', 'retreatBed', 'payments'],
		});
	}

	/**
	 * Validate import result structure
	 */
	static validateImportResult(result: any): {
		isValid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];
		const requiredFields = [
			'importedCount',
			'updatedCount',
			'skippedCount',
			'tablesCreated',
			'bedsCreated',
			'paymentsCreated',
		];

		for (const field of requiredFields) {
			if (!(field in result) || typeof result[field] !== 'number') {
				errors.push(`Missing or invalid field: ${field}`);
			}
		}

		// Validate that counts are non-negative
		for (const field of requiredFields) {
			if (result[field] < 0) {
				errors.push(`Field ${field} cannot be negative: ${result[field]}`);
			}
		}

		return {
			isValid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Verify participant data was imported correctly
	 */
	static async verifyParticipantImport(
		expectedData: ExcelParticipantRow[],
		actualParticipants: Participant[],
		retreatId: string,
	): Promise<{
		success: boolean;
		errors: string[];
		matchedParticipants: Participant[];
		unmatchedExpected: ExcelParticipantRow[];
	}> {
		const errors: string[] = [];
		const matchedParticipants: Participant[] = [];
		const unmatchedExpected: ExcelParticipantRow[] = [];

		for (const expected of expectedData) {
			if (!expected.email) {
				unmatchedExpected.push(expected);
				continue;
			}

			const actual = actualParticipants.find((p) => p.email === expected.email);

			if (!actual) {
				errors.push(`Participant with email ${expected.email} not found after import`);
				unmatchedExpected.push(expected);
				continue;
			}

			matchedParticipants.push(actual);

			// Verify basic fields
			if (expected.nombre && actual.firstName !== expected.nombre.trim()) {
				errors.push(
					`FirstName mismatch for ${expected.email}: expected "${expected.nombre}", got "${actual.firstName}"`,
				);
			}

			if (expected.apellidos && actual.lastName !== expected.apellidos.trim()) {
				errors.push(
					`LastName mismatch for ${expected.email}: expected "${expected.apellidos}", got "${actual.lastName}"`,
				);
			}

			if (expected.email && actual.email !== expected.email.trim()) {
				errors.push(
					`Email mismatch for ${expected.email}: expected "${expected.email}", got "${actual.email}"`,
				);
			}

			// Verify retreat assignment
			if (actual.retreatId !== retreatId) {
				errors.push(
					`RetreatId mismatch for ${expected.email}: expected "${retreatId}", got "${actual.retreatId}"`,
				);
			}

			// Verify birth date if provided
			if (expected.anio && expected.mes && expected.dia) {
				const expectedDate = new Date(
					parseInt(expected.anio),
					parseInt(expected.mes) - 1,
					parseInt(expected.dia),
				);
				if (actual.birthDate && actual.birthDate.toDateString() !== expectedDate.toDateString()) {
					errors.push(
						`BirthDate mismatch for ${expected.email}: expected "${expectedDate.toDateString()}", got "${actual.birthDate.toDateString()}"`,
					);
				}
			}

			// Verify type mapping
			const expectedType = this.mapTipoUsuarioToType(expected.tipousuario);
			if (expectedType && actual.type !== expectedType) {
				errors.push(
					`Type mismatch for ${expected.email}: expected "${expectedType}", got "${actual.type}"`,
				);
			}

			// Verify cancellation status
			const expectedCancelled = expected.cancelado?.trim() === 'S';
			if (actual.isCancelled !== expectedCancelled) {
				errors.push(
					`Cancellation status mismatch for ${expected.email}: expected "${expectedCancelled}", got "${actual.isCancelled}"`,
				);
			}
		}

		return {
			success: errors.length === 0,
			errors,
			matchedParticipants,
			unmatchedExpected,
		};
	}

	/**
	 * Map tipousuario from Excel to participant type
	 */
	static mapTipoUsuarioToType(tipousuario?: string): string | null {
		if (!tipousuario) return null;

		const userType = tipousuario.trim();
		switch (userType) {
			case '3':
				return 'walker';
			case '4':
				return 'waiting';
			case '5':
				return 'partial_server';
			case '0':
			case '1':
			case '2':
			default:
				return 'server';
		}
	}

	/**
	 * Verify table assignments
	 */
	static async verifyTableAssignments(
		participants: Participant[],
		expectedAssignments: { email: string; tableName: string }[],
	): Promise<{
		success: boolean;
		errors: string[];
	}> {
		const errors: string[] = [];

		for (const expected of expectedAssignments) {
			const participant = participants.find((p) => p.email === expected.email);

			if (!participant) {
				errors.push(`Participant ${expected.email} not found for table assignment verification`);
				continue;
			}

			if (!participant.tableMesa) {
				errors.push(
					`Participant ${expected.email} has no table assigned, expected "${expected.tableName}"`,
				);
				continue;
			}

			if (participant.tableMesa.name !== expected.tableName) {
				errors.push(
					`Table assignment mismatch for ${expected.email}: expected "${expected.tableName}", got "${participant.tableMesa.name}"`,
				);
			}
		}

		return {
			success: errors.length === 0,
			errors,
		};
	}

	/**
	 * Verify bed assignments
	 */
	static async verifyBedAssignments(
		participants: Participant[],
		expectedAssignments: { email: string; roomNumber: string }[],
	): Promise<{
		success: boolean;
		errors: string[];
	}> {
		const errors: string[] = [];

		for (const expected of expectedAssignments) {
			const participant = participants.find((p) => p.email === expected.email);

			if (!participant) {
				errors.push(`Participant ${expected.email} not found for bed assignment verification`);
				continue;
			}

			if (!participant.retreatBed) {
				errors.push(
					`Participant ${expected.email} has no bed assigned, expected room "${expected.roomNumber}"`,
				);
				continue;
			}

			if (participant.retreatBed.roomNumber !== expected.roomNumber) {
				errors.push(
					`Bed assignment mismatch for ${expected.email}: expected room "${expected.roomNumber}", got "${participant.retreatBed.roomNumber}"`,
				);
			}
		}

		return {
			success: errors.length === 0,
			errors,
		};
	}

	/**
	 * Verify family color coding
	 */
	static verifyFamilyColorCoding(
		participants: Participant[],
		expectedGroups: { emails: string; shouldHaveSameColor: boolean }[],
	): {
		success: boolean;
		errors: string[];
	} {
		const errors: string[] = [];

		for (const group of expectedGroups) {
			const groupParticipants = participants.filter((p) => group.emails.includes(p.email));

			if (groupParticipants.length < 2) {
				continue; // Groups with less than 2 people don't need color coding
			}

			const colors = groupParticipants.map((p) => p.family_friend_color).filter(Boolean);

			if (group.shouldHaveSameColor && colors.length > 0) {
				// All participants in the group should have the same color
				const uniqueColors = [...new Set(colors)];
				if (uniqueColors.length > 1) {
					errors.push(
						`Group [${group.emails.join(', ')}] should have same color but has different colors: ${uniqueColors.join(', ')}`,
					);
				}
			}
		}

		return {
			success: errors.length === 0,
			errors,
		};
	}

	/**
	 * Verify leadership assignments
	 */
	static async verifyLeadershipAssignments(
		participants: Participant[],
		expectedLeadership: {
			email: string;
			expectedRole?: 'lider' | 'colider1' | 'colider2';
			tableName: string;
		}[],
	): Promise<{
		success: boolean;
		errors: string[];
	}> {
		const errors: string[] = [];

		// Get all tables to check leadership assignments
		const tableRepository = TestDataFactory['testDataSource'].getRepository('TableMesa');
		const tables = await tableRepository.find({
			where: { retreatId: participants[0]?.retreatId },
			relations: ['lider', 'colider1', 'colider2'],
		});

		for (const expected of expectedLeadership) {
			const participant = participants.find((p) => p.email === expected.email);

			if (!participant) {
				errors.push(
					`Participant ${expected.email} not found for leadership assignment verification`,
				);
				continue;
			}

			// Find the table where this participant should have leadership
			const table = tables.find((t) => t.name === expected.tableName);

			if (!table) {
				errors.push(
					`Table "${expected.tableName}" not found for leadership assignment verification`,
				);
				continue;
			}

			const actualRole = this.getParticipantLeadershipRole(participant, table);

			if (expected.expectedRole && actualRole !== expected.expectedRole) {
				errors.push(
					`Leadership role mismatch for ${expected.email} in table "${expected.tableName}": expected "${expected.expectedRole}", got "${actualRole}"`,
				);
			}

			if (!expected.expectedRole && actualRole) {
				errors.push(
					`Participant ${expected.email} has leadership role "${actualRole}" but none expected`,
				);
			}
		}

		return {
			success: errors.length === 0,
			errors,
		};
	}

	/**
	 * Get the leadership role of a participant in a table
	 */
	private static getParticipantLeadershipRole(
		participant: Participant,
		table: any,
	): 'lider' | 'colider1' | 'colider2' | null {
		if (table.lider?.id === participant.id) return 'lider';
		if (table.colider1?.id === participant.id) return 'colider1';
		if (table.colider2?.id === participant.id) return 'colider2';
		return null;
	}

	/**
	 * Generate test report
	 */
	static generateTestReport(
		testResults: {
			testName: string;
			success: boolean;
			errors: string[];
			duration: number;
		}[],
	): string {
		const totalTests = testResults.length;
		const passedTests = testResults.filter((r) => r.success).length;
		const failedTests = totalTests - passedTests;
		const totalDuration = testResults.reduce((sum, r) => sum + r.duration, 0);

		let report = `\n🧪 Excel Import Test Report\n`;
		report += `${'='.repeat(50)}\n`;
		report += `Total Tests: ${totalTests}\n`;
		report += `Passed: ${passedTests} ✅\n`;
		report += `Failed: ${failedTests} ❌\n`;
		report += `Duration: ${totalDuration}ms\n\n`;

		if (failedTests > 0) {
			report += `❌ Failed Tests:\n`;
			report += `${'-'.repeat(30)}\n`;

			testResults
				.filter((r) => !r.success)
				.forEach((result) => {
					report += `\n📋 ${result.testName}\n`;
					result.errors.forEach((error) => {
						report += `   • ${error}\n`;
					});
				});
		}

		report += `\n✅ Passed Tests:\n`;
		report += `${'-'.repeat(30)}\n`;

		testResults
			.filter((r) => r.success)
			.forEach((result) => {
				report += `✓ ${result.testName} (${result.duration}ms)\n`;
			});

		return report;
	}
}
