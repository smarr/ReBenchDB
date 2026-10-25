import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from '../db/db-testing.js';
import { loadSmallPayload } from '../../payload.js';
import { collateMeasurements } from '../../../src/backend/compare/db-data.js';
import {
  calculateChangeStatsForBenchmark,
  type StatsForBenchmark
} from '../../../src/backend/compare/prep-data.js';
import { getCompareViewData } from '../../../src/backend/compare/report.js';
import type { ProcessedResult } from '../../../src/backend/db/types.js';
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

function payloadFor(
  commitId: string,
  experimentName: string,
  startTime: string,
  suiteName: string,
  details: RunDetails
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
  }
  return data;
}

async function getStatsForNBody(
  db: TestDatabase,
  base: string,
  change: string
): Promise<StatsForBenchmark> {
  const project = await db.getProjectBySlug(projectSlug);
  const results = await db.getMeasurementsForComparison(
    <number>project?.id,
    6, // only 6 chars of commitid in the results
    base,
    change
  );

  const collated = collateMeasurements(results);
  const nbody = <ProcessedResult>(
    collated.get('SOMns-graal')?.get('macro-startup')?.benchmarks.get('NBody')
  );

  const base6 = base.substring(0, 6);
  const change6 = change.substring(0, 6);
  // measurements of a pair are sorted by commit id
  const baseOffset = base6 < change6 ? 0 : 1;
  const changeOffset = 1 - baseOffset;
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

async function initDb(dbName: string) {
  const db = await createAndInitializeDB(dbName, 0, false);

  await db.recordAllData(
    payloadFor(
      oldCommit,
      'Old Config',
      '2024-06-07T16:22:40',
      'macro-old',
      oldDetails
    )
  );
  await db.recordAllData(
    payloadFor(
      baseCommit,
      'Base',
      '2024-12-03T10:29:02',
      'macro-startup',
      baseDetails
    )
  );
  await db.recordAllData(
    payloadFor(
      changeCommit,
      'Change',
      '2024-12-03T13:08:11',
      'macro-startup',
      changeDetails
    )
  );
  return db;
}

describe('suite names should be reflected as recorded at the commit', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await initDb('compare_report_suites');
  });

  afterAll(async () => {
    if (db) return db.close();
  });

  async function getSuitesByCommit(commit1: string, commit2: string) {
    const project = await db.getProjectBySlug(projectSlug);
    const results = await db.getMeasurementsForComparison(
      <number>project?.id,
      6,
      commit1,
      commit2
    );

    expect(results.length).toBeGreaterThan(0);
    const suitesByCommit = {};
    for (const r of results) {
      const suites = (suitesByCommit[r.commitid] ??= []);
      if (!suites.includes(r.suite)) {
        suites.push(r.suite);
      }
    }
    return suitesByCommit;
  }

  it('should only have the suites of base and change', async () => {
    const suites = await getSuitesByCommit(baseCommit, changeCommit);
    expect(suites).toEqual({
      bbbbbb: ['macro-startup'],
      cccccc: ['macro-startup']
    });
  });

  it('should keep have the suite name for the old commit', async () => {
    const suites = await getSuitesByCommit(oldCommit, baseCommit);
    expect(suites).toEqual({
      aaaaaa: ['macro-old'],
      bbbbbb: ['macro-startup']
    });
  });

  it('should keep runs of the old commit distinct', async () => {
    const project = await db.getProjectBySlug(projectSlug);
    const results = await db.getMeasurementsForComparison(
      <number>project?.id,
      6,
      oldCommit,
      baseCommit
    );

    const oldRunIds = new Set(
      results.filter((r) => r.commitid === 'aaaaaa').map((r) => r.runid)
    );
    const baseRunIds = new Set(
      results.filter((r) => r.commitid === 'bbbbbb').map((r) => r.runid)
    );
    expect(oldRunIds.size).toBeGreaterThan(0);
    expect(baseRunIds.size).toBe(oldRunIds.size);
    expect([...oldRunIds].filter((id) => baseRunIds.has(id))).toEqual([]);
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
  let db: TestDatabase;

  beforeAll(async () => {
    db = await initDb('compare_report_suites');
  });

  afterAll(async () => {
    if (db) return db.close();
  });

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
    await db.recordAllData(
      payloadFor(
        oldCommit,
        'Old Config',
        '2024-06-07T16:22:40',
        'macro-old',
        oldDetails
      )
    );

    expect(await getRunDetails()).toEqual([
      oldDetails,
      baseDetails,
      changeDetails
    ]);
  });

  it('should give each commit its own run settings', async () => {
    const project = await db.getProjectBySlug(projectSlug);
    const results = await db.getMeasurementsForComparison(
      <number>project?.id,
      6,
      baseCommit,
      changeCommit
    );

    const warmupByCommit: Record<string, (number | null)[]> = {};
    for (const r of results) {
      const warmups = (warmupByCommit[r.commitid] ??= []);
      if (!warmups.includes(r.warmup)) {
        warmups.push(r.warmup);
      }
    }
    expect(warmupByCommit).toEqual({ bbbbbb: [5], cccccc: [10] });
  });

  it('should not flag the runs as inconsistent in the report', async () => {
    const stats = await getStatsForNBody(db, baseCommit, changeCommit);

    expect(stats.stats).toHaveLength(1);
    expect(stats.stats[0].inconsistentRunIds).toBe(false);
  });
});

describe('pairing runs with changed run settings', () => {
  let db: TestDatabase;
  const base = 'dddddddddddddddddddddddddddddddddddddddd';
  const change = '9999999999999999999999999999999999999999';

  beforeAll(async () => {
    db = await createAndInitializeDB('compare_run_settings_pair', 0, false);
    await db.recordAllData(
      payloadFor(
        base,
        'Base',
        '2024-12-03T10:29:02',
        'macro-startup',
        baseDetails
      )
    );

    const changeData = payloadFor(
      change,
      'Change',
      '2024-12-03T13:08:11',
      'macro-startup',
      changeDetails
    );
    for (const run of changeData.data) {
      for (const dp of <DataPoint[]>run.d) {
        dp.m = dp.m.map((vs) => vs && vs.map((v) => v && 2 * v));
      }
    }
    await db.recordAllData(changeData);
  });

  afterAll(async () => {
    if (db) return db.close();
  });

  it('should compare base to change, not change to base', async () => {
    const stats = await getStatsForNBody(db, base, change);

    expect(stats.stats).toHaveLength(1);
    expect(stats.stats[0].inconsistentRunIds).toBe(false);

    // change is twice as slow as base
    const total = stats.stats[0].versionStats?.total;
    expect(total?.change_m).toBeCloseTo(1);
  });
});

afterAll(async () => {
  return closeMainDb();
});
