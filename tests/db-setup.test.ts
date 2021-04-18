import { BenchmarkData } from '../src/api';
import { loadScheme } from '../src/db';
import { readFileSync } from 'fs';
import { TestDatabase, createAndInitializeDB, createDB } from './db-testing';

const numTxStatements = 3;

function expectIdsToBeUnique(ids) {
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toEqual(ids.length);
}

describe('Test Setup', () => {
  it('should execute tests in the right folder', () => {
    expect(__dirname).toMatch(/tests$/);
  });
});

describe('Setup of PostgreSQL DB', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createDB('db_setup_init', 1000, false, false);
  });

  afterAll(async () => {
    await db.close();
  });

  it('should load the database scheme without error', async () => {
    const createTablesSql = loadScheme();

    const testSql =
      createTablesSql +
      `
        SELECT * FROM Measurement;`;

    const result = await db.client.query(testSql);
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
      readFileSync(`${__dirname}/small-payload.json`).toString()
    );
  });

  afterAll(async () => {
    await db.close();
  });

  afterEach(async () => {
    await db.rollback();
  });

  it('should accept executor information', async () => {
    const ids: number[] = [];

    for (const datum of basicTestData.data) {
      const e = datum.runId.benchmark.suite.executor;
      const result = await db.recordExecutor(e);
      expect(e.name).toEqual(result.name);
      expect(e.desc).toEqual(result.description);
      expect(result.id).toBeGreaterThan(0);
      ids.push(result.id);
    }

    expectIdsToBeUnique(ids);
  });

  it('should accept suite information', async () => {
    const ids: number[] = [];

    for (const datum of basicTestData.data) {
      const s = datum.runId.benchmark.suite;
      const result = await db.recordSuite(s);
      expect(s.name).toEqual(result.name);
      expect(s.desc).toEqual(result.description);
      expect(result.id).toBeGreaterThan(0);
      ids.push(result.id);
    }

    expectIdsToBeUnique(ids);
  });

  it('should accept benchmark information', async () => {
    const ids: number[] = [];

    for (const datum of basicTestData.data) {
      const b = datum.runId.benchmark;
      const result = await db.recordBenchmark(b);
      expect(b.name).toEqual(result.name);
      if (b.desc !== undefined) {
        expect(b.desc).toEqual(result.description);
      }
      expect(result.id).toBeGreaterThan(0);
      ids.push(result.id);
    }

    expectIdsToBeUnique(ids);
  });

  it('should accept complete run information', async () => {
    const ids: number[] = [];

    for (const datum of basicTestData.data) {
      const run = datum.runId;
      const result = await db.recordRun(run);
      expect(run.cmdline).toEqual(result.cmdline);
      expect(run.location).toEqual(result.location);

      expect(typeof result.benchmarkid).toEqual('number');
      expect(typeof result.suiteid).toEqual('number');
      expect(typeof result.execid).toEqual('number');

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
      readFileSync(`${__dirname}/small-payload.json`).toString()
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
    const c = basicTestData.criteria[0];
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

  beforeAll(async () => {
    // the test database and we
    // we do not use transactions in these tests, because we need to be able
    // to access the database from R
    db = await createAndInitializeDB('db_setup_timeline', 25, true, false);

    smallTestData = JSON.parse(
      readFileSync(`${__dirname}/small-payload.json`).toString()
    );
    largeTestData = JSON.parse(
      readFileSync(`${__dirname}/large-payload.json`).toString()
    );
  });

  afterAll(async () => {
    await db.close();
  });

  it(`should accept all data (small-payload),
      and have the measurements persisted`, async () => {
    await db.recordMetaDataAndRuns(smallTestData);
    const recMs = await db.recordAllData(smallTestData);

    const measurements = await db.client.query('SELECT * from Measurement');
    expect(recMs).toEqual(3);
    expect(measurements.rowCount).toEqual(3);
    await db.awaitQuiescentTimelineUpdater();

    const timeline = await db.client.query('SELECT * from Timeline');
    expect(timeline.rowCount).toEqual(1);
  });

  it('data recording should be idempotent (small-payload)', async () => {
    // check that the data from the previous test is there
    let trials = await db.client.query('SELECT * from Trial');

    // performance tracking and the actual trial
    expect(trials.rowCount).toEqual(2);
    let exps = await db.client.query('SELECT * from Experiment');

    // performance tracking and the actual experiment
    expect(exps.rowCount).toEqual(2);

    // Do recordData a second time
    await db.recordMetaDataAndRuns(smallTestData);
    const recMs = await db.recordAllData(smallTestData);

    // don't need to wait for db.awaitQuiescentTimelineUpdater()
    // because this should not record anything

    const measurements = await db.client.query('SELECT * from Measurement');
    expect(recMs).toEqual(0);
    expect(measurements.rowCount).toEqual(4);

    trials = await db.client.query('SELECT * from Trial');

    // performance tracking and the actual trial
    expect(trials.rowCount).toEqual(2);
    exps = await db.client.query('SELECT * from Experiment');

    // performance tracking and the actual experiment
    expect(exps.rowCount).toEqual(2);
  });

  it(
    `should accept all data (large-payload),
      and have the measurements persisted`,
    async () => {
      await db.recordMetaDataAndRuns(largeTestData);
      const recMs = await db.recordAllData(largeTestData);

      const measurements = await db.client.query(
        'SELECT count(*) as cnt from Measurement'
      );

      await db.awaitQuiescentTimelineUpdater();

      expect(recMs).toEqual(459928);
      expect(parseInt(measurements.rows[0].cnt)).toEqual(459928 + 4);
      const timeline = await db.client.query('SELECT * from Timeline');
      expect(timeline.rowCount).toEqual(462);
    },
    200 * 1000
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
      r,
      run,
      trial,
      criteria,
      availableMs
    );
    expect(recordedMeasurements).toEqual(0);
  });
});
