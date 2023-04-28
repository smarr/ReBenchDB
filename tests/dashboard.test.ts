import { describe, expect, beforeAll, afterAll, it } from '@jest/globals';
import {
  TestDatabase,
  createAndInitializeDB,
  closeMainDb
} from './db-testing.js';
import {
  dashStatistics,
  dashResults,
  dashChanges,
  dashDataOverview,
  dashBenchmarksForProject
} from '../src/dashboard';
import {
  BenchmarkData,
  Criterion,
  DataPoint,
  Environment,
  Run,
  RunId,
  Source
} from '../src/api.js';
import { readFileSync } from 'fs';
import { getDirname, TotalCriterion } from '../src/util.js';

const __dirname = getDirname(import.meta.url);

import { jest } from '@jest/globals';

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
    const result = await dashResults(0, db);
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
    const results = await dashResults(1, db);
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

describe('dashResults', () => {
  const env: Environment = {
    hostName: 'Host1',
    cpu: 'Processor1',
    clockSpeed: 10,
    memory: 20,
    osType: 'OsType',
    software: [],
    userName: 'TestUser',
    manualRun: false
  };

  const source: Source = {
    repoURL: 'https://repo',
    branchOrTag: 'main',
    commitId: 'commit-1',
    commitMsg: 'commit msg 1',
    authorName: 'commit author',
    authorEmail: 'foo@bar',
    committerName: 'committer',
    committerEmail: 'bar@foo'
  };

  function createRunData(
    numRuns: number,
    numDataPoints: number,
    benchmark: string,
    suite: string,
    executor: string,
    runOffset = 0
  ): Run[] {
    const result: Run[] = [];

    const runId: RunId = {
      benchmark: {
        name: benchmark,
        runDetails: {
          maxInvocationTime: 1,
          minIterationTime: 1,
          warmup: null
        },
        suite: {
          name: suite,
          desc: null,
          executor: {
            name: executor,
            desc: null
          }
        }
      },
      cmdline: `${benchmark}-${suite}-${executor}`,
      location: '',
      varValue: null,
      cores: null,
      inputSize: null,
      extraArgs: null
    };

    for (let i = 0; i < numRuns; i += 1) {
      const d: DataPoint[] = [];
      for (let j = 1; j <= numDataPoints; j += 1) {
        d.push({
          in: i,
          it: j,
          m: [
            { c: 1, v: j + numDataPoints * (i + runOffset) },
            { c: 2, v: 100 + j + numDataPoints * (i + runOffset) }
          ]
        });
      }
      result.push({
        d,
        runId
      });
    }

    return result;
  }

  function createCriteria(): Criterion[] {
    return [
      { i: 1, c: TotalCriterion, u: 'ms' },
      { i: 2, c: 'somethingElse', u: 'ms' }
    ];
  }

  let db: TestDatabase;
  beforeAll(async () => {
    db = await createAndInitializeDB('dash_basic', 25, true, false);
  });

  afterAll(async () => {
    return db.close();
  });

  it(`should only consider the total criterion
      and get results in the correct order for trivial,
      single shot sets of measurements`, async () => {
    const trivialData: BenchmarkData = {
      env,
      source,
      experimentName: 'Exp 1',
      startTime: new Date('2022-01-01 10:00 UTC').toISOString(),
      projectName: 'Test dashResults trivial',
      data: createRunData(1, 200, 'trivial', 'test', 'testExec'),
      criteria: createCriteria()
    };
    await db.recordAllData(trivialData, true);

    const result = await dashResults(1, db);

    expect(result.length).toEqual(1);
    expect(result[0].benchmark).toEqual('trivial');
    expect(result[0].values.length).toEqual(100);

    for (let i = 0; i < 100; i += 1) {
      // only the last 100 results, so 101-200
      expect(result[0].values[i]).toEqual(i + 101);
    }
  });

  it(`should get results in the correct order for multiple invocations
      in the same trial`, async () => {
    const data4runs50it = {
      env,
      source,
      experimentName: 'Exp 2',
      startTime: new Date('2022-01-01 10:00 UTC').toISOString(),
      projectName: 'Test dashResults 4 runs 50 iterations',
      data: createRunData(4, 50, '4runs50it', 'test', 'testExec'),
      criteria: createCriteria()
    };
    await db.recordAllData(data4runs50it, true);

    const result = await dashResults(2, db);

    expect(result.length).toEqual(1);
    expect(result[0].benchmark).toEqual('4runs50it');
    expect(result[0].values.length).toEqual(100);

    for (let i = 0; i < 100; i += 1) {
      // only the last 100 results, so 101-200
      expect(result[0].values[i]).toEqual(i + 101);
    }
  });

  it(`should get results in the correct order for multiple trials
      of the same experiment`, async () => {
    let multiTrial = {
      env,
      source,
      experimentName: 'Exp 1',
      startTime: new Date('2022-01-01 10:00 UTC').toISOString(),
      projectName: 'Test multi-trial',
      data: createRunData(2, 25, 'multi-trial', 'test', 'testExec'),
      criteria: createCriteria()
    };
    await db.recordAllData(multiTrial, true);

    multiTrial = {
      env,
      source,
      experimentName: 'Exp 1',
      startTime: new Date('2022-01-01 12:00 UTC').toISOString(),
      projectName: 'Test multi-trial',
      data: createRunData(2, 25, 'multi-trial', 'test', 'testExec', 2),
      criteria: createCriteria()
    };
    await db.recordAllData(multiTrial, true);

    const result = await dashResults(3, db);

    expect(result.length).toEqual(1);
    expect(result[0].benchmark).toEqual('multi-trial');
    expect(result[0].values.length).toEqual(100);

    for (let i = 0; i < 100; i += 1) {
      expect(result[0].values[i]).toEqual(i + 1);
    }
  });

  function createData(expName: string, date: string, offset: number) {
    return {
      env,
      source,
      experimentName: expName,
      startTime: new Date(date).toISOString(),
      projectName: 'Test multi-exp',
      data: createRunData(2, 10, 'multi-exp', 'test', 'testExec', offset),
      criteria: createCriteria()
    };
  }

  it(`should get results in the correct order
      cross multiple experiments`, async () => {
    await db.recordAllData(
      createData('Exp 1', '2022-01-01 10:00 UTC', 0),
      true
    );
    await db.recordAllData(
      createData('Exp 1', '2022-01-01 12:00 UTC', 2),
      true
    );

    await db.recordAllData(
      createData('Exp 2', '2022-02-02 10:00 UTC', 4),
      true
    );
    await db.recordAllData(
      createData('Exp 2', '2022-02-02 12:00 UTC', 6),
      true
    );

    const result = await dashResults(4, db);

    expect(result.length).toEqual(1);
    expect(result[0].benchmark).toEqual('multi-exp');
    expect(result[0].values.length).toEqual(80);

    for (let i = 0; i < 80; i += 1) {
      expect(result[0].values[i]).toEqual(i + 1);
    }
  });
});

afterAll(async () => {
  return closeMainDb();
});
