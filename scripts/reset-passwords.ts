import bcrypt from 'bcrypt';
import sqlite3 from 'sqlite3';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '../apps/api/database.sqlite');
const DEFAULT_PASSWORD = '123456';

async function resetPasswords() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const db = new sqlite3.Database(DB_PATH);

  db.run('UPDATE users SET password = ?', [hash], function (err) {
    if (err) {
      console.error('Error:', err.message);
    } else {
      console.log(`Updated ${this.changes} user(s) with password: ${DEFAULT_PASSWORD}`);
    }
    db.close();
  });
}

resetPasswords().catch(console.error);
