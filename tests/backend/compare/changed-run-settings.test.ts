import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from '../db/db-testing.js';
import { readFileSync } from 'node:fs';

import { loadSmallPayload } from '../../payload.js';
import { robustPath } from '../../../src/backend/util.js';
import {
  getMeasurements as getWarmupMeasurements,
  getProfile
} from '../../../src/backend/compare/compare.js';
import { collateMeasurements } from '../../../src/backend/compare/db-data.js';
import {
  calculateChangeStatsForBenchmark,
  getCommitOffsetsInSortedMeasurements,
  type StatsForBenchmark
} from '../../../src/backend/compare/prep-data.js';
import { getCompareViewData } from '../../../src/backend/compare/report.js';
import type {
  MeasurementData,
  ProcessedResult
} from '../../../src/backend/db/types.js';
import type {
  BenchmarkData,
  DataPoint,
  RunDetails as ApiRunDetails
} from '../../../src/shared/api.js';
import type { CompareViewWithData } from '../../../src/shared/view-types.js';

const projectSlug = 'Small-Example-Project';

interface RunDetails extends ApiRunDetails {
  location: string;
}

const oldCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const baseCommit = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const changeCommit = 'cccccccccccccccccccccccccccccccccccccccc';

// a second pair, where base sorts after change,
// and change is twice as slow as base
const pairBaseCommit = 'dddddddddddddddddddddddddddddddddddddddd';
const pairChangeCommit = '9999999999999999999999999999999999999999';

const oldDetails: RunDetails = {
  warmup: null,
  maxInvocationTime: 600,
  minIterationTime: 5,
  location: '/old/location'
};

const baseDetails: RunDetails = {
  warmup: 5,
  maxInvocationTime: 600,
  minIterationTime: 5,
  location: '/old/location'
};

const changeDetails: RunDetails = {
  warmup: 10,
  maxInvocationTime: 1200,
  minIterationTime: 10,
  location: '/new/location'
};

type Recording = [
  commitId: string,
  experimentName: string,
  startTime: string,
  suiteName: string,
  details: RunDetails,
  factor?: number
];

const oldRecording: Recording = [
  oldCommit,
  'Old Config',
  '2024-06-07T16:22:40',
  'macro-old',
  oldDetails
];

const recordings: Recording[] = [
  oldRecording,
  [baseCommit, 'Base', '2024-12-03T10:29:02', 'macro-startup', baseDetails],
  [
    changeCommit,
    'Change',
    '2024-12-03T13:08:11',
    'macro-startup',
    changeDetails
  ],
  [
    pairBaseCommit,
    'Pair Base',
    '2024-12-04T10:29:02',
    'macro-startup',
    baseDetails
  ],
  [
    pairChangeCommit,
    'Pair Change',
    '2024-12-04T13:08:11',
    'macro-startup',
    changeDetails,
    2
  ]
];

function payloadFor(
  commitId: string,
  experimentName: string,
  startTime: string,
  suiteName: string,
  details: RunDetails,
  factor = 1
): BenchmarkData {
  const data = loadSmallPayload();
  data.source.commitId = commitId;
  data.experimentName = experimentName;
  data.startTime = startTime;
  for (const run of data.data) {
    run.runId.benchmark.suite.name = suiteName;

    run.runId.location = details.location;
    run.runId.benchmark.runDetails.warmup = details.warmup;
    run.runId.benchmark.runDetails.maxInvocationTime =
      details.maxInvocationTime;
    run.runId.benchmark.runDetails.minIterationTime = details.minIterationTime;

    if (factor !== 1) {
      for (const dp of <DataPoint[]>run.d) {
        dp.m = dp.m.map((vs) => vs && vs.map((v) => v && factor * v));
      }
    }
  }
  return data;
}

let db: TestDatabase;

beforeAll(async () => {
  db = await createAndInitializeDB('compare_run_settings', 0, false);
  for (const recording of recordings) {
    await db.recordAllData(payloadFor(...recording));
  }
});

afterAll(async () => {
  if (db) await db.close();
  return closeMainDb();
});

async function getMeasurements(
  commit1: string,
  commit2: string
): Promise<MeasurementData[]> {
  const project = await db.getProjectBySlug(projectSlug);
  return db.getMeasurementsForComparison(
    <number>project?.id,
    6, // only 6 chars of commitid in the results
    commit1,
    commit2
  );
}

/** Collect the distinct values of a column for each commit. */
function distinctByCommit<T>(
  results: MeasurementData[],
  get: (r: MeasurementData) => T
): Record<string, T[]> {
  const byCommit: Record<string, T[]> = {};
  for (const r of results) {
    const values = (byCommit[r.commitid] ??= []);
    const v = get(r);
    if (!values.includes(v)) {
      values.push(v);
    }
  }
  return byCommit;
}

async function getStatsForNBody(
  base: string,
  change: string
): Promise<StatsForBenchmark> {
  const collated = collateMeasurements(await getMeasurements(base, change));
  const nbody = <ProcessedResult>(
    collated.get('SOMns-graal')?.get('macro-startup')?.benchmarks.get('NBody')
  );

  const base6 = base.substring(0, 6);
  const change6 = change.substring(0, 6);
  const { baseOffset, changeOffset } = getCommitOffsetsInSortedMeasurements(
    base6,
    change6
  );
  return calculateChangeStatsForBenchmark(
    nbody,
    null,
    base6,
    change6,
    baseOffset,
    changeOffset,
    null,
    0
  );
}

describe('suite names should be reflected as recorded at the commit', () => {
  it('should only have the suites of base and change', async () => {
    const results = await getMeasurements(baseCommit, changeCommit);
    expect(distinctByCommit(results, (r) => r.suite)).toEqual({
      bbbbbb: ['macro-startup'],
      cccccc: ['macro-startup']
    });
  });

  it('should keep the suite name for the old commit', async () => {
    const results = await getMeasurements(oldCommit, baseCommit);
    expect(distinctByCommit(results, (r) => r.suite)).toEqual({
      aaaaaa: ['macro-old'],
      bbbbbb: ['macro-startup']
    });
  });

  it('should keep runs of the old commit distinct', async () => {
    const results = await getMeasurements(oldCommit, baseCommit);
    const runIds = distinctByCommit(results, (r) => r.runid);

    expect(runIds.aaaaaa.length).toBeGreaterThan(0);
    expect(runIds.bbbbbb).toHaveLength(runIds.aaaaaa.length);
    expect(runIds.aaaaaa.filter((id) => runIds.bbbbbb.includes(id))).toEqual(
      []
    );
  });

  it('should only show the suites of base and change', async () => {
    const view = <CompareViewWithData>(
      await getCompareViewData(baseCommit, changeCommit, projectSlug, db)
    );

    expect(view.revisionFound).toBe(true);
    expect(view.navigation.nav).toEqual([
      { exeName: 'SOMns-graal', suites: ['macro-startup'] }
    ]);
  });

  it('should show the old suite name for the old commit', async () => {
    const view = <CompareViewWithData>(
      await getCompareViewData(oldCommit, baseCommit, projectSlug, db)
    );

    expect(view.revisionFound).toBe(true);
    expect(view.navigation.nav).toEqual([
      { exeName: 'SOMns-graal', suites: ['macro-old', 'macro-startup'] }
    ]);
  });
});

describe('run settings as recorded at the commit', () => {
  async function getRunDetails(): Promise<RunDetails[]> {
    const result = await db.query({
      text: `SELECT warmup, maxInvocationTime, minIterationTime, location
              FROM Run ORDER BY id`
    });
    return result.rows.map((r) => ({
      warmup: r.warmup,
      maxInvocationTime: r.maxinvocationtime,
      minIterationTime: r.miniterationtime,
      location: r.location
    }));
  }

  it('should record a run for each distinct set of run settings', async () => {
    expect(await getRunDetails()).toEqual([
      oldDetails,
      baseDetails,
      changeDetails
    ]);
  });

  it('should reuse runs with null settings when recorded again', async () => {
    db.clearCache();
    await db.recordAllData(payloadFor(...oldRecording));

    expect(await getRunDetails()).toEqual([
      oldDetails,
      baseDetails,
      changeDetails
    ]);
  });

  it('should give each commit its own run settings', async () => {
    const results = await getMeasurements(baseCommit, changeCommit);
    expect(distinctByCommit(results, (r) => r.warmup)).toEqual({
      bbbbbb: [5],
      cccccc: [10]
    });
  });

  it('should flag the runs as inconsistent in the report', async () => {
    const stats = await getStatsForNBody(baseCommit, changeCommit);

    expect(stats.stats).toHaveLength(1);
    expect(stats.stats[0].inconsistentRunCfg).toBe(true);
  });
});

describe('pairing runs with changed run settings', () => {
  it('should compare base to change, not change to base', async () => {
    const stats = await getStatsForNBody(pairBaseCommit, pairChangeCommit);

    expect(stats.stats).toHaveLength(1);
    expect(stats.stats[0].inconsistentRunCfg).toBe(true);

    // change is twice as slow as base
    const total = stats.stats[0].versionStats?.total;
    expect(total?.change_m).toBeCloseTo(1);
  });
});

describe('warmup data for runs with changed run settings', () => {
  it('should give base and change data with the runId of the row', async () => {
    const stats = await getStatsForNBody(baseCommit, changeCommit);
    const runId = stats.stats[0].details.runId;

    const results = await getWarmupMeasurements(
      projectSlug,
      runId,
      baseCommit,
      changeCommit,
      db
    );

    const commitIds = new Set(results?.map((t) => t.commitId));
    expect(commitIds).toEqual(new Set([baseCommit, changeCommit]));
  });
});

describe('profiles for runs with changed run settings', () => {
  const profBaseCommit = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  const profChangeCommit = 'ffffffffffffffffffffffffffffffffffffffff';

  function profilePayloadFor(
    commitId: string,
    startTime: string,
    warmup: number
  ): BenchmarkData {
    const data: BenchmarkData = JSON.parse(
      readFileSync(robustPath('../tests/data/profile-payload.json')).toString()
    );
    data.source.commitId = commitId;
    data.experimentName = `Profile ${commitId}`;
    data.startTime = startTime;
    for (const run of data.data) {
      run.runId.benchmark.runDetails.warmup = warmup;
    }
    return data;
  }

  beforeAll(async () => {
    await db.recordAllData(
      profilePayloadFor(profBaseCommit, '2024-12-05T10:00:00', 5)
    );
    await db.recordAllData(
      profilePayloadFor(profChangeCommit, '2024-12-05T12:00:00', 10)
    );
  });

  async function getProfileRunIds(commitId: string): Promise<number[]> {
    const result = await db.query({
      text: `SELECT DISTINCT runId FROM ProfileData
              JOIN Trial ON trialId = Trial.id
              JOIN Source ON source.id = trial.sourceId
            WHERE source.commitId = $1
            ORDER BY runId`,
      values: [commitId]
    });
    return result.rows.map((r) => r.runid);
  }

  it('should have recorded distinct runs for base and change', async () => {
    const baseRunIds = await getProfileRunIds(profBaseCommit);
    const changeRunIds = await getProfileRunIds(profChangeCommit);

    expect(baseRunIds).toHaveLength(2);
    expect(changeRunIds).toHaveLength(2);
    expect(baseRunIds.filter((id) => changeRunIds.includes(id))).toEqual([]);
  });

  it('should give profiles of both commits with the row runId', async () => {
    const [runId] = await getProfileRunIds(profBaseCommit);

    const baseProfiles = await getProfile(runId, profBaseCommit, db);
    const changeProfiles = await getProfile(runId, profChangeCommit, db);

    expect(baseProfiles).toHaveLength(1);
    expect(changeProfiles).toHaveLength(1);
    expect(changeProfiles[0].cmdline).toEqual(baseProfiles[0].cmdline);
  });
});
