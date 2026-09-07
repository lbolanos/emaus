import { defineConfig } from 'vite';
import { VitePluginNode } from 'vite-plugin-node';

export default defineConfig({
	server: {
		port: 3084,
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
				// Módulo nativo (.node): si Rollup lo empaqueta, el bundle revienta AL CARGAR
				// y el API queda en crash-loop — el deploy muere en el healthcheck con el dist
				// viejo ya sobrescrito. Ni los tests ni tsc lo detectan.
				'better-sqlite3',
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
				'@aws-sdk/s3-request-presigner',
				'sharp',
				'sanitize-html',
				'winston',
				'winston-daily-rotate-file',
			],
		},
	},
});
