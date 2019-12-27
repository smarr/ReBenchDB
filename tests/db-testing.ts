import { Database } from '../src/db';

export function getConfig() {
  return {
    user: process.env.RDB_USER || '',
    password: process.env.RDB_PASS || '',
    host: process.env.RDB_HOST || 'localhost',
    database: process.env.RDB_DB || 'test_rdb4',
    port: 5432
  };
}

export function wrapInTransaction(sql: string) {
  return `
  begin;
  ${sql};

  SELECT * FROM Measurement;
  rollback;
  `;
}

export async function prepareDbForTesting(db: Database) {
  await db.activateTransactionSupport();

  await db.client.query('BEGIN');

  await db.initializeDatabase();
  await db.client.query('SAVEPOINT freshDB');
}

export async function rollback(db: Database) {
  db.clearCache();
  await db.client.query('ROLLBACK TO SAVEPOINT freshDB');
}
