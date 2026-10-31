import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from '../db/db-testing.js';
import { loadSmallPayload } from '../../payload.js';
import type {
  BenchmarkData,
  TimelineRequest
} from '../../../src/shared/api.js';

/**
 * Timelines should continue across changes of the run settings,
 * i.e., avoid splitting into separate timelines,
 * as long as the command line is the same.
 */

const projectSlug = 'Small-Example-Project';

const oldCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const baseCommit = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const changeCommit = 'cccccccccccccccccccccccccccccccccccccccc';

const oldTime = 1717777360; // 2024-06-07T16:22:40Z
const baseTime = 1733221742; // 2024-12-03T10:29:02Z
const changeTime = 1733231291; // 2024-12-03T13:08:11Z

function payloadFor(
  commitId: string,
  startTime: number,
  suiteName: string,
  warmup: number | null,
  location: string
): BenchmarkData {
  const data = loadSmallPayload();
  data.source.commitId = commitId;
  data.experimentName = `Exp ${commitId}`;
  data.startTime = new Date(startTime * 1000).toISOString();
  for (const run of data.data) {
    run.runId.benchmark.suite.name = suiteName;
    run.runId.benchmark.runDetails.warmup = warmup;
    run.runId.location = location;
  }
  return data;
}

let db: TestDatabase;
let projectId: number;
let projectName: string;

beforeAll(async () => {
  db = await createAndInitializeDB('timeline_run_settings', 25, true, false);

  const old = payloadFor(oldCommit, oldTime, 'macro-old', null, '/old');
  projectName = old.projectName;

  await db.recordAllData(old);
  await db.recordAllData(
    payloadFor(baseCommit, baseTime, 'macro-startup', 5, '/old')
  );
  await db.recordAllData(
    payloadFor(changeCommit, changeTime, 'macro-startup', 10, '/new')
  );
  await db.setProjectBaseBranch(projectName, old.source.branchOrTag);
  await db.awaitQuiescentTimelineUpdater();

  const project = await db.getProjectBySlug(projectSlug);
  projectId = <number>project?.id;
});

afterAll(async () => {
  if (db) await db.close();
  return closeMainDb();
});

async function getRunIdOf(commitId: string): Promise<number> {
  const result = await db.query({
    text: `SELECT DISTINCT runId FROM Timeline
            JOIN Trial ON trialId = Trial.id
            JOIN Source ON source.id = trial.sourceId
          WHERE source.commitId = $1`,
    values: [commitId]
  });
  expect(result.rows).toHaveLength(1);
  return result.rows[0].runid;
}

describe('timelines for runs with changed run settings', () => {
  it('should have distinct runs for each commit', async () => {
    const runIds = new Set([
      await getRunIdOf(oldCommit),
      await getRunIdOf(baseCommit),
      await getRunIdOf(changeCommit)
    ]);
    expect(runIds.size).toEqual(3);
  });

  it('should list the latest run in the timeline overview', async () => {
    const suites = await db.getLatestBenchmarksForTimelineView(projectId);
    const benchmarks = suites?.flatMap((s) =>
      s.exec.flatMap((e) => e.benchmarks)
    );

    expect(benchmarks).toHaveLength(1);
    expect(benchmarks?.[0].runId).toEqual(await getRunIdOf(changeCommit));
  });

  it('should include all data with the same cmdline for a run', async () => {
    const runId = await getRunIdOf(changeCommit);
    const timeline = await db.getTimelineForRun(projectId, runId);

    expect(timeline?.data[0]).toEqual([oldTime, baseTime, changeTime]);
  });

  it('should include all data of the cmdline in comparisons', async () => {
    const request: TimelineRequest = {
      baseline: baseCommit,
      change: changeCommit,
      runId: await getRunIdOf(changeCommit),
      b: 'NBody',
      e: 'SOMns-graal',
      s: 'macro-startup'
    };
    const timeline = await db.getTimelineData(projectName, request);

    expect(timeline?.data[0]).toEqual([oldTime, baseTime, changeTime]);
  });
});
