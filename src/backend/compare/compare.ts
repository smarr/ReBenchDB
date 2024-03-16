import { ParameterizedContext } from 'koa';

import { Database } from '../db/db.js';
import { completeRequest, startRequest } from '../perf-tracker.js';
import type {
  ProfileRow,
  WarmupDataForTrial,
  WarmupDataPerCriterion
} from '../../shared/view-types.js';
import { respondProjectNotFound } from '../common/standard-responses.js';
import { refreshSecret } from '../util.js';
import { deleteReport, renderCompare } from './report.js';
import { TimelineRequest } from '../../shared/api.js';

export async function getProfileAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const start = startRequest();

  ctx.body = await getProfile(
    Number(ctx.params.runId),
    ctx.params.commitId,
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
  commitId: number,
  db: Database
): Promise<ProfileRow[]> {
  const result = await db.query({
    name: 'fetchProfileDataByRunIdCommitId',
    text: `
          SELECT commitid,
            benchmark as bench, executor as exe, suite,
            cmdline, varValue, cores, inputSize, extraArgs,
            invocation, numIterations, warmup, value as profile
          FROM ProfileData
            JOIN Trial ON trialId = Trial.id
            JOIN Source USING (sourceId)
            JOIN Run ON runId = run.id
          WHERE runId = $1 AND source.commitId = $2`,
    values: [runId, commitId]
  });

  const data: ProfileRow[] = [];
  for (const row of result.rows) {
    try {
      row.profile = JSON.parse(row.profile);
    } catch (e) {
      /* let's just leave it as a string */
    }
    data.push(row);
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
    ctx.params.baseId,
    ctx.params.changeId,
    db
  );

  ctx.type = 'application/json';
  completeRequest(start, db, 'get-measurements');
}

async function getMeasurements(
  projectSlug: string,
  runId: number,
  baseCommitId: string,
  changeCommitId: string,
  db: Database
): Promise<WarmupDataForTrial[] | null> {
  const q = {
    name: 'fetchMeasurementsByProjectIdRunIdCommitId',
    text: `SELECT
              trialId, source.commitId as commitId,
              invocation, iteration, warmup,
              criterion.name as criterion,
              criterion.unit as unit,
              value
            FROM
              Measurement
              JOIN Trial ON trialId = Trial.id
              JOIN Source USING (sourceId)
              JOIN Experiment USING (expId)
              JOIN Criterion ON criterion = criterion.id
              JOIN Run ON runId = run.id
              JOIN Project ON Project.id = Experiment.projectId
            WHERE Project.slug = $1
              AND runId = $2
              AND (source.commitId = $3 OR source.commitId = $4)
            ORDER BY trialId, criterion, invocation, iteration;`,
    values: [projectSlug, runId, baseCommitId, changeCommitId]
  };
  const result = await db.query(q);
  if (result.rows.length === 0) {
    return null;
  }

  const dataPerTrial: WarmupDataForTrial[] = [];
  let currentTrial: WarmupDataForTrial | null = null;
  let lastCriterion = null;
  let critObject: WarmupDataPerCriterion | null = null;

  for (const r of result.rows) {
    if (currentTrial === null || currentTrial.trialId !== r.trialid) {
      currentTrial = {
        trialId: r.trialid,
        warmup: r.warmup,
        commitId: r.commitid,
        data: []
      };
      lastCriterion = null;
      dataPerTrial.push(currentTrial);
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
      // this is fine, because we separate the data by trialId
      if (critObject.values[r.invocation - 1] === undefined) {
        critObject.values[r.invocation - 1] = [];
      }

      critObject.values[r.invocation - 1][r.iteration - 1] = r.value;
    }
  }

  return dataPerTrial;
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

export async function renderComparePage(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const start = startRequest();

  const data = await renderCompare(
    ctx.params.baseline,
    ctx.params.change,
    ctx.params.projectSlug,
    db
  );
  ctx.body = data.content;
  ctx.type = 'html';

  if (data.inProgress) {
    ctx.set('Cache-Control', 'no-cache');
  }

  completeRequest(start, db, 'change');
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
