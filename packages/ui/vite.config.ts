import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { glob } from 'glob';
import dts from 'vite-plugin-dts';

export default defineConfig({
	plugins: [
		vue(),
		dts({
			tsconfigPath: './tsconfig.json',
			outDir: 'dist',
			entryRoot: './src',
			strictOutput: false,
			include: ['src/index.ts'],
			exclude: ['**/*.spec.ts', '**/*.test.ts', '**/*.stories.ts', 'node_modules/**'],
			copyDtsFiles: true,
			afterBuild: false,
			rollupTypes: true,
		}),
	],
	build: {
		lib: {
			entry: path.resolve(__dirname, 'src/index.ts'),
			name: '@repo/ui',
			fileName: (format) => `index.${format}.js`,
		},
		rollupOptions: {
			external: ['vue'],
			output: {
				globals: {
					vue: 'Vue',
				},
			},
		},
	},
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
		},
	},
});
