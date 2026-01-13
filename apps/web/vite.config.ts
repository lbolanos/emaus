import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	// Load environment variables for current mode
	const env = loadEnv(mode, process.cwd(), '');

	// Determine which environment config file to use
	const envFile =
		mode === 'development'
			? '.env.development'
			: mode === 'staging'
				? '.env.staging'
				: '.env.production';

	console.log(`[VITE] Loading environment from: ${envFile}`);
	console.log(`[VITE] Environment variables:`, env);

	return {
		plugins: [
			vue({
				template: {
					compilerOptions: {
						// treat all tags with a 'gmp-' prefix as custom elements
						isCustomElement: (tag) => tag.startsWith('gmp-'),
					},
				},
			}),
			// Only generate DTS in development mode to save memory
			...(mode === 'development'
				? [
						dts({
							tsconfigPath: './tsconfig.json',
							outDir: 'dist/types',
							strictOutput: true,
						}),
					]
				: []),
		],
		resolve: {
			alias: {
				'@': path.resolve(__dirname, './src'),
				'vue-i18n': 'vue-i18n/dist/vue-i18n.runtime.esm-bundler.js',
			},
		},
		server: {
			proxy: {
				'/api': {
					target: 'http://localhost:3001',
					changeOrigin: true,
					secure: false,
				},
			},
		},
		build: {
			outDir: 'dist',
			emptyOutDir: true,
			sourcemap: mode === 'development',
			minify: mode === 'production' ? 'terser' : false,
			target: 'es2015',
			chunkSizeWarningLimit: 1000,
			// Disable manual chunks to avoid memory issues with chunk splitting
			// rollupOptions: {
			// 	output: {
			// 		manualChunks: undefined,
			// 	},
			// },
		},
	};
});
