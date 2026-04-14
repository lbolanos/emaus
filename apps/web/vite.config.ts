import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import path from 'path';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

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
	// Log only VITE_-prefixed keys (public, safe to expose) — never log full env
	const publicEnv = Object.fromEntries(Object.entries(env).filter(([k]) => k.startsWith('VITE_')));
	console.log(`[VITE] Public environment variables:`, publicEnv);

	// Resolve git hash for version tracking; fallback to base36 timestamp in CI without git
	let gitHash = 'dev';
	try {
		gitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
	} catch {
		gitHash = Date.now().toString(36);
	}

	return {
		define: {
			__APP_VERSION__: JSON.stringify(gitHash),
		},
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
			// Write version.json to dist after all assets are written
			{
				name: 'generate-version-json',
				apply: 'build' as const,
				writeBundle(options) {
					try {
						const outDir = options.dir ?? path.resolve(__dirname, 'dist');
						console.log('[version] writing to', outDir);
						writeFileSync(
							path.join(outDir, 'version.json'),
							JSON.stringify(
								{ version: gitHash, buildAt: new Date().toISOString() },
								null,
								2,
							),
						);
						console.log('[version] version.json written ok');
					} catch (e) {
						console.error('[version] ERROR writing version.json:', e);
					}
				},
			},
		],
		resolve: {
			alias: {
				'@': path.resolve(__dirname, './src'),
				'vue-i18n': 'vue-i18n/dist/vue-i18n.esm-bundler.js',
			},
		},
		server: {
			allowedHosts: ['localhost', '.ngrok.io', '.ngrok-free.app'],
			proxy: {
				'/api': {
					target: 'http://localhost:3001',
					changeOrigin: true,
					secure: false,
					configure: (proxy) => {
						proxy.on('proxyReq', (proxyReq, req) => {
							const host = req.headers.host;
							if (host) {
								proxyReq.setHeader('x-forwarded-host', host);
							}
							// Rewrite origin to localhost so API CORS accepts tunnel/ngrok requests
							proxyReq.setHeader('origin', 'http://localhost:5173');
						});
					},
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
			rollupOptions: {
				output: {
					entryFileNames: 'assets/[name]-[hash].js',
					manualChunks: (id) => {
						if (id.includes('node_modules')) {
							if (id.includes('@tiptap')) return 'vendor-tiptap';
							if (id.includes('chart.js') || id.includes('vue-chartjs')) return 'vendor-charts';
							if (id.includes('lucide-vue-next')) return 'vendor-icons';
							if (id.includes('country-state-city')) return 'vendor-geo';
							return 'vendor';
						}
						// Split shared workspace packages to reduce chunk sizes
						if (id.includes('/packages/ui/')) return 'shared-ui';
						if (id.includes('/packages/types/')) return 'shared-types';
					},
				},
				treeshake: {
					moduleSideEffects: true,
				},
			},
			// Reduce parallel processing to avoid memory spikes
			// commonjsOptions: {
			// 	transformMixedEsModules: true,
			// },
		},
	};
});
