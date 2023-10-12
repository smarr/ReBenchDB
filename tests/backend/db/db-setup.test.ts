import {
  describe,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  it
} from '@jest/globals';
import type {
  BenchmarkData,
  Criterion,
  DataPoint
} from '../../../src/shared/api.js';
import { loadScheme } from '../../../src/backend/db/db.js';
import { readFileSync } from 'fs';
import {
  TestDatabase,
  createAndInitializeDB,
  createDB,
  closeMainDb
} from './db-testing.js';
import { robustPath } from '../../../src/backend/util.js';

import { jest } from '@jest/globals';

const numTxStatements = 3;

const timeoutForLargeDataTest = 200 * 1000;
jest.setTimeout(timeoutForLargeDataTest);

function expectIdsToBeUnique(ids) {
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toEqual(ids.length);
}

describe('Setup of PostgreSQL DB', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createDB('db_setup_init', 1000, false, false);
  });

  afterAll(async () => {
    return db.close();
  });

  it('should load the database scheme without error', async () => {
    const createTablesSql = loadScheme();
    await db.connectClient();

    const testSql =
      createTablesSql +
      `
        SELECT * FROM Measurement;`;

    const result = await db.query({ text: testSql });
    const len = (<any>result).length;
    expect(len).toBeGreaterThan(numTxStatements);

    const selectCommand = result[len - 1];
    expect(selectCommand.command).toEqual('SELECT');
    expect(selectCommand.rowCount).toEqual(0);
  });
});

describe('Recording a ReBench execution data fragments', () => {
  let db: TestDatabase;
  let basicTestData: BenchmarkData;

  beforeAll(async () => {
    db = await createAndInitializeDB('db_setup');

    basicTestData = JSON.parse(
      readFileSync(robustPath('../tests/data/small-payload.json')).toString()
    );
  });

  afterAll(async () => {
    return db.close();
  });

  afterEach(async () => {
    return db.rollback();
  });

  it('should accept complete run information', async () => {
    const ids: number[] = [];

    for (const datum of basicTestData.data) {
      const run = datum.runId;
      const result = await db.recordRun(run);
      expect(run.cmdline).toEqual(result.cmdline);
      expect(run.location).toEqual(result.location);

      expect(result.id).toBeGreaterThan(0);
      ids.push(result.id);
    }

    expectIdsToBeUnique(ids);
  });

  it('should accept source information', async () => {
    const s = basicTestData.source;
    const result = await db.recordSource(s);
    expect(s.commitId).toEqual(result.commitid);
    expect(s.commitMsg).toEqual(result.commitmessage);
  });

  it('should accept environment information', async () => {
    const e = basicTestData.env;
    const result = await db.recordEnvironment(e);
    expect(e.hostName).toEqual(result.hostname);
    expect(e.osType).toEqual(result.ostype);
  });

  it('should accept trial information', async () => {
    const e = basicTestData.env;
    const env = await db.recordEnvironment(e);
    const exp = await db.recordExperiment(basicTestData);

    const result = await db.recordTrial(basicTestData, env, exp);
    expect(e.userName).toEqual(result.username);
    expect(e.manualRun).toEqual(result.manualrun);
    expect(env.id).toEqual(result.envid);
  });

  it('should accept trial denoise info', async () => {
    const testData: BenchmarkData = JSON.parse(
      readFileSync(robustPath('../tests/data/small-payload.json')).toString()
    );

    const e = testData.env;

    // add denoise details to test data
    e.denoise = {
      scaling_governor: 'performance',
      no_turbo: true,
      perf_event_max_sample_rate: 1,
      can_set_nice: true,
      shielding: true
    };

    const env = await db.recordEnvironment(e);
    const exp = await db.recordExperiment(testData);

    const result = await db.recordTrial(testData, env, exp);
    expect(e.userName).toEqual(result.username);
    expect(e.manualRun).toEqual(result.manualrun);
    expect(env.id).toEqual(result.envid);
    expect(e.denoise.scaling_governor).toEqual('performance');
    expect(e.denoise).toEqual(result.denoise);
  });

  it('should accept experiment information', async () => {
    const e = basicTestData.env;
    await db.recordEnvironment(e);

    const result = await db.recordExperiment(basicTestData);
    expect(result.name).toEqual(basicTestData.experimentName);
    expect(result.projectid).toBeGreaterThanOrEqual(0);
  });

  it('should accept criterion information', async () => {
    const c = <Criterion>basicTestData.criteria?.[0];
    const criterion = await db.recordCriterion(c);
    expect(c.c).toEqual(criterion.name);
    expect(c.u).toEqual(criterion.unit);
    expect(typeof criterion.id).toEqual('number');
    expect(criterion.id).toBeGreaterThanOrEqual(0);
  });
});

describe('Recording a ReBench execution from payload files', () => {
  let db: TestDatabase;
  let smallTestData: BenchmarkData;
  let largeTestData: BenchmarkData;
  let profileTestData: BenchmarkData;

  beforeAll(async () => {
    // the test database and we
    // we do not use transactions in these tests, because we need to be able
    // to access the database from R
    db = await createAndInitializeDB('db_setup_timeline', 25, true, false);

    smallTestData = JSON.parse(
      readFileSync(robustPath('../tests/data/small-payload.json')).toString()
    );
    largeTestData = JSON.parse(
      readFileSync(robustPath('../tests/data/large-payload.json')).toString()
    );
    profileTestData = JSON.parse(
      readFileSync(robustPath('../tests/data/profile-payload.json')).toString()
    );
  });

  afterAll(async () => {
    return db.close();
  });

  it(`should accept all data (small-payload),
      and have the measurements persisted`, async () => {
    await db.recordMetaDataAndRuns(smallTestData);
    const [recMs, recPs] = await db.recordAllData(smallTestData);

    const measurements = await db.query({ text: 'SELECT * from Measurement' });
    expect(recMs).toEqual(3);
    expect(recPs).toEqual(0);
    expect(measurements.rowCount).toEqual(3);
    await db.awaitQuiescentTimelineUpdater();

    const timeline = await db.query({ text: 'SELECT * from Timeline' });
    expect(timeline.rowCount).toEqual(1);

    // tests to see if small payload has separated each invocation
    // into an array of length 1
    const expectedValues = [[383.821], [432.783], [482.53]];
    for (const elm in expectedValues) {
      expect(measurements.rows[elm].values.length).toEqual(1);
      expect(measurements.rows[elm].values).toEqual(expectedValues[elm]);
    }
  });

  it('data recording should be idempotent (small-payload)', async () => {
    // check that the data from the previous test is there
    let trials = await db.query({ text: 'SELECT * from Trial' });

    // performance tracking and the actual trial,
    // but perf tracking is not synchronized
    expect([1, 2]).toContain(trials.rowCount);
    let exps = await db.query({ text: 'SELECT * from Experiment' });

    // performance tracking and the actual experiment
    // but perf tracking is not synchronized
    expect([1, 2]).toContain(exps.rowCount);

    // Do recordData a second time
    await db.recordMetaDataAndRuns(smallTestData);
    const [recMs, recPs] = await db.recordAllData(smallTestData);

    // don't need to wait for db.awaitQuiescentTimelineUpdater()
    // because this should not record anything

    const measurements = await db.query({ text: 'SELECT * from Measurement' });
    expect(recMs).toEqual(0);
    expect(recPs).toEqual(0);
    expect([3, 4]).toContain(measurements.rowCount);

    trials = await db.query({ text: 'SELECT * from Trial' });

    // performance tracking and the actual trial,
    // but perf tracking is not synchronized
    expect([1, 2]).toContain(trials.rowCount);
    exps = await db.query({ text: 'SELECT * from Experiment' });

    expect(exps.rowCount).toEqual(1);
  });

  it(
    `should accept all data (large-payload),
      and have the measurements persisted`,
    async () => {
      await db.recordMetaDataAndRuns(largeTestData);
      const [recMs, recPs] = await db.recordAllData(largeTestData);

      const measurements = await db.query({
        text: 'SELECT count(*) as cnt from Measurement'
      });

      await db.awaitQuiescentTimelineUpdater();

      // sql to find total number of values that exist in the table
      const totalNumberOfValuesQuery = await db.query({
        text: 'SELECT SUM(cardinality(values)) FROM Measurement'
      });

      // this finds all no unique IDs
      // if the sql has failed to merge all iteration into a single row,
      // then this will be > 0
      const numNonUniqueIDsQuery = await db.query({
        text: `SELECT runid, trialid, criterion, invocation
        FROM measurement
        WHERE (runid, trialid, criterion, invocation) IN
        (SELECT runid, trialid, criterion, invocation
          FROM measurement
          GROUP BY runid, trialid, criterion, invocation
          HAVING COUNT(*) > 1);`
      });

      const expectedTimelineRowCount = 317;
      const numberRowsAdded = 460;
      const expectedNumberRows = 464;
      const expectedNumberValues = 459932;

      expect(recMs).toEqual(numberRowsAdded);
      expect(recPs).toEqual(0);
      expect(parseInt(measurements.rows[0].cnt)).toEqual(expectedNumberRows);
      const timeline = await db.query({ text: 'SELECT * from Timeline' });
      expect(timeline.rowCount).toEqual(expectedTimelineRowCount);
      expect(parseInt(totalNumberOfValuesQuery.rows[0].sum)).toEqual(
        expectedNumberValues
      );

      expect(numNonUniqueIDsQuery.rows.length).toEqual(0);
    },
    timeoutForLargeDataTest
  );

  it('should not fail if some data is already in database', async () => {
    // make sure everything is in the database
    await db.recordMetaDataAndRuns(smallTestData);
    await db.recordAllData(smallTestData);

    // obtain the bits, this should match what `recordData` does above
    const { trial, criteria } = await db.recordMetaData(smallTestData);

    // now, manually do the recording
    const r = smallTestData.data[0];

    // and pretend there's no data yet
    const availableMs = {};

    const run = await db.recordRun(r.runId);

    const recordedMeasurements = await db.recordMeasurements(
      <DataPoint[]>r.d,
      run,
      trial,
      criteria,
      availableMs
    );
    expect(recordedMeasurements).toEqual(0);
  });

  it('should be possible to store profiles', async () => {
    await db.recordMetaDataAndRuns(profileTestData);
    const [recMs, recPs] = await db.recordAllData(profileTestData);

    const profiles = await db.query({ text: `SELECT * from ProfileData` });

    expect(recMs).toEqual(0);
    expect(recPs).toEqual(2);

    expect(profiles.rowCount).toEqual(2);
    const row1 = profiles.rows[0];

    const profileStr = row1.value;
    expect(typeof profileStr).toBe('string');
    const profileData = JSON.parse(profileStr);
    expect(profileData.length).toEqual(16);
    expect(profileData[0].m).toEqual('GreyObjectsWalker_walkGreyObjects');
  });
});

afterAll(async () => {
  return closeMainDb();
});
