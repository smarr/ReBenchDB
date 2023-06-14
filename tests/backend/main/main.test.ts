import { describe, expect, beforeAll, afterAll, it } from '@jest/globals';

import {
  BenchmarkData,
  Criterion,
  DataPoint,
  Environment,
  Run,
  RunId,
  Source
} from '../../../src/api.js';
import { TotalCriterion } from '../../../src/util.js';
import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from '../../db-testing.js';
import { getLast100Measurements } from '../../../src/backend/main/main.js';

describe('getLast100Measurements', () => {
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
      projectName: 'Test trivial',
      data: createRunData(1, 200, 'trivial', 'test', 'testExec'),
      criteria: createCriteria()
    };
    await db.recordAllData(trivialData, true);

    const result = await getLast100Measurements(1, db);

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
      projectName: 'Test 4 runs 50 iterations',
      data: createRunData(4, 50, '4runs50it', 'test', 'testExec'),
      criteria: createCriteria()
    };
    await db.recordAllData(data4runs50it, true);

    const result = await getLast100Measurements(2, db);

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

    const result = await getLast100Measurements(3, db);

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

    const result = await getLast100Measurements(4, db);

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
