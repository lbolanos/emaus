import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

async function runExcelImportTests() {
	console.log('🧪 Running Excel Import Test Suite...\n');

	try {
		// Install test dependencies if needed
		console.log('📦 Installing test dependencies...');
		await execAsync(
			'pnpm add --filter api @types/jest jest ts-jest @types/supertest supertest jsonwebtoken @types/jsonwebtoken',
			{ stdio: 'pipe' },
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
			testTimeout: 60000,
			verbose: true,
			collectCoverage: true,
			coverageReporters: ['text', 'lcov', 'html'],
			coverageDirectory: '<rootDir>/coverage/excel-import',
		};

		// Write jest config to a temporary file
		const fs = await import('fs');
		const path = await import('path');
		const { fileURLToPath } = await import('node:url');
		const { dirname } = await import('node:path');

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

		// Run the tests
		console.log('🚀 Running test suite...\n');
		const { stdout, stderr } = await execAsync(
			`npx jest --config="${configPath}" --verbose --detectOpenHandles --forceExit`,
			{
				cwd: dirname(dirname(fileURLToPath(import.meta.url))), // Go up two directories to root
				env: { ...process.env, NODE_ENV: 'test' },
				timeout: 300000,
			},
		);

		console.log(stdout);
		if (stderr) {
			console.error('⚠️ Test stderr:', stderr);
		}

		// Extract and display results
		const testResults = parseTestResults(stdout);

		console.log('\n📊 Test Results Summary:');
		console.log(`✅ Passed: ${testResults.passed}`);
		console.log(`❌ Failed: ${testResults.failed}`);
		console.log(`⏭️  Skipped: ${testResults.skipped}`);
		console.log(`⏱️  Duration: ${testResults.duration}`);

		if (testResults.failed > 0) {
			console.log('\n❌ Some tests failed. Please check the output above.');
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

function parseTestResults(output: string): {
	passed: number;
	failed: number;
	skipped: number;
	duration: string;
} {
	const lines = output.split('\n');
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	let duration = '';

	for (const line of lines) {
		if (line.includes('Test Suites:')) {
			const match = line.match(/Test Suites:\s+(\d+)\s+passed,\s+(\d+)\s+failed/);
			if (match) {
				passed = parseInt(match[1]);
				failed = parseInt(match[2]);
			}
		}
		if (line.includes('Tests:')) {
			const match = line.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+failed/);
			if (match) {
				passed = parseInt(match[1]);
				failed = parseInt(match[2]);
			}
		}
		if (line.includes('Skipped:')) {
			const match = line.match(/Skipped:\s+(\d+)/);
			if (match) {
				skipped = parseInt(match[1]);
			}
		}
		if (line.includes('Time:')) {
			duration = line.replace('Time:', '').trim();
		}
	}

	return { passed, failed, skipped, duration };
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
	const fs = await import('fs');
	const path = await import('path');
	const { fileURLToPath } = await import('node:url');
	const { dirname } = await import('node:path');

	const config = {
		testEnvironment: 'node',
		transform: { '^.+\\.ts$': 'ts-jest' },
		testMatch: testPatterns,
		moduleFileExtensions: ['ts', 'js', 'json', 'node'],
		setupFilesAfterEnv: ['<rootDir>/src/tests/test-setup.ts'],
		testTimeout: 60000,
		verbose: true,
	};

	const configPath = path.join(
		dirname(fileURLToPath(import.meta.url)),
		'jest.specific.config.json',
	);
	fs.default.writeFileSync(configPath, JSON.stringify(config, null, 2));

	try {
		await execAsync(`npx jest --config="${configPath}" --detectOpenHandles --forceExit`, {
			cwd: dirname(dirname(fileURLToPath(import.meta.url))),
			env: { ...process.env, NODE_ENV: 'test' },
		});
	} catch (error: any) {
		console.error('Test execution failed:', error.message);
		process.exit(1);
	}
}

if (process.argv[1] === '--run' || process.argv[1] === 'import') {
	runExcelImportTests();
} else if (require.main === module) {
	main();
}

export { runExcelImportTests };
