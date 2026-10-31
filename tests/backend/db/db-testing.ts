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
// eslint-disable-next-line max-len
import { BatchingTimelineUpdater } from '../../../src/backend/timeline/timeline-calc.js';
import { reportConnectionRefused } from '../../../src/shared/errors.js';

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
    super(
      config,
      timelineEnabled ? new BatchingTimelineUpdater(numBootstrapSamples) : null
    );
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
  try {
    await db.query({
      text: `DROP DATABASE IF EXISTS ${dbNameForSuite}`
    });
    await db.query({
      text: `CREATE DATABASE ${dbNameForSuite}`
    });
  } catch (e: any) {
    throw explainMainDbError(e, cfg, dbNameForSuite);
  }

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
  if (mainDB) {
    return mainDB.close();
  }
}

const defaultMainDb = 'test_rdb4';

export function explainMainDbError(
  e: any,
  cfg: DatabaseConfig,
  dbNameForSuite: string
): Error {
  // pg falls back to the OS user if no user is given
  const user = cfg.user || process.env.USER;
  const mainDb =
    `main database "${cfg.database}" ` +
    `(user "${user}" on ${cfg.host}:${cfg.port})`;
  const howToConfigure =
    'The tests connect to this existing database to create a separate ' +
    `database per test suite (here "${dbNameForSuite}").\n` +
    'Configure it with the environment variables ' +
    `RDB_DB (default "${defaultMainDb}"), RDB_USER, RDB_PASS, and RDB_HOST.\n` +
    'For instance: RDB_DB=postgres npm test';

  let reason: string;
  if (e.code === 'ECONNREFUSED' || e.errors?.[0]?.code === 'ECONNREFUSED') {
    reportConnectionRefused(e);
    reason = `Connection refused for ${mainDb}. Is PostgreSQL running?`;
  } else if (e.code === '3D000') {
    // invalid_catalog_name
    reason =
      `The ${mainDb} does not exist.\n` +
      `Create it with \`createdb ${cfg.database}\`, ` +
      'or point RDB_DB to an existing database.';
  } else if (e.code === '28P01' || e.code === '28000') {
    // invalid_password, invalid_authorization_specification
    reason = `Authentication failed for ${mainDb}: ${e.message}`;
  } else if (e.code === '42501') {
    // insufficient_privilege
    reason =
      `The user "${user}" is not permitted to create databases: ` +
      `${e.message}\nGrant it with \`ALTER ROLE ${user} CREATEDB\`.`;
  } else {
    reason = `Failed to create "${dbNameForSuite}" via ${mainDb}: ${e.message}`;
  }

  return new Error(`${reason}\n\n${howToConfigure}`, { cause: e });
}

function getConfig(): DatabaseConfig {
  return {
    user: process.env.RDB_USER || '',
    password: process.env.RDB_PASS || '',
    host: process.env.RDB_HOST || 'localhost',
    database: process.env.RDB_DB || defaultMainDb,
    port: 5432
  };
}
