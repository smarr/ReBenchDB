import { describe, expect, beforeAll, afterAll, it } from '@jest/globals';
import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from './db/db-testing.js';
import {
  _completeRequest,
  initPerfTracker,
  startRequest
} from '../../src/backend/perf-tracker.js';

describe('Test basic performance self-tracking', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('perf_tracker', 0, false, false);
  });

  it('should start with empty trials etc tables', async () => {
    let result = await db.query({ text: 'SELECT * FROM Trial' });
    expect(result.rowCount).toEqual(0);

    result = await db.query({ text: 'SELECT * FROM Experiment' });
    expect(result.rowCount).toEqual(0);

    result = await db.query({ text: 'SELECT * FROM Run' });
    expect(result.rowCount).toEqual(0);

    result = await db.query({ text: 'SELECT * FROM Measurement' });
    expect(result.rowCount).toEqual(0);
  });

  it('should create trial on initialization', async () => {
    await initPerfTracker(db);

    let result = await db.query({ text: 'SELECT * FROM Trial' });
    expect(result.rowCount).toEqual(1);
    expect(result.rows[0].starttime).not.toBeNull();

    result = await db.query({ text: 'SELECT * FROM Experiment' });
    expect(result.rowCount).toEqual(1);
    expect(result.rows[0].name).toEqual('monitoring');

    result = await db.query({ text: 'SELECT * FROM Run' });
    expect(result.rowCount).toEqual(11);

    result = await db.query({ text: 'SELECT * FROM Measurement' });
    expect(result.rowCount).toEqual(0);
  });

  it('should create measurement on demand', async () => {
    const time = startRequest();
    await _completeRequest(time, db, 'get-results');

    const result = await db.query({ text: 'SELECT * FROM Measurement' });
    expect(result.rowCount).toEqual(1);
    expect(result.rows[0].invocation).toEqual(1);
    expect(result.rows[0].values).toHaveLength(1);
    expect(typeof result.rows[0].values[0]).toBe('number');
  });

  it('should append to the array on subsequent calls', async () => {
    const time = startRequest();
    await _completeRequest(time, db, 'get-results');
    await _completeRequest(time, db, 'get-results');

    const result = await db.query({ text: 'SELECT * FROM Measurement' });
    expect(result.rowCount).toEqual(1);
    expect(result.rows[0].invocation).toEqual(1);
    expect(result.rows[0].values).toHaveLength(3);
    expect(typeof result.rows[0].values[0]).toBe('number');
    expect(typeof result.rows[0].values[1]).toBe('number');
    expect(typeof result.rows[0].values[2]).toBe('number');
  });

  afterAll(async () => {
    return db.close();
  });
});

afterAll(async () => {
  return closeMainDb();
});
