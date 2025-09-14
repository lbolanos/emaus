import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runTests() {
	console.log('🧪 Running RBAC Integration Tests...\n');

	try {
		// Install test dependencies if needed
		console.log('📦 Installing test dependencies...');
		await execAsync('pnpm add --filter api @types/jest jest ts-jest @types/supertest supertest');

		// Create test configuration
		console.log('⚙️ Setting up test configuration...');
		const testConfig = {
			testEnvironment: 'node',
			transform: {
				'^.+\\.ts$': 'ts-jest',
			},
			testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
			moduleFileExtensions: ['ts', 'js', 'json', 'node'],
			collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/cli/**', '!src/tests/**'],
			setupFilesAfterEnv: ['<rootDir>/src/tests/test-setup.ts'],
			testTimeout: 30000,
		};

		// Write jest config
		const fs = require('fs');
		const path = require('path');
		fs.writeFileSync(path.join(__dirname, 'jest.config.json'), JSON.stringify(testConfig, null, 2));

		// Set environment variables for testing
		process.env.NODE_ENV = 'test';
		process.env.DB_TYPE = 'sqlite';
		process.env.DB_DATABASE = ':memory:';

		// Run the tests
		console.log('🚀 Running test suite...\n');
		const { stdout, stderr } = await execAsync(
			'npx jest --verbose --detectOpenHandles --forceExit',
			{
				cwd: __dirname,
				env: { ...process.env, NODE_ENV: 'test' },
			},
		);

		console.log(stdout);
		if (stderr) {
			console.error(stderr);
		}

		// Extract test results
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
			console.log('\n🎉 All tests passed!');
		}
	} catch (error) {
		console.error('❌ Error running tests:', error.message);
		process.exit(1);
	}
}

function parseTestResults(output: string) {
	const lines = output.split('\n');
	let passed = 0;
	let failed = 0;
	let skipped = 0;
	let duration = '';

	for (const line of lines) {
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

if (require.main === module) {
	runTests();
}

export { runTests };
