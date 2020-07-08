import { Database } from '../src/db';

export function getConfig(): { user, password, host, database, port } {
  return {
    user: process.env.RDB_USER || '',
    password: process.env.RDB_PASS || '',
    host: process.env.RDB_HOST || 'localhost',
    database: process.env.RDB_DB || 'test_rdb4',
    port: 5432
  };
}

export function getTempDatabaseName(): string {
  return 'test_rdb_tmp';
}

export function wrapInTransaction(sql: string): string {
  return `
  begin;
  ${sql};

  SELECT * FROM Measurement;
  rollback;
  `;
}

export async function prepareDbForTesting(db: Database): Promise<void> {
  await db.activateTransactionSupport();

  await db.client.query('BEGIN');

  await db.initializeDatabase();
  await db.client.query('SAVEPOINT freshDB');
}

export async function rollback(db: Database): Promise<void> {
  db.clearCache();
  await db.client.query('ROLLBACK TO SAVEPOINT freshDB');
}
