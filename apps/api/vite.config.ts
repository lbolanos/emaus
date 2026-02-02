import { defineConfig } from 'vite';
import { VitePluginNode } from 'vite-plugin-node';

export default defineConfig({
	server: {
		port: 3001,
	},
	plugins: [
		...VitePluginNode({
			adapter: 'express',
			appPath: './src/index.ts',
			exportName: 'app',
			tsCompiler: 'esbuild',
		}),
	],
	build: {
		define: {
			'process.env.NODE_ENV': JSON.stringify('production'),
		},
		rollupOptions: {
			external: [
				'connect-typeorm',
				'reflect-metadata',
				'sqlite3',
				'pg',
				'passport',
				'passport-google-oauth20',
				'passport-local',
				'express-session',
				'bcrypt',
				'zod',
				'cors',
				'dotenv',
				'express',
				'express-async-errors',
				'helmet',
				'typeorm',
				'uuid',
				'node-cron',
				'nodemailer',
				'cache-manager',
				'commander',
				'express-rate-limit',
				'node-cache',
				'@aws-sdk/client-s3',
				'sharp',
				'sanitize-html',
			],
		},
	},
});
