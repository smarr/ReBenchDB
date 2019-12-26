import { BenchmarkData } from '../src/api';
import { loadScheme, Database } from '../src/db';
import { readFileSync } from 'fs';

// create database test_rdb;
const testDbConfig = {
  user: process.env.RDB_USER || '',
  password: process.env.RDB_PASS || '',
  host: process.env.RDB_HOST || 'localhost',
  database: process.env.RDB_DB || 'test_rdb3',
  port: 5432
};

const numTxStatements = 3;

function wrapInTransaction(sql: string) {
  return `
  begin;
  ${sql};

  SELECT * FROM Measurement;
  rollback;
  `;
}

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
  jest.setTimeout(120 * 1000);

  it('should load the database scheme without error', async () => {
    const createTablesSql = loadScheme();
    const db = new Database(testDbConfig);

    const sql = wrapInTransaction(createTablesSql);

    const result = await db.client.query(sql);
    const len = (<any> result).length;
    expect(len).toBeGreaterThan(numTxStatements);

    const selectCommand = result[len - 2];
    expect(selectCommand.command).toEqual('SELECT');
    expect(selectCommand.rowCount).toEqual(0);
  });
});

describe('Recording a ReBench execution', () => {
  let db: Database;
  let basicTestData: BenchmarkData;
  let largeTestData: BenchmarkData;

  beforeAll(async () => {
    db = new Database(testDbConfig);
    await db.activateTransactionSupport();

    await db.client.query('BEGIN');

    await db.initializeDatabase();
    await db.client.query('SAVEPOINT freshDB');

    basicTestData = JSON.parse(
      readFileSync(`${__dirname}/small-payload.json`).toString());
    largeTestData = JSON.parse(
      readFileSync(`${__dirname}/large-payload.json`).toString());
  });

  afterEach(async () => {
    db.clearCache();
    db.client.query('ROLLBACK TO SAVEPOINT freshDB');
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


  it('should accept experiment information', async () => {
    const e = basicTestData.env;
    const env = await db.recordEnvironment(e);

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

  it('should accept all data (small-payload), and have the measurements persisted', async () => {
    const recMs = await db.recordData(basicTestData);
    const measurements = await db.client.query('SELECT * from Measurement');
    expect(3).toEqual(recMs);
    expect(3).toEqual(measurements.rowCount);
  });

  it('data recording should be idempotent (small-payload)', async () => {
    let recMs = await db.recordData(basicTestData);
    let measurements = await db.client.query('SELECT * from Measurement');
    expect(3).toEqual(recMs);
    expect(3).toEqual(measurements.rowCount);

    recMs = await db.recordData(basicTestData);
    measurements = await db.client.query('SELECT * from Measurement');
    expect(0).toEqual(recMs);
    expect(3).toEqual(measurements.rowCount);
  });

  it('should accept all data (large-payload), and have the measurements persisted', async () => {
    const recMs = await db.recordData(largeTestData);
    const measurements = await db.client.query('SELECT count(*) as cnt from Measurement');

    expect(459928).toEqual(recMs);
    expect(459928).toEqual(parseInt(measurements.rows[0].cnt));
  });

  afterAll(async () => {
    await db.client.query('ROLLBACK');
    await (<any> db.client).end();
  });
});
