import { AsyncLocalStorage } from 'node:async_hooks';

// eslint-disable-next-line max-len
import pg, { PoolClient, PoolConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';

import { Database } from './db.js';
import { BatchingTimelineUpdater } from '../timeline/timeline-calc.js';

const userContextStorage = new AsyncLocalStorage<{ client: PoolClient }>();

export class DatabaseWithPool extends Database {
  private pool: pg.Pool;

  constructor(
    config: PoolConfig,
    numBootstrapSamples = 1000,
    timelineEnabled = false,
    cacheInvalidationDelay = 0
  ) {
    super(
      config,
      timelineEnabled ? new BatchingTimelineUpdater(numBootstrapSamples) : null,
      cacheInvalidationDelay
    );
    this.pool = new pg.Pool(config);
  }

  public async query<R extends QueryResultRow = any>(
    queryConfig: QueryConfig<any[]>
  ): Promise<QueryResult<R>> {
    const context = userContextStorage.getStore();
    if (context) {
      return context.client.query(queryConfig);
    }
    return this.pool.query(queryConfig);
  }

  public async withUserContext<T>(
    userId: number | null,
    fn: () => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE rdb_app');
      if (userId !== null) {
        await client.query(`SET LOCAL app.currentUserId = '${userId}'`);
      }
      const result = await userContextStorage.run({ client }, fn);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  public async close(): Promise<void> {
    await super.close();
    this.statsValid.invalidateAndNew();
    await this.pool.end();
    (<any>this).pool = null;
  }
}
