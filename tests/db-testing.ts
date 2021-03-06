import { Database, DatabaseConfig } from '../src/db';
import { PoolConfig } from 'pg';

export class TestDatabase extends Database {
  private readonly usesTransactions: boolean;
  private preparedForTesting = false;

  constructor(
    config: PoolConfig,
    numReplicates: number,
    timelineEnabled: boolean,
    useTransactions: boolean
  ) {
    super(config, numReplicates, timelineEnabled);
    this.usesTransactions = useTransactions;
  }

  public async prepareForTesting(): Promise<void> {
    if (this.preparedForTesting) {
      throw new Error('This is only to be executed once');
    }

    if (this.usesTransactions) {
      await this.activateTransactionSupport();
      await this.client.query('BEGIN');
    }

    await this.initializeDatabase();

    if (this.usesTransactions) {
      await this.client.query('SAVEPOINT freshDB');
    }
  }

  public async rollback(): Promise<void> {
    this.clearCache();

    if (this.usesTransactions) {
      await this.client.query('ROLLBACK TO SAVEPOINT freshDB');
    }
  }

  private async release(): Promise<void> {
    const mainDB = getMainDB();
    const query = `DROP DATABASE IF EXISTS ${this.dbConfig.database};`;
    await mainDB.client.query(query);
  }

  public async close(): Promise<void> {
    try {
      await this.rollback();
    } finally {
      try {
        await super.close();
      } finally {
        try {
          await this.release();
        } catch (e) {
          console.log(`Closing of ${this.dbConfig.database} failed`);
          console.log(e);
        }
      }
    }
  }
}

export async function createAndInitializeDB(
  testSuite: string,
  numReplicates = 1000,
  timelineEnabled = false,
  useTransactions = true
): Promise<TestDatabase> {
  const testDb = await createDB(
    testSuite,
    numReplicates,
    timelineEnabled,
    useTransactions
  );
  await testDb.prepareForTesting();
  return testDb;
}

export async function createDB(
  testSuite: string,
  numReplicates = 1000,
  timelineEnabled = false,
  useTransactions = true
): Promise<TestDatabase> {
  // TODO: use a template database, which may speed up things slightly?
  // https://walrus.ai/blog/2020/04/testing-database-interactions-with-jest/
  // https://www.postgresql.org/docs/current/manage-ag-templatedbs.html
  const cfg = getConfig();
  const db = getMainDB();
  const dbNameForSuite = `${cfg.database}_${testSuite}`;
  await db.client.query(`DROP DATABASE IF EXISTS ${dbNameForSuite};`);
  await db.client.query(`CREATE DATABASE ${dbNameForSuite};`);

  cfg.database = dbNameForSuite;

  return new TestDatabase(cfg, numReplicates, timelineEnabled, useTransactions);
}

let mainDB: Database | null = null;

function getMainDB(): Database {
  if (mainDB === null) {
    const cfg = getConfig();
    mainDB = new Database(cfg);
  }
  return mainDB;
}

function getConfig(): DatabaseConfig {
  return {
    user: process.env.RDB_USER || '',
    password: process.env.RDB_PASS || '',
    host: process.env.RDB_HOST || 'localhost',
    database: process.env.RDB_DB || 'test_rdb4',
    port: 5432
  };
}
