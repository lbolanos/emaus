import { defineConfig } from 'drizzle-kit';

export default defineConfig({
	schema: './src/drizzle/schema/index.ts',
	out: './src/drizzle/migrations',
	dialect: 'sqlite',
	dbCredentials: {
		url: process.env.DB_DATABASE || 'database.sqlite',
	},
});
