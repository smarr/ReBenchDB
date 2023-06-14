import { describe, expect, beforeAll, afterAll, it, jest } from '@jest/globals';
import {
  TestDatabase,
  createAndInitializeDB,
  closeMainDb
} from './db-testing.js';
import {
  dashStatistics,
  dashChanges,
  dashDataOverview,
  dashBenchmarksForProject
} from '../src/dashboard';
import { BenchmarkData } from '../src/api.js';
import { readFileSync } from 'fs';
import { getDirname } from '../src/util.js';

const __dirname = getDirname(import.meta.url);

import { getLast100Measurements } from '../src/backend/main/main.js';

const timeoutForLargeDataTest = 200 * 1000;
jest.setTimeout(timeoutForLargeDataTest);

describe('Test Dashboard on empty DB', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('dash_empty');
  });

  afterAll(async () => {
    return db.close();
  });

  it('Should get empty results request', async () => {
    const result = await getLast100Measurements(0, db);
    expect(result).toEqual([]);
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

describe('Test Dashboard with basic test data loaded', () => {
  let db: TestDatabase;
  let projectName: string;
  let baseBranch: string;
  let expName2: string;
  let expNameMerge: string;
  let numExperiments: number;

  // switch suites to use a template database

  beforeAll(async () => {
    db = await createAndInitializeDB('dash_basic', 25, true, false);

    const data = readFileSync(`${__dirname}/small-payload.json`).toString();
    const basicTestData: BenchmarkData = JSON.parse(data);
    projectName = basicTestData.projectName;

    await db.recordMetaDataAndRuns(basicTestData);
    await db.recordAllData(basicTestData);
    baseBranch = basicTestData.source.branchOrTag;
    db.setProjectBaseBranch(projectName, basicTestData.source.branchOrTag);

    // have a second experiment in the database
    basicTestData.experimentName += ' 2';
    expName2 = basicTestData.experimentName;
    basicTestData.startTime = '2019-12-14T22:49:56';
    basicTestData.source.branchOrTag = 'exp2';
    basicTestData.source.commitId = '2222222222222222222222222222222222222222';

    await db.recordMetaDataAndRuns(basicTestData);
    await db.recordAllData(basicTestData);

    // have a merge in the database
    basicTestData.experimentName += ' 3';
    expNameMerge = basicTestData.experimentName;
    basicTestData.startTime = '2019-12-15T22:49:56';
    basicTestData.source.branchOrTag = baseBranch;
    basicTestData.source.commitId = '3333333333333333333333333333333333333333';

    numExperiments = 3;

    await db.recordMetaDataAndRuns(basicTestData);
    await db.recordAllData(basicTestData);
  });

  afterAll(async () => {
    return db.close();
  });

  it('Should get a project', async () => {
    const projects = await db.getAllProjects();
    expect(projects).toHaveLength(2);
    expect(projects[0].name).toEqual('Small Example Project');
    expect(projects[0].id).toEqual(1);
  });

  it('Should get results', async () => {
    const results = await getLast100Measurements(1, db);
    const nBody = results[0];
    expect(nBody.benchmark).toEqual('NBody');
    expect(nBody.values).toHaveLength(numExperiments * 3);
    expect(nBody.values).toEqual([
      383.821, 432.783, 482.53, 383.821, 432.783, 482.53, 383.821, 432.783,
      482.53
    ]);
  });

  it('Should get statistics', async () => {
    const result = (await dashStatistics(db)).stats;
    expect(result.length).toBeGreaterThan(2);

    for (const table of result) {
      if (table.table === 'Measurements') {
        expect([
          '' + 3 * numExperiments,
          '' + (3 * numExperiments + 1),
          '' + (3 * numExperiments + 2)
        ]).toContain(table.cnt);
      } else if (table.table === 'Experiments') {
        expect(table.cnt).toEqual('' + (numExperiments + 1));
      } else if (table.table === 'Trials') {
        expect(['4', '5']).toContain(table.cnt);
      } else {
        expect({ name: table.table, cnt: table.cnt }).toEqual({
          name: table.table,
          cnt: '2' // includes the performance tracking
        });
      }
    }
  });

  it('Should get changes', async () => {
    const result = (await dashChanges(1, db)).changes;
    expect(result).toHaveLength(3);
    expect(result[0].commitid).toEqual(
      '3333333333333333333333333333333333333333'
    );
    expect(result[1].commitid).toEqual(
      '2222222222222222222222222222222222222222'
    );
    expect(result[2].commitid).toEqual(
      '58666d1c84c652306f930daa72e7a47c58478e86'
    );
  });

  it('Should get available data for DataOverview', async () => {
    await db.awaitQuiescentTimelineUpdater();
    const data = (await dashDataOverview(1, db)).data;
    expect(data).toHaveLength(numExperiments);

    expect(data[0].commitids).toEqual(
      '3333333333333333333333333333333333333333'
    );
    expect(data[0].expid).toEqual(4);
    expect(data[0].name).toEqual(expNameMerge);

    expect(data[1].commitids).toEqual(
      '2222222222222222222222222222222222222222'
    );
    expect(data[1].expid).toEqual(2);
    expect(data[1].name).toEqual(expName2);

    expect(data[2].commitids).toEqual(
      '58666d1c84c652306f930daa72e7a47c58478e86'
    );
    expect(data[2].expid).toEqual(1);
    expect(data[2].name).toEqual('Small Test Case');
  });

  it('Should get benchmarks for project', async () => {
    await db.awaitQuiescentTimelineUpdater();
    const data = (await dashBenchmarksForProject(db, 1)).benchmarks;
    expect(data).toHaveLength(1);
    expect(data[0].benchid).toEqual(1);
    expect(data[0].benchmark).toEqual('NBody');
  });

  it('Should get meta data for the timeline', async () => {
    await db.awaitQuiescentTimelineUpdater();
    const response = await db.getLatestBenchmarksForTimelineView(1);
    expect(response).toEqual([
      {
        exec: [
          {
            benchmarks: [
              {
                benchId: 1,
                benchName: 'NBody',
                cmdline:
                  'som -t1   core-lib/Benchmarks/Harness.ns NBody  1 0 10000',
                runId: 1,
                cores: '1',
                extraArgs: '1 0 10000',
                inputSize: null,
                varValue: null
              }
            ],
            execId: 1,
            execName: 'SOMns-graal'
          }
        ],
        suiteId: 1,
        suiteName: 'macro-startup'
      }
    ]);
  });

  it('Should get the timeline data for a run', async () => {
    await db.awaitQuiescentTimelineUpdater();
    const response = await db.getTimelineForRun(1, 1);

    expect(response?.sourceIds).toEqual([1, 4]);
    expect(response?.data[0]).toEqual([1576277396, 1576450196]);
    expect(response?.data[2]).toEqual([432.783, 432.783]);
  });

  it('Should determine a baseline commit for comparison', async () => {
    const baseline = await db.getBaselineCommit(
      projectName,
      '3333333333333333333333333333333333333333'
    );
    expect(baseline?.branchortag).toEqual(baseBranch);
    expect(baseline?.commitid).toEqual(
      '58666d1c84c652306f930daa72e7a47c58478e86'
    );
  });

  it('Should determine a changed commit for comparison', async () => {
    const source = await db.getSourceByNames(projectName, expName2);
    expect(source?.commitid).toEqual(
      '2222222222222222222222222222222222222222'
    );
    expect(source?.branchortag).toEqual('exp2');
  });

  // TODO
  // dashCompare
  // dashGetExpData
});

afterAll(async () => {
  return closeMainDb();
});
