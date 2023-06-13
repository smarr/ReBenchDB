import { existsSync } from 'node:fs';
import { completeRequest, startRequest } from '../../perf-tracker.js';
import { db } from '../db/db-instance.js';
import { siteConfig, storeJsonGzip } from '../../util.js';
import { log } from '../../logging.js';

const expDataPreparation = new Map();

export async function getExpData(
  projectSlug: string,
  expId: number
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
  const expDataFile = `${__dirname}/../../resources/${expFileName}`;

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
