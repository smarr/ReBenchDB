import { ParameterizedContext } from 'koa';
import { QueryConfig } from 'pg';

import { db } from '../db/db-instance.js';
import { TotalCriterion, isReBenchDotDev } from '../../util.js';
import { processTemplate } from '../../templates.js';
import { completeRequest, startRequest } from '../../perf-tracker.js';
import { AllResults } from '../../api.js';
import { Database, TimedCacheValidity } from '../../db.js';

export async function renderMainPage(ctx: ParameterizedContext): Promise<void> {
  const projects = await db.getAllProjects();
  ctx.body = processTemplate('../backend/main/index.html', {
    projects,
    isReBenchDotDev: isReBenchDotDev()
  });
  ctx.type = 'html';
}

export async function getLast100MeasurementsAsJson(
  ctx: ParameterizedContext
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
                    value, b.name as benchmark,
                    rank() OVER (
                      PARTITION BY b.id
                      ORDER BY
                        t.startTime DESC,
                        m.invocation DESC,
                        m.iteration DESC
                    )
                    FROM Measurement m
                      JOIN Trial t ON  m.trialId = t.id
                      JOIN Experiment e ON t.expId = e.id
                      JOIN Run r ON m.runId = r.id
                      JOIN Benchmark b ON r.benchmarkId = b.id
                      JOIN Criterion c ON m.criterion = c.id
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
