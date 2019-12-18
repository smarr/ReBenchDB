import { BenchmarkData } from '../src/api';
import { loadScheme, Database } from '../src/db';
import { expect } from 'chai';
import { readFileSync } from 'fs';

// create database test_rdb;
const testDbConfig = {
  // user: '',
  // password: '',
  host: 'localhost',
  database: 'test_rdb3',
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
  expect(ids.length).to.be.greaterThan(0);
  expect(new Set(ids).size).to.equal(ids.length);
}

describe('Setup of PostgreSQL DB', () => {
  it('should load the database scheme without error', async () => {
    const createTablesSql = loadScheme();
    const db = new Database(testDbConfig);

    const sql = wrapInTransaction(createTablesSql);

    const result = await db.client.query(sql);
    const len = (<any> result).length;
    expect(len).is.greaterThan(numTxStatements);

    const selectCommand = result[len - 2];
    expect(selectCommand.command).to.equal('SELECT');
    expect(selectCommand.rowCount).to.equal(0);
  });
});

describe('Recording a ReBench execution', () => {
  let db: Database;
  let basicTestData: BenchmarkData;
  let largeTestData: BenchmarkData;

  before(async () => {
    db = new Database(testDbConfig);
    await db.activateTransactionSupport();

    await db.client.query('BEGIN');

    await db.initializeDatabase();
    await db.client.query('SAVEPOINT freshDB');

    basicTestData = JSON.parse(
      readFileSync(`${__dirname}/../../tests/small-payload.json`).toString());
    largeTestData = JSON.parse(
      readFileSync(`${__dirname}/../../tests/large-payload.json`).toString());
  });

  afterEach(async () => {
    db.clearCache();
    db.client.query('ROLLBACK TO SAVEPOINT freshDB');
  });

  it('should accept executor information', async () => {
    const ids: number[] = [];

    for (const datum of basicTestData.data) {
      const e = datum.run_id.benchmark.suite.executor;
      const result = await db.recordExecutor(e);
      expect(e.name).to.equal(result.name);
      expect(e.desc).to.equal(result.description);
      expect(result.id).to.be.greaterThan(0);
      ids.push(result.id);
    }

    expectIdsToBeUnique(ids);
  });

  it('should accept suite information', async () => {
    const ids: number[] = [];

    for (const datum of basicTestData.data) {
      const s = datum.run_id.benchmark.suite;
      const result = await db.recordSuite(s);
      expect(s.name).to.equal(result.name);
      expect(s.desc).to.equal(result.description);
      expect(result.id).to.be.greaterThan(0);
      ids.push(result.id);
    }

    expectIdsToBeUnique(ids);
  });

  it('should accept benchmark information', async () => {
    const ids: number[] = [];

    for (const datum of basicTestData.data) {
      const b = datum.run_id.benchmark;
      const result = await db.recordExecutor(b);
      expect(b.name).to.equal(result.name);
      if (b.desc !== undefined) {
        expect(b.desc).to.equal(result.description);
      }
      expect(result.id).to.be.greaterThan(0);
      ids.push(result.id);
    }

    expectIdsToBeUnique(ids);
  });

  it('should accept complete run information', async () => {
    const ids: number[] = [];

    for (const datum of basicTestData.data) {
      const run = datum.run_id;
      const result = await db.recordRun(run);
      expect(run.cmdline).to.equal(result.cmdline);
      expect(run.location).to.equal(result.location);

      expect(result.benchmarkid).to.be.a('number');
      expect(result.suiteid).to.be.a('number');
      expect(result.execid).to.be.a('number');

      expect(result.id).to.be.greaterThan(0);
      ids.push(result.id);
    }

    expectIdsToBeUnique(ids);
  });

  it('should accept source information', async () => {
    const s = basicTestData.source;
    const result = await db.recordSource(s);
    expect(s.commitId).to.equal(result.commitid);
    expect(s.commitMsg).to.equal(result.commitmessage);
  });

  it('should accept environment information', async () => {
    const e = basicTestData.env;
    const result = await db.recordEnvironment(e);
    expect(e.hostName).to.equal(result.hostname);
    expect(e.osType).to.equal(result.ostype);
  });

  it('should accept experiment information', async () => {
    const e = basicTestData.env;
    const env = await db.recordEnvironment(e);

    const result = await db.recordExperiment(basicTestData, env);
    expect(e.userName).to.equal(result.username);
    expect(e.manualRun).to.equal(result.manualrun);
    expect(env.id).to.equal(result.envid);
  });

  it('should accept criterion information', async () => {
    const c = basicTestData.criteria[0];
    const criterion = await db.recordCriterion(c);
    expect(c.c).to.equal(criterion.name);
    expect(c.u).to.equal(criterion.unit);
    expect(criterion.id).to.be.a('number');
    expect(criterion.id).to.be.gte(0);
  });

  it('should accept all data (small-payload), and have the measurements persisted', async () => {
    await db.recordData(basicTestData);
    const measurements = await db.client.query('SELECT * from Measurement');
    expect(measurements.rowCount).to.equal(3);
  });

  it('should accept all data (large-payload), and have the measurements persisted', async () => {
    await db.recordData(largeTestData);
    const measurements = await db.client.query('SELECT count(*) as cnt from Measurement');
    expect(parseInt(measurements.rows[0].cnt)).to.equal(459928);
  });

  after(async () => {
    db.client.query('ROLLBACK');
  });
});
