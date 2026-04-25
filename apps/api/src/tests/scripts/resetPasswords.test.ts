import bcrypt from 'bcrypt';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DEFAULT_PASSWORD, resetPasswords } from '../../../scripts/reset-passwords';

function createTempDb(users: Array<{ email: string; password: string }>): Promise<string> {
	return new Promise((resolve, reject) => {
		const dbPath = path.join(os.tmpdir(), `reset-passwords-test-${Date.now()}-${Math.random()}.sqlite`);
		const db = new sqlite3.Database(dbPath);
		db.serialize(() => {
			db.run('CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, password TEXT)');
			const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
			for (const u of users) stmt.run(u.email, u.password);
			stmt.finalize((err) => {
				db.close();
				if (err) reject(err);
				else resolve(dbPath);
			});
		});
	});
}

function readUsers(dbPath: string): Promise<Array<{ email: string; password: string }>> {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(dbPath);
		db.all('SELECT email, password FROM users', (err, rows) => {
			db.close();
			if (err) reject(err);
			else resolve(rows as Array<{ email: string; password: string }>);
		});
	});
}

describe('resetPasswords script', () => {
	const tempPaths: string[] = [];

	afterAll(() => {
		for (const p of tempPaths) {
			try {
				fs.unlinkSync(p);
			} catch {
				// ignore
			}
		}
	});

	test('updates all users with the default password hash', async () => {
		const dbPath = await createTempDb([
			{ email: 'a@test.com', password: 'old-hash-a' },
			{ email: 'b@test.com', password: 'old-hash-b' },
			{ email: 'c@test.com', password: 'old-hash-c' },
		]);
		tempPaths.push(dbPath);

		const changes = await resetPasswords(dbPath);
		expect(changes).toBe(3);

		const users = await readUsers(dbPath);
		expect(users).toHaveLength(3);
		for (const u of users) {
			expect(u.password).not.toMatch(/^old-hash/);
			await expect(bcrypt.compare(DEFAULT_PASSWORD, u.password)).resolves.toBe(true);
		}
	});

	test('accepts a custom password and produces a verifiable bcrypt hash', async () => {
		const dbPath = await createTempDb([{ email: 'x@test.com', password: 'prev' }]);
		tempPaths.push(dbPath);

		const changes = await resetPasswords(dbPath, 'S3cret!');
		expect(changes).toBe(1);

		const [user] = await readUsers(dbPath);
		await expect(bcrypt.compare('S3cret!', user.password)).resolves.toBe(true);
		await expect(bcrypt.compare(DEFAULT_PASSWORD, user.password)).resolves.toBe(false);
	});

	test('returns 0 changes when the users table is empty', async () => {
		const dbPath = await createTempDb([]);
		tempPaths.push(dbPath);

		const changes = await resetPasswords(dbPath);
		expect(changes).toBe(0);
	});

	test('rejects when the users table does not exist', async () => {
		const dbPath = path.join(os.tmpdir(), `reset-passwords-missing-${Date.now()}.sqlite`);
		tempPaths.push(dbPath);
		const db = new sqlite3.Database(dbPath);
		await new Promise<void>((resolve) => db.close(() => resolve()));

		await expect(resetPasswords(dbPath)).rejects.toThrow(/no such table/i);
	});
});
