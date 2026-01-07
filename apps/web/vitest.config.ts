import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';

export default defineConfig({
	plugins: [vue()],
	test: {
		globals: true,
		environment: 'happy-dom',
		setupFiles: ['./src/test/setup.ts'],
		include: [
			'src/**/__tests__/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
			'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}',
		],
		exclude: ['node_modules', 'dist', '.idea', '.git', '.cache', 'src/**/__tests__.bak/**'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html', 'lcov'],
			exclude: [
				'node_modules/',
				'src/test/',
				'src/**/__tests__.bak/**',
				'**/*.d.ts',
				'**/*.config.*',
				'src/main.ts',
				'src/assets/**',
				'src/stubs/**',
				'src/views/**', // Views are typically integration tested
				'src/layouts/**', // Layouts are typically integration tested
				'src/router/**',
				'src/i18n.ts',
			],
			// All coverage reports will be in /coverage
			reportsDirectory: './coverage',
			// Per-file thresholds
			thresholds: {
				lines: 60,
				functions: 60,
				branches: 60,
				statements: 60,
				// Auto-update thresholds based on current coverage
				perFile: false,
			},
			// Additional options
			all: true,
			include: ['src/**/*.vue', 'src/**/*.ts', 'src/**/*.tsx'],
			// Exclude known patterns
			excludeAfterRemap: true,
		},
		testTimeout: 10000,
		hookTimeout: 10000,
		// Inline workspace packages for testing
		server: {
			deps: {
				inline: [/^@repo/],
			},
		},
	},
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
		},
	},
	define: {
		'process.env': process.env,
	},
});
