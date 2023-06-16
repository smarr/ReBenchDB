import { ParameterizedContext } from 'koa';

import { Database } from '../db/db.js';
import { completeRequest, startRequest } from '../../perf-tracker.js';
import type {
  WarmupData,
  WarmupDataForTrial,
  WarmupDataPerCriterion
} from '../../views/view-types.js';
import { respondProjectNotFound } from '../common/standard-responses.js';
import { dbConfig, refreshSecret } from '../util.js';
import { prepareTemplate, processTemplate } from '../../templates.js';
import { deleteReport, renderCompare, renderCompareNew } from './report.js';
import * as dataFormatters from '../../shared/data-format.js';
import * as viewHelpers from '../../views/helpers.js';
import { TimelineRequest } from '../../shared/api.js';

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

export async function getTimelineDataAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const timelineRequest = <TimelineRequest>ctx.request.body;
  const result = await db.getTimelineData(
    ctx.params.projectName,
    timelineRequest
  );
  if (result === null) {
    ctx.body = { error: 'Requested data was not found' };
    ctx.status = 404;
  } else {
    ctx.body = result;
    ctx.status = 200;
  }
  ctx.type = 'json';
}

/**
 * @deprecated remove for 1.0
 */
export async function redirectToNewCompareUrl(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const project = await db.getProjectByName(ctx.params.project);
  if (project) {
    ctx.redirect(
      `/${project.slug}/compare/${ctx.params.baseline}..${ctx.params.change}`
    );
  } else {
    respondProjectNotFound(ctx, ctx.params.project);
  }
}

/**
 * @deprecated remove once the new compare page is feature complete
 */
export async function renderComparePage(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const start = startRequest();

  const data = await renderCompare(
    ctx.params.baseline,
    ctx.params.change,
    ctx.params.projectSlug,
    dbConfig,
    db
  );
  ctx.body = processTemplate('compare.html', data);
  ctx.type = 'html';

  if (data.generatingReport) {
    ctx.set('Cache-Control', 'no-cache');
  }

  completeRequest(start, db, 'change');
}

const compareTpl = prepareTemplate('compare-new.html');

export async function renderComparePageNew(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const start = startRequest();

  const data = await renderCompareNew(
    ctx.params.baseline,
    ctx.params.change,
    ctx.params.projectSlug,
    dbConfig,
    db
  );
  ctx.body = compareTpl({ ...data, dataFormatters, viewHelpers });
  ctx.type = 'html';

  completeRequest(start, db, 'change-new');
}

export async function deleteCachedReport(
  ctx: ParameterizedContext
): Promise<void> {
  ctx.type = 'text';

  if (refreshSecret === undefined) {
    ctx.body = 'ReBenchDB is not configured to accept refresh requests.';
    ctx.status = 503;
    return;
  }

  if (ctx.request.body.password === refreshSecret) {
    const project = ctx.params.project;
    const base = ctx.params.baseline;
    const change = ctx.params.change;
    deleteReport(project, base, change);

    ctx.body = `Refresh requests accepted for
        Project:  ${project}
        Baseline: ${base}
        Change:   ${change}
        `;
    ctx.status = 303;
    ctx.redirect(`/compare/${project}/${base}/${change}`);
  } else {
    ctx.body = 'Incorrect authentication.';
    ctx.status = 403;
  }
}
