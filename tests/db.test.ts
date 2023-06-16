import { describe, expect, beforeAll, afterAll, it } from '@jest/globals';
import { readFileSync } from 'node:fs';

import {
  TestDatabase,
  createAndInitializeDB,
  closeMainDb
} from './db-testing.js';
import { BenchmarkData, TimelineRequest } from '../src/shared/api.js';

import { getDirname } from '../src/util.js';
import { Experiment, Environment } from '../src/backend/db/types.js';

const __dirname = getDirname(import.meta.url);

describe('Record Trial', () => {
  let db: TestDatabase;
  let basicTestData: BenchmarkData;
  let env: Environment;
  let exp: Experiment;

  beforeAll(async () => {
    db = await createAndInitializeDB('db_record_trial', 0, false, false);
    const data = readFileSync(`${__dirname}/small-payload.json`).toString();
    basicTestData = JSON.parse(data);

    env = await db.recordEnvironment(basicTestData.env);
    exp = await db.recordExperiment(basicTestData);
  });

  afterAll(async () => {
    return db.close();
  });

  it('the database should not have any trials', async () => {
    const result = await db.query({ text: 'SELECT * FROM Trial' });
    expect(result.rowCount).toEqual(0);
  });

  it('should record a new trial in the database', async () => {
    const result = await db.recordTrial(basicTestData, env, exp);

    const tResult = await db.query({ text: 'SELECT * FROM Trial' });
    expect(tResult.rowCount).toEqual(1);
    expect(tResult.rows[0].username).toEqual('smarr');

    expect(result.username).toEqual('smarr');
  });

  it('recording the same, again, should not add it to the db', async () => {
    const result = await db.recordTrial(basicTestData, env, exp);

    const tResult = await db.query({ text: 'SELECT * FROM Trial' });
    expect(tResult.rowCount).toEqual(1);
    expect(tResult.rows[0].username).toEqual('smarr');

    expect(result.username).toEqual('smarr');
  });

  it('but, recording the same for another experiment, should', async () => {
    basicTestData.experimentName += ' 2';
    const exp2 = await db.recordExperiment(basicTestData);
    expect(exp2.id).not.toEqual(exp.id);

    const result = await db.recordTrial(basicTestData, env, exp2);
    expect(result.expid).toEqual(exp2.id);

    const tResult = await db.query({ text: 'SELECT * FROM Trial' });
    expect(tResult.rowCount).toEqual(2);
    expect(tResult.rows[0].expid).toEqual(exp.id);
    expect(tResult.rows[1].expid).toEqual(exp2.id);
  });
});

describe('Timeline-plot Queries', () => {
  let db: TestDatabase;
  let projectName: string;
  let baseBranch: string;
  let changeBranch: string;

  let earlierBaseCommitId: string;
  let baseCommitId: string;
  let changeCommitId: string;

  let benchmark: string;
  let executor: string;
  let suite: string;

  beforeAll(async () => {
    db = await createAndInitializeDB('db_ts_basic', 25, true, false);

    const data = readFileSync(`${__dirname}/small-payload.json`).toString();
    const basicTestData: BenchmarkData = JSON.parse(data);
    projectName = basicTestData.projectName;

    baseBranch = basicTestData.source.branchOrTag = 'base-branch';
    db.setProjectBaseBranch(projectName, basicTestData.source.branchOrTag);
    earlierBaseCommitId = basicTestData.source.commitId;

    await db.recordMetaDataAndRuns(basicTestData);
    await db.recordAllData(basicTestData);

    // have a second experiment in the database
    basicTestData.experimentName += ' 2';
    basicTestData.startTime = '2019-12-14T22:49:56';
    changeBranch = basicTestData.source.branchOrTag = 'change-branch';
    changeCommitId = basicTestData.source.commitId =
      '2222222222222222222222222222222222222222';

    await db.recordMetaDataAndRuns(basicTestData);
    await db.recordAllData(basicTestData);

    // have a merge in the database
    basicTestData.experimentName += ' 3';
    basicTestData.startTime = '2019-12-15T22:49:56';
    basicTestData.source.branchOrTag = baseBranch;
    baseCommitId = basicTestData.source.commitId =
      '3333333333333333333333333333333333333333';

    await db.recordMetaDataAndRuns(basicTestData);
    await db.recordAllData(basicTestData);

    benchmark = basicTestData.data[0].runId.benchmark.name;
    executor = basicTestData.data[0].runId.benchmark.suite.executor.name;
    suite = basicTestData.data[0].runId.benchmark.suite.name;

    await db.awaitQuiescentTimelineUpdater();
  });

  afterAll(async () => {
    return db.close();
  });

  describe('Retrieving branch names based on commit ids', () => {
    it('should return `null` if there is an error', async () => {
      const result = await db.getBranchNames(
        projectName,
        'non-existing-commit',
        'another-non-existing-commit'
      );

      expect(result).toBeNull();
    });

    it('should handle both commit ids being on the same branch', async () => {
      let result = await db.getBranchNames(
        projectName,
        earlierBaseCommitId,
        baseCommitId
      );

      expect(result?.baseBranchName).toEqual(baseBranch);
      expect(result?.changeBranchName).toEqual(baseBranch);

      result = await db.getBranchNames(
        projectName,
        baseCommitId,
        earlierBaseCommitId
      );

      expect(result?.baseBranchName).toEqual(baseBranch);
      expect(result?.changeBranchName).toEqual(baseBranch);

      result = await db.getBranchNames(projectName, baseCommitId, baseCommitId);

      expect(result?.baseBranchName).toEqual(baseBranch);
      expect(result?.changeBranchName).toEqual(baseBranch);
    });

    it('should match branch names correctly to base and change', async () => {
      let result = await db.getBranchNames(
        projectName,
        baseCommitId,
        changeCommitId
      );

      expect(result?.baseBranchName).toEqual(baseBranch);
      expect(result?.changeBranchName).toEqual(changeBranch);

      result = await db.getBranchNames(
        projectName,
        changeCommitId,
        baseCommitId
      );

      expect(result?.baseBranchName).toEqual(changeBranch);
      expect(result?.changeBranchName).toEqual(baseBranch);
    });
  });

  describe('Retrieving timeline data', () => {
    it('should return `null` if there is an error', async () => {
      const request: TimelineRequest = {
        baseline: 'non-existing-commitid',
        change: 'another-non-existing-commitid',
        b: benchmark,
        e: executor,
        s: suite
      };

      const result = await db.getTimelineData(projectName, request);
      expect(result).toBeNull();
    });

    it('should return median and BCIs for each branch', async () => {
      const request: TimelineRequest = {
        baseline: baseCommitId,
        change: changeCommitId,
        b: benchmark,
        e: executor,
        s: suite
      };

      const result = await db.getTimelineData(projectName, request);
      expect(result?.baseBranchName).toEqual(baseBranch);
      expect(result?.changeBranchName).toEqual(changeBranch);

      expect(result?.baseTimestamp).toEqual(1576450196);
      expect(result?.changeTimestamp).toEqual(1576363796);

      expect(result?.data[0]).toEqual([1576277396, 1576363796, 1576450196]);
      expect(result?.data[2]).toEqual([432.783, null, 432.783]);
      expect(result?.data[5]).toEqual([null, 432.783, null]);
    });

    it('should identify the current data points per branch', async () => {
      const request: TimelineRequest = {
        baseline: baseCommitId,
        change: earlierBaseCommitId,
        b: benchmark,
        e: executor,
        s: suite
      };

      const result = await db.getTimelineData(projectName, request);
      expect(result?.baseBranchName).toEqual(baseBranch);
      expect(result?.changeBranchName).toEqual(baseBranch);

      expect(result?.baseTimestamp).toEqual(1576450196);
      expect(result?.changeTimestamp).toBeNull();

      expect(result?.data[0]).toEqual([1576277396, 1576450196]);
      expect(result?.data[2]).toEqual([432.783, 432.783]);
    });
  });
});

afterAll(async () => {
  return closeMainDb();
});
