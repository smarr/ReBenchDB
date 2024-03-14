import { ParameterizedContext } from 'koa';
import { QueryConfig } from 'pg';

import {
  TotalCriterion,
  isReBenchDotDev,
  rebenchVersion,
  robustPath
} from '../util.js';
import { prepareTemplate } from '../templates.js';
import { completeRequest, startRequest } from '../perf-tracker.js';
import { AllResults } from '../../shared/api.js';
import { Database } from '../db/db.js';
import { TimedCacheValidity } from '../db/timed-cache-validity.js';

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
  const start = startRequest();

  ctx.body = await getLast100Measurements(Number(ctx.params.projectId), db);
  ctx.type = 'application/json';

  completeRequest(start, db, 'get-results');
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
    text: ` WITH Results AS (
              SELECT
                    value, benchmark,
                    rank() OVER (
                      PARTITION BY benchmark
                      ORDER BY
                        t.startTime DESC,
                        m.invocation DESC,
                        m.iteration DESC
                    )
                    FROM Measurement m
                      JOIN Trial t ON  m.trialId = t.id
                      JOIN Experiment e ON t.expId = e.id
                      JOIN Run r ON m.runId = r.id
                      JOIN Criterion c USING (critId)
                    WHERE projectId = $1 AND
                      c.name = '${TotalCriterion}'
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
            GROUP BY benchmark;`,
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
  ctx.body = await getChanges(Number(ctx.params.projectId), db);
  ctx.type = 'application/json';
}

export async function getChanges(
  projectId: number,
  db: Database
): Promise<{ changes: any[] }> {
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
