import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path, { dirname } from 'node:path';

const execAsync = promisify(exec);

interface TestResult {
	name: string;
	passed: number;
	failed: number;
	skipped: number;
	duration: string;
	success: boolean;
}

async function runExcelImportTests() {
	console.log('🧪 Running Excel Import Test Suite...\n');

	try {
		// Install test dependencies if needed
		console.log('📦 Installing test dependencies...');
		await execAsync(
			'pnpm add --filter api @types/jest jest ts-jest @types/supertest supertest jsonwebtoken @types/jsonwebtoken',
		);

		// Create specialized test configuration for Excel import tests
		console.log('⚙️ Setting up Excel import test configuration...');
		const testConfig = {
			testEnvironment: 'node',
			transform: {
				'^.+\\.ts$': 'ts-jest',
			},
			testMatch: [
				'**/tests/services/participantService.test.ts',
				'**/tests/services/fieldMapping.test.ts',
				'**/tests/controllers/participantController.test.ts',
			],
			moduleFileExtensions: ['ts', 'js', 'json', 'node'],
			collectCoverageFrom: [
				'src/services/participantService.ts',
				'src/controllers/participantController.ts',
			],
			setupFilesAfterEnv: ['<rootDir>/src/tests/test-setup.ts'],
			testTimeout: 60000, // 60 seconds for complex import operations
			verbose: true,
			collectCoverage: true,
			coverageReporters: ['text', 'lcov', 'html'],
			coverageDirectory: '<rootDir>/coverage/excel-import',
		};

		// Write jest config for Excel import tests
		const fs = await import('fs');
		const configPath = path.join(
			dirname(fileURLToPath(import.meta.url)),
			'jest.excel-import.config.json',
		);
		fs.default.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));

		// Set environment variables for testing
		process.env.NODE_ENV = 'test';
		process.env.DB_TYPE = 'sqlite';
		process.env.DB_DATABASE = ':memory:';
		process.env.JWT_SECRET = 'test-secret-key-for-excel-import-tests';

		console.log('🚀 Running Excel import test suites...\n');

		// Run the tests with specific focus on Excel import functionality
		const { stdout, stderr } = await execAsync(
			`npx jest --config="${configPath}" --verbose --detectOpenHandles --forceExit`,
			{
				cwd: path.resolve(__dirname, '../../..'),
				env: { ...process.env, NODE_ENV: 'test' },
				timeout: 300000, // 5 minutes timeout
			},
		);

		console.log(stdout);
		if (stderr) {
			console.error('⚠️ Test stderr:', stderr);
		}

		// Parse and display results
		const testResults = parseTestResults(stdout);
		displayTestSummary(testResults);

		// Generate detailed report
		await generateDetailedReport(testResults, stdout);

		if (testResults.failed > 0) {
			console.log('\n❌ Some Excel import tests failed. Please check the output above.');
			process.exit(1);
		} else {
			console.log('\n🎉 All Excel import tests passed!');

			// Display coverage information if available
			if (stdout.includes('File')) {
				console.log('\n📊 Coverage Report Generated:');
				console.log('   - Text report: Check console output above');
				console.log('   - HTML report: coverage/excel-import/lcov-report/index.html');
				console.log('   - LCOV report: coverage/excel-import/lcov.info');
			}
		}
	} catch (error: any) {
		console.error('❌ Error running Excel import tests:', error.message);

		if (error.stdout) {
			console.log('\n📋 Test Output:');
			console.log(error.stdout);
		}

		if (error.stderr) {
			console.log('\n⚠️ Error Details:');
			console.log(error.stderr);
		}

		process.exit(1);
	}
}

function parseTestResults(output: string): TestResult[] {
	const lines = output.split('\n');
	const results: TestResult[] = [];
	let currentTest: Partial<TestResult> = {};
	let inTestSuite = false;

	for (const line of lines) {
		// Detect test suite start
		if (line.includes('PASS') || line.includes('FAIL')) {
			if (currentTest.name) {
				results.push(currentTest as TestResult);
			}

			const match = line.match(/(PASS|FAIL) (.*?)(?:\s+\(\d+ms\))?$/);
			if (match) {
				currentTest = {
					name: match[2].trim(),
					passed: 0,
					failed: 0,
					skipped: 0,
					duration: '',
					success: match[1] === 'PASS',
				};
				inTestSuite = true;
			}
		}

		// Extract test counts
		if (line.includes('Test Suites:')) {
			const suitesMatch = line.match(/Test Suites:\s+(\d+)\s+passed,\s+(\d+)\s+failed/);
			if (suitesMatch && currentTest) {
				currentTest.passed = parseInt(suitesMatch[1]);
				currentTest.failed = parseInt(suitesMatch[2]);
			}
		}

		if (line.includes('Tests:')) {
			const testsMatch = line.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/);
			if (testsMatch && currentTest) {
				currentTest.passed = parseInt(testsMatch[1]);
				currentTest.failed = parseInt(testsMatch[2]);
			}
		}

		if (line.includes('Skipped:')) {
			const skippedMatch = line.match(/Skipped:\s+(\d+)/);
			if (skippedMatch && currentTest) {
				currentTest.skipped = parseInt(skippedMatch[1]);
			}
		}

		if (line.includes('Time:')) {
			const timeMatch = line.match(/Time:\s+(.*)/);
			if (timeMatch && currentTest) {
				currentTest.duration = timeMatch[1].trim();
			}
		}
	}

	// Add the last test result
	if (currentTest.name) {
		results.push(currentTest as TestResult);
	}

	return results;
}

function displayTestSummary(results: TestResult[]) {
	const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
	const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
	const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
	const totalTests = totalPassed + totalFailed + totalSkipped;

	console.log('\n' + '='.repeat(60));
	console.log('📊 Excel Import Test Results Summary');
	console.log('='.repeat(60));
	console.log(`📋 Total Test Suites: ${results.length}`);
	console.log(`✅ Passed: ${totalPassed}`);
	console.log(`❌ Failed: ${totalFailed}`);
	console.log(`⏭️  Skipped: ${totalSkipped}`);
	console.log(`📈 Total Tests: ${totalTests}`);

	if (totalTests > 0) {
		const successRate = ((totalPassed / totalTests) * 100).toFixed(1);
		console.log(`📊 Success Rate: ${successRate}%`);
	}

	console.log('\n📋 Test Suite Breakdown:');
	results.forEach((result, index) => {
		const status = result.success ? '✅' : '❌';
		const percentage =
			result.passed + result.failed > 0
				? ((result.passed / (result.passed + result.failed)) * 100).toFixed(1)
				: '0';
		console.log(
			`${index + 1}. ${status} ${result.name} (${result.passed}/${result.passed + result.failed} - ${percentage}%)`,
		);
	});
}

async function generateDetailedReport(results: TestResult[], output: string): Promise<void> {
	const fs = await import('fs');
	const reportPath = path.join(
		dirname(fileURLToPath(import.meta.url)),
		'..',
		'..',
		'excel-import-test-report.md',
	);

	let report = `# Excel Import Test Report\n\n`;
	report += `**Generated on:** ${new Date().toISOString()}\n\n`;

	// Summary
	const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
	const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
	const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

	report += `## Summary\n\n`;
	report += `- **Total Test Suites:** ${results.length}\n`;
	report += `- **Passed:** ${totalPassed}\n`;
	report += `- **Failed:** ${totalFailed}\n`;
	report += `- **Skipped:** ${totalSkipped}\n`;
	report += `- **Success Rate:** ${totalPassed + totalFailed > 0 ? ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1) : 0}%\n\n`;

	// Test Results
	report += `## Test Results\n\n`;
	results.forEach((result, index) => {
		report += `### ${index + 1}. ${result.name}\n\n`;
		report += `- **Status:** ${result.success ? '✅ PASSED' : '❌ FAILED'}\n`;
		report += `- **Tests Passed:** ${result.passed}\n`;
		report += `- **Tests Failed:** ${result.failed}\n`;
		report += `- **Tests Skipped:** ${result.skipped}\n`;
		report += `- **Duration:** ${result.duration}\n`;
		report += `- **Success Rate:** ${result.passed + result.failed > 0 ? ((result.passed / (result.passed + result.failed)) * 100).toFixed(1) : 0}%\n\n`;
	});

	// Raw Output
	report += `## Raw Test Output\n\n`;
	report += '```\n';
	report += output;
	report += '\n```\n';

	// Write report
	fs.default.writeFileSync(reportPath, report);
	console.log(`\n📄 Detailed report generated: ${reportPath}`);
}

// CLI interface for different test modes
async function main() {
	const args = process.argv.slice(2);
	const mode = args[0] || 'all';

	switch (mode) {
		case 'services':
			console.log('🔧 Running service tests only...');
			await runSpecificTests(['**/tests/services/*.test.ts']);
			break;

		case 'controllers':
			console.log('🌐 Running controller tests only...');
			await runSpecificTests(['**/tests/controllers/*.test.ts']);
			break;

		case 'field-mapping':
			console.log('🔄 Running field mapping tests only...');
			await runSpecificTests(['**/tests/services/fieldMapping.test.ts']);
			break;

		case 'integration':
			console.log('🔗 Running integration tests only...');
			await runSpecificTests(['**/tests/services/participantService.test.ts']);
			break;

		case 'coverage':
			console.log('📊 Running tests with coverage...');
			await runExcelImportTests();
			break;

		case 'all':
		default:
			await runExcelImportTests();
			break;
	}
}

async function runSpecificTests(testPatterns: string[]) {
	// Implementation for running specific test patterns
	const fs = require('fs');
	const config = {
		testEnvironment: 'node',
		transform: { '^.+\\.ts$': 'ts-jest' },
		testMatch: testPatterns,
		moduleFileExtensions: ['ts', 'js', 'json', 'node'],
		setupFilesAfterEnv: ['<rootDir>/src/tests/test-setup.ts'],
		testTimeout: 60000,
		verbose: true,
	};

	const configPath = path.join(__dirname, 'jest.specific.config.json');
	fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

	try {
		await execAsync(`npx jest --config="${configPath}" --detectOpenHandles --forceExit`, {
			cwd: path.resolve(__dirname, '../../..'),
			env: { ...process.env, NODE_ENV: 'test' },
		});
	} catch (error: any) {
		console.error('Test execution failed:', error.message);
		process.exit(1);
	}
}

if (require.main === module) {
	main();
}

export { runExcelImportTests, runSpecificTests };
