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
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'src/test/',
				'src/**/__tests__.bak/**',
				'**/*.d.ts',
				'**/*.config.*',
				'src/main.ts',
				'src/assets/**',
			],
			thresholds: {
				global: {
					branches: 70,
					functions: 70,
					lines: 70,
					statements: 70,
				},
			},
		},
		testTimeout: 10000,
		hookTimeout: 10000,
	},
	resolve: {
		alias: {
			'@': resolve(__dirname, './src'),
			'@repo': resolve(__dirname, '../'),
			'@repo/ui': resolve(__dirname, '../packages/ui'),
			'@repo/types': resolve(__dirname, '../packages/types'),
			'@repo/utils': resolve(__dirname, '../packages/utils'),
		},
	},
	define: {
		'process.env': process.env,
	},
});
