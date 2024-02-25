import { existsSync } from 'node:fs';
import {
  completeRequestAndHandlePromise,
  startRequest
} from '../perf-tracker.js';
import { dbConfig, siteConfig, storeJsonGzip } from '../util.js';
import { log } from '../logging.js';
import { Database } from '../db/db.js';
import { ParameterizedContext } from 'koa';

const expDataPreparation = new Map();

export async function getExpData(
  projectSlug: string,
  expId: number,
  db: Database,
  format: 'json' | 'csv'
): Promise<any> {
  const result = await db.getExperimentDetails(expId, projectSlug);

  let data: any;
  if (!result) {
    data = {
      project: '',
      generationFailed: true,
      stdout: 'Experiment was not found'
    };
  } else {
    data = result;
  }

  const expFilePrefix = `${data.project}-${expId}`;
  const expFileName = `${expFilePrefix}.${format}.gz`;

  if (existsSync(`${siteConfig.dataExportPath}/${expFileName}`)) {
    data.preparingData = false;
    data.downloadUrl = `${siteConfig.staticUrl}/${expFileName}`;
  } else {
    const expRequestId = `${expFilePrefix}-${format}`;
    data.currentTime = new Date().toISOString();

    const prevPrepDetails = expDataPreparation.get(expRequestId);

    // no previous attempt to prepare data
    if (!prevPrepDetails) {
      const start = startRequest();

      data.preparingData = true;

      const resultP =
        format === 'json'
          ? db.getExperimentMeasurements(expId)
          : db.storeExperimentMeasurements(
              expId,
              `${dbConfig.dataExportPath}/${expFileName}`
            );

      expDataPreparation.set(expRequestId, {
        inProgress: true
      });

      resultP
        .then(async (data: any[]) => {
          if (format === 'json') {
            await storeJsonGzip(
              data,
              `${siteConfig.dataExportPath}/${expFileName}`
            );
          }
          expDataPreparation.set(expRequestId, {
            inProgress: false
          });
        })
        .catch((error) => {
          log.error('Data preparation failed', error);
          expDataPreparation.set(expRequestId, {
            error,
            inProgress: false
          });
        })
        .finally(() =>
          completeRequestAndHandlePromise(start, db, 'prep-exp-data')
        );
    } else if (prevPrepDetails.error) {
      // if previous attempt failed
      data.generationFailed = true;
      data.preparingData = false;
    } else {
      data.preparingData = true;
    }
  }

  return data;
}

export async function getAvailableDataAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  ctx.body = await getDataOverview(Number(ctx.params.projectId), db);
  ctx.type = 'application/json';
}

export async function getDataOverview(
  projectId: number,
  db: Database
): Promise<{ data: any[] }> {
  const result = await db.query({
    name: 'fetchDataOverview',
    text: `
        SELECT
          exp.id as expId, exp.name, exp.description,
          min(t.startTime) as minStartTime,
          max(t.endTime) as maxEndTime,
          ARRAY_TO_STRING(ARRAY_AGG(DISTINCT t.username), ', ') as users,
          ARRAY_TO_STRING(ARRAY_AGG(DISTINCT src.commitId), ' ') as commitIds,
          ARRAY_TO_STRING(ARRAY_AGG(DISTINCT src.commitMessage), '\n\n')
            as commitMsgs,
          ARRAY_TO_STRING(ARRAY_AGG(DISTINCT env.hostName), ', ') as hostNames,

          -- Accessing measurements and timeline should give the same results,
          -- but the counting in measurements is of course a lot slower
          --	count(m.*) as measurements,
          --	count(DISTINCT m.runId) as runs
          SUM(tl.numSamples) as measurements,
          count(DISTINCT tl.runId) as runs
        FROM experiment exp
        JOIN Trial t         ON exp.id = t.expId
        JOIN Source src      ON t.sourceId = src.id
        JOIN Environment env ON env.id = t.envId

        --JOIN Measurement m   ON m.trialId = t.id
        JOIN Timeline tl     ON tl.trialId = t.id

        WHERE exp.projectId = $1

        GROUP BY exp.name, exp.description, exp.id
        ORDER BY minStartTime DESC;`,
    values: [projectId]
  });
  return { data: result.rows };
}
