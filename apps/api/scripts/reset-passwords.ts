import bcrypt from 'bcrypt';
import sqlite3 from 'sqlite3';
import path from 'path';

export const DEFAULT_PASSWORD = '123456';

export function resetPasswords(
	dbPath: string,
	password: string = DEFAULT_PASSWORD,
): Promise<number> {
	return new Promise((resolve, reject) => {
		bcrypt
			.hash(password, 10)
			.then((hash) => {
				const db = new sqlite3.Database(dbPath);
				db.run('UPDATE users SET password = ?', [hash], function (err) {
					db.close();
					if (err) reject(err);
					else resolve(this.changes);
				});
			})
			.catch(reject);
	});
}

const invokedPath = process.argv[1] ?? '';
if (invokedPath.endsWith('reset-passwords.ts') || invokedPath.endsWith('reset-passwords.js')) {
	const dbPath = path.resolve(process.cwd(), 'database.sqlite');
	resetPasswords(dbPath)
		.then((changes) => {
			console.log(`Updated ${changes} user(s) with password: ${DEFAULT_PASSWORD}`);
		})
		.catch((err) => {
			console.error('Error:', err.message);
			process.exit(1);
		});
}
