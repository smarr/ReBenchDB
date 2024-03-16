import { existsSync } from 'node:fs';
import { completeRequest, startRequest } from '../perf-tracker.js';
import { robustPath, siteConfig, storeJsonGzip } from '../util.js';
import { log } from '../logging.js';
import { Database } from '../db/db.js';
import { ParameterizedContext } from 'koa';

const expDataPreparation = new Map();

export async function getExpData(
  projectSlug: string,
  expId: number,
  db: Database
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

  const expDataId = `${data.project}-${expId}`;
  const expFileName = `exp-data/${expDataId}.json.gz`;
  const expDataFile = robustPath(`../resources/${expFileName}`);

  if (existsSync(expDataFile)) {
    data.preparingData = false;
    data.downloadUrl = `${siteConfig.staticUrl}/${expFileName}`;
  } else {
    data.currentTime = new Date().toISOString();

    const prevPrepDetails = expDataPreparation.get(expDataId);

    // no previous attempt to prepare data
    if (!prevPrepDetails) {
      const start = startRequest();

      data.preparingData = true;

      const resultP = db.getExperimentMeasurements(expId);

      expDataPreparation.set(expDataId, {
        inProgress: true
      });

      resultP
        .then(async (data: any[]) => {
          await storeJsonGzip(data, expDataFile);
          expDataPreparation.set(expDataId, {
            inProgress: false
          });
        })
        .catch(async (error) => {
          log.error('Data preparation failed', error);
          expDataPreparation.set(expDataId, {
            error,
            inProgress: false
          });
        })
        .finally(async () => await completeRequest(start, db, 'prep-exp-data'));
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
        JOIN Source src      USING (sourceId)
        JOIN Environment env USING (envId)

        --JOIN Measurement m   ON m.trialId = t.id
        JOIN Timeline tl     ON tl.trialId = t.id

        WHERE exp.projectId = $1

        GROUP BY exp.name, exp.description, exp.id
        ORDER BY minStartTime DESC;`,
    values: [projectId]
  });
  return { data: result.rows };
}
