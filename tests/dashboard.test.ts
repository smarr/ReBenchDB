import { Database } from '../src/db';
import { getConfig, prepareDbForTesting, rollback } from './db-testing';
import { dashStatistics, dashResults, dashChanges } from '../src/dashboard';

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

  it('Should get empty results request', async () => {
    const result = await dashResults(0, db);
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
    const result = await dashChanges(0, db);
    expect(result.changes).toHaveLength(0);
  });
});
