import pg, { PoolConfig, QueryConfig, QueryResult, QueryResultRow } from 'pg';

import { Database } from './db.js';

export class DatabaseWithPool extends Database {
  private pool: pg.Pool;

  constructor(
    config: PoolConfig,
    numReplicates = 1000,
    timelineEnabled = false,
    cacheInvalidationDelay = 0
  ) {
    super(config, numReplicates, timelineEnabled, cacheInvalidationDelay);
    this.pool = new pg.Pool(config);
  }

  public async query<R extends QueryResultRow = any>(
    queryConfig: QueryConfig<any[]>
  ): Promise<QueryResult<R>> {
    return this.pool.query(queryConfig);
  }

  public async close(): Promise<void> {
    await super.close();
    this.statsValid.invalidateAndNew();
    await this.pool.end();
    (<any>this).pool = null;
  }
}
