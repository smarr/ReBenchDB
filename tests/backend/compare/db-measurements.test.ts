import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from '../db/db-testing.js';
import { loadLargePayload } from '../../payload.js';
import { getMeasurements } from '../../../src/backend/compare/compare.js';

describe('compare view: getMeasurements()', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('compare_view_get_m', 0, false);
    const largeTestData = loadLargePayload();
    await db.recordAllData(largeTestData);
  });

  afterAll(async () => {
    if (db) return db.close();
  });

  it('should give expected results for runId 1', async () => {
    const results = await getMeasurements(
      'Large-Example-Project',
      10,
      '58666d1c84c652306f930daa72e7a47c58478e86',
      '58666d1c84c652306f930daa72e7a47c58478e86',
      db
    );

    expect(results).toHaveLength(1);
    if (results === null) return;
    expect(results[0].data).toHaveLength(1);
    expect(results[0].data[0].criterion).toEqual('total');
    expect(results[0].data[0].values).toHaveLength(1);
    expect(results[0].data[0].values[0]).toHaveLength(1000);
  });
});

afterAll(async () => {
  return closeMainDb();
});
