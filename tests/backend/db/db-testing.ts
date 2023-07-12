import type {
  Pool,
  PoolClient,
  PoolConfig,
  QueryConfig,
  QueryResult,
  QueryResultRow
} from 'pg';
import pg from 'pg';

import type { DatabaseConfig } from '../../../src/backend/db/types.js';

import { Database } from '../../../src/backend/db/db.js';
// eslint-disable-next-line max-len
import { DatabaseWithPool } from '../../../src/backend/db/database-with-pool.js';

export class TestDatabase extends Database {
  private readonly connectionPool: Pool;
  private client: PoolClient | null;

  private readonly usesTransactions: boolean;
  private preparedForTesting = false;
  private closingAttempted = false;

  constructor(
    config: PoolConfig,
    numBootstrapSamples: number,
    timelineEnabled: boolean,
    useTransactions: boolean
  ) {
    super(config, numBootstrapSamples, timelineEnabled);
    this.connectionPool = new pg.Pool(config);
    this.usesTransactions = useTransactions;
    this.client = null;
  }

  public getDatabaseConfig(): DatabaseConfig {
    return {
      user: <string>this.dbConfig.user,
      password: <string>this.dbConfig.password,
      host: <string>this.dbConfig.host,
      database: <string>this.dbConfig.database,
      port: <number>this.dbConfig.port
    };
  }

  public query<R extends QueryResultRow = any>(
    queryConfig: QueryConfig<any[]>
  ): Promise<QueryResult<R>> {
    if (this.client) {
      return this.client.query(queryConfig);
    } else {
      throw new Error(
        'Database is not yet initialized.' +
          ' prepareForTesting() has not been called yet.'
      );
    }
  }

  public async connectClient(): Promise<void> {
    this.client = await this.connectionPool.connect();
  }

  public async prepareForTesting(): Promise<void> {
    if (this.preparedForTesting) {
      throw new Error('This is only to be executed once');
    }
    this.preparedForTesting = true;
    await this.connectClient();

    if (this.usesTransactions) {
      await this.query({ text: 'BEGIN' });
    }

    await this.initializeDatabase();

    if (this.usesTransactions) {
      await this.query({ text: 'SAVEPOINT freshDB' });
    }
  }

  public async rollback(): Promise<void> {
    this.clearCache();

    if (this.usesTransactions) {
      await this.query({ text: 'ROLLBACK TO SAVEPOINT freshDB' });
    }
  }

  private async release(): Promise<void> {
    const mainDB = getMainDB();
    await mainDB.query({
      text: `DROP DATABASE IF EXISTS ${this.dbConfig.database}`
    });
  }

  public async close(): Promise<void> {
    await super.close();

    this.statsValid.invalidateAndNew();

    if (this.closingAttempted) {
      throw new Error('Already attempted to close');
    }
    if (this.client === null) {
      throw new Error('Client was not connected');
    }

    this.closingAttempted = true;

    try {
      await this.rollback();
    } finally {
      try {
        await this.client.release();
        this.client = null;
        await this.connectionPool.end();
        (<any>this).connectionPool = null;
      } finally {
        await this.release();
      }
    }
  }
}

export async function createAndInitializeDB(
  testSuite: string,
  numBootstrapSamples = 1000,
  timelineEnabled = false,
  useTransactions = true
): Promise<TestDatabase> {
  const testDb = await createDB(
    testSuite,
    numBootstrapSamples,
    timelineEnabled,
    useTransactions
  );
  await testDb.prepareForTesting();
  return testDb;
}

export async function createDB(
  testSuite: string,
  numBootstrapSamples = 1000,
  timelineEnabled = false,
  useTransactions = true
): Promise<TestDatabase> {
  // TODO: use a template database, which may speed up things slightly?
  // https://walrus.ai/blog/2020/04/testing-database-interactions-with-jest/
  // https://www.postgresql.org/docs/current/manage-ag-templatedbs.html
  const cfg = getConfig();
  const db = getMainDB();
  const dbNameForSuite = `${cfg.database}_${testSuite}`;
  await db.query({
    text: `DROP DATABASE IF EXISTS ${dbNameForSuite}`
  });
  await db.query({
    text: `CREATE DATABASE ${dbNameForSuite}`
  });

  cfg.database = dbNameForSuite;

  return new TestDatabase(
    cfg,
    numBootstrapSamples,
    timelineEnabled,
    useTransactions
  );
}

let mainDB: Database | null = null;

function getMainDB(): Database {
  if (mainDB === null) {
    const cfg = getConfig();
    mainDB = new DatabaseWithPool(cfg);
  }
  return mainDB;
}

export async function closeMainDb(): Promise<void> {
  if (mainDB !== null) {
    return mainDB.close();
  }
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
