import { Database } from '../src/db';
import { getConfig, prepareDbForTesting, rollback } from './db-testing';
import { dashStatistics, dashReBenchDb, dashChanges } from '../src/dashboard';

const testDbConfig = getConfig();

describe('Test Dashboard on empty DB', () => {
  let db: Database;

  beforeAll(async () => {
    db = new Database(testDbConfig);
    await prepareDbForTesting(db);
  });

  afterAll(async () => {
    await db.client.query('ROLLBACK');
    await (<any> db.client).end();
  });

  afterEach(async () => {
    await rollback(db);
  });

  it('Should get empty ReBenchDB request statistics', async () => {
    const result = await dashReBenchDb(db);
    expect(result.timeSeries).toHaveLength(0);
  });

  it('Should get empty statistics', async () => {
    const result = await dashStatistics(db);
    expect(result.stats.length).toBeGreaterThan(1);
    for (const table of result.stats) {
      expect(table.cnt).toEqual('0');
    }
  });

  it('Should get empty changes', async () => {
    const result = await dashChanges('SOMns', db);
    expect(result.changes).toHaveLength(0);
  });
});
