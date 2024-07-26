import { ParameterizedContext } from 'koa';
import { QueryConfig } from 'pg';

import {
  TotalCriterion,
  isReBenchDotDev,
  rebenchVersion,
  robustPath
} from '../util.js';
import { prepareTemplate } from '../templates.js';
import {
  completeRequestAndHandlePromise,
  startRequest
} from '../perf-tracker.js';
import type { AllResults } from '../../shared/api.js';
import type { ChangesResponse } from '../../shared/view-types.js';
import { Database } from '../db/db.js';
import { TimedCacheValidity } from '../db/timed-cache-validity.js';
import { getNumberOrError } from '../request-check.js';
import { log } from '../logging.js';

const mainTpl = prepareTemplate(robustPath('backend/main/index.html'), false);

export async function renderMainPage(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const projects = await db.getAllProjects();
  ctx.body = mainTpl({
    projects,
    isReBenchDotDev: isReBenchDotDev()
  });
  ctx.type = 'html';
}

export async function getLast100MeasurementsAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  ctx.type = 'application/json';

  const projectId = getNumberOrError(ctx, 'projectId');
  if (projectId === null) {
    log.error((ctx.body as any).error);
    return;
  }

  const start = startRequest();
  ctx.body = await getLast100Measurements(projectId, db);
  completeRequestAndHandlePromise(start, db, 'get-results');
}

const resultsCache: AllResults[][] = [];
let resultsCacheValid: TimedCacheValidity | null = null;

export async function getLast100Measurements(
  projectId: number,
  db: Database
): Promise<AllResults[]> {
  if (
    resultsCache[projectId] &&
    resultsCacheValid !== null &&
    resultsCacheValid.isValid()
  ) {
    return resultsCache[projectId];
  }

  if (resultsCacheValid === null || !resultsCacheValid.isValid()) {
    resultsCache.length = 0;
  }
  resultsCacheValid = db.getStatsCacheValidity();

  const q: QueryConfig = {
    name: 'all-results',
    text: ` WITH OrderedMeasurement AS (
              SELECT
                  runId, trialId, criterion, invocation, values
                FROM Measurement m
                  JOIN Trial t ON  m.trialId = t.id
                  JOIN Experiment e ON t.expId = e.id
                  JOIN Criterion c ON m.criterion = c.id
                WHERE e.projectId = $1 AND
                  c.name = '${TotalCriterion}'
                ORDER BY m.runId, m.trialId, m.criterion, m.invocation ASC
            ),
            ExplodedValueMeasurement AS (
              SELECT m.runId, m.trialId, m.criterion,
                     m.invocation, a.value, a.iteration
              FROM OrderedMeasurement as m
                LEFT JOIN LATERAL unnest(m.values)
                  WITH ORDINALITY AS a(value, iteration) ON true
            ),
            Results AS (
              SELECT t.startTime, m.iteration, value, benchmark,
                  rank() OVER (
                    PARTITION BY benchmark
                    ORDER BY
                      t.startTime DESC,
                      m.invocation DESC,
                      m.iteration DESC
                  )
                  FROM ExplodedValueMeasurement m
                    JOIN Trial t ON m.trialId = t.id
                    JOIN Run r   ON m.runId = r.id
                  ORDER BY t.startTime, m.invocation, m.iteration
            ),
            LastHundred AS (
              SELECT rank, value, benchmark
              FROM Results
              WHERE rank <= 100
              ORDER BY benchmark, rank DESC
            )
            SELECT array_agg(value) as values, benchmark
              FROM LastHundred
              GROUP BY benchmark`,
    values: [projectId]
  };
  const result = await db.query(q);
  resultsCache[projectId] = result.rows;
  return resultsCache[projectId];
}

export async function getSiteStatsAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  ctx.body = await getStatistics(db);
  ctx.type = 'application/json';
}

let statisticsCache: { stats: any[]; version: number } | null = null;
let statsCacheValid: TimedCacheValidity | null = null;

export function statsCache(): TimedCacheValidity | null {
  return statsCacheValid;
}

export async function getStatistics(
  db: Database
): Promise<{ stats: any[]; version: number }> {
  if (
    statisticsCache !== null &&
    statsCacheValid !== null &&
    statsCacheValid.isValid()
  ) {
    return statisticsCache;
  }

  statsCacheValid = db.getStatsCacheValidity();

  const result = await db.query({
    name: 'fetchStats',
    text: `
        SELECT * FROM (
          SELECT 'Experiments' as table, count(*) as cnt FROM experiment
          UNION ALL
          SELECT 'Trials' as table, count(*) as cnt FROM trial
          UNION ALL
          SELECT 'Projects' as table, count(*) as cnt FROM project
          UNION ALL
          SELECT 'Environments' as table, count(*) as cnt FROM environment
          UNION ALL
          SELECT 'Runs' as table, count(*) as cnt FROM run
          UNION ALL
          SELECT 'Measurements' as table, count(*) as cnt FROM measurement
        ) as counts
        ORDER BY counts.table`
  });
  statisticsCache = { stats: result.rows, version: rebenchVersion };
  return statisticsCache;
}

export async function getChangesAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  ctx.type = 'application/json';

  const projectId = getNumberOrError(ctx, 'projectId');
  if (projectId === null) {
    log.error((ctx.body as any).error);
    return;
  }

  ctx.body = await getChanges(projectId, db);
}

export async function getChanges(
  projectId: number,
  db: Database
): Promise<ChangesResponse> {
  const result = await db.query({
    name: 'fetchAllChangesByProjectId',
    text: ` SELECT commitId, branchOrTag, projectId, repoURL, commitMessage,
                max(startTime) as experimentTime
            FROM experiment
            JOIN Trial ON expId = experiment.id
            JOIN Source ON sourceId = source.id
            JOIN Project ON projectId = project.id
            WHERE project.id = $1
            GROUP BY commitId, branchOrTag, projectId, repoURL, commitMessage
            ORDER BY max(startTime) DESC`,
    values: [projectId]
  });
  return { changes: result.rows };
}
