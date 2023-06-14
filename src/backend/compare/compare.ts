import { ParameterizedContext } from 'koa';

import { Database } from '../../db.js';
import { completeRequest, startRequest } from '../../perf-tracker.js';
import type {
  WarmupData,
  WarmupDataForTrial,
  WarmupDataPerCriterion
} from '../../views/view-types.js';

export async function getProfileAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const start = startRequest();

  ctx.body = await getProfile(
    Number(ctx.params.runId),
    Number(ctx.params.trialId),
    db
  );
  if (ctx.body === undefined) {
    ctx.status = 404;
    ctx.body = {};
  }
  ctx.type = 'application/json';
  completeRequest(start, db, 'get-profiles');
}

async function getProfile(
  runId: number,
  trialId: number,
  db: Database
): Promise<any> {
  const result = await db.query({
    name: 'fetchProfileDataByRunIdTrialId',
    text: `
          SELECT substring(commitId, 1, 6) as commitid,
            benchmark.name as bench, executor.name as exe, suite.name as suite,
            cmdline, varValue, cores, inputSize, extraArgs,
            invocation, numIterations, warmup, value as profile
          FROM ProfileData
            JOIN Trial ON trialId = Trial.id
            JOIN Experiment ON expId = Experiment.id
            JOIN Source ON source.id = sourceId
            JOIN Run ON runId = run.id
            JOIN Suite ON suiteId = suite.id
            JOIN Benchmark ON benchmarkId = benchmark.id
            JOIN Executor ON execId = executor.id
          WHERE runId = $1 AND trialId = $2`,
    values: [runId, trialId]
  });

  const data = result.rows[0];
  try {
    data.profile = JSON.parse(data.profile);
  } catch (e) {
    /* let's just leave it as a string */
  }
  return data;
}

export async function getMeasurementsAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const start = startRequest();

  ctx.body = await getMeasurements(
    ctx.params.projectSlug,
    Number(ctx.params.runId),
    Number(ctx.params.trialId1),
    Number(ctx.params.trialId2),
    db
  );

  ctx.type = 'application/json';
  completeRequest(start, db, 'get-measurements');
}

async function getMeasurements(
  projectSlug: string,
  runId: number,
  trialId1: number,
  trialId2: number,
  db: Database
): Promise<WarmupData | null> {
  const q = {
    name: 'fetchMeasurementsByProjectIdRunIdTrialId',
    text: `SELECT
              trialId,
              invocation, iteration, warmup,
              criterion.name as criterion,
              criterion.unit as unit,
              value
            FROM
              Measurement
              JOIN Trial ON trialId = Trial.id
              JOIN Experiment ON Trial.expId = Experiment.id
              JOIN Criterion ON criterion = criterion.id
              JOIN Run ON runId = run.id
              JOIN Project ON Project.id = Experiment.projectId
            WHERE Project.slug = $1
              AND runId = $2
              AND (trialId = $3 OR trialId = $4)
            ORDER BY trialId, criterion, invocation, iteration;`,
    values: [projectSlug, runId, trialId1, trialId2]
  };
  const result = await db.query(q);
  if (result.rows.length === 0) {
    return null;
  }

  const trial1: WarmupDataForTrial = {
    trialId: result.rows[0].trialid,
    warmup: result.rows[0].warmup,
    data: []
  };
  const trial2: WarmupDataForTrial = {
    trialId: result.rows[result.rows.length - 1].trialid,
    warmup: result.rows[result.rows.length - 1].warmup,
    data: []
  };
  // preprocess rows, but should already have it like this in the database...

  let trialId = 0;
  let currentTrial: WarmupDataForTrial | null = null;
  let lastCriterion = null;
  let critObject: WarmupDataPerCriterion | null = null;

  for (const r of result.rows) {
    if (trialId === 0) {
      trialId = r.trialid;
      currentTrial = trial1;
      lastCriterion = null;
    } else if (trialId !== r.trialid) {
      if (currentTrial === trial2) {
        throw Error(
          'Unexpected trialId change. We only expect two different ones.'
        );
      }
      trialId = r.trialid;
      currentTrial = trial2;
      lastCriterion = null;
    }

    if (lastCriterion === null || lastCriterion !== r.criterion) {
      lastCriterion = r.criterion;
      critObject = {
        criterion: r.criterion,
        unit: r.unit,
        values: []
      };
      currentTrial?.data.push(critObject);
    }

    if (critObject) {
      if (critObject.values[r.invocation - 1] === undefined) {
        critObject.values[r.invocation - 1] = [];
      }

      critObject.values[r.invocation - 1][r.iteration - 1] = r.value;
    }
  }

  return { trial1, trial2 };
}
