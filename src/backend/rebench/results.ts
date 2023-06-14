import { ParameterizedContext } from 'koa';
import { ValidateFunction } from 'ajv';

import { BenchmarkData } from '../../api.js';
import { Database } from '../../db.js';
import { createValidator } from '../../api-validator.js';
import { DEBUG } from '../../util.js';
import { log } from '../../logging.js';
import { completeRequest, startRequest } from '../../perf-tracker.js';

const validateFn: ValidateFunction = DEBUG ? createValidator() : <any>undefined;

function validateSchema(data: BenchmarkData, ctx: ParameterizedContext) {
  const result = validateFn(data);
  if (!result) {
    log.error('Data validation failed.', validateFn.errors);
    ctx.status = 500;
    ctx.body = `Request does not validate:
${validateFn.errors}`;
  } else {
    log.debug('Data validated successfully.');
  }
}

export async function acceptResultData(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const start = startRequest();

  const data: BenchmarkData = await ctx.request.body;
  ctx.type = 'text';

  if (DEBUG) {
    validateSchema(data, ctx);
  }

  if (!data.startTime) {
    ctx.body = `Request misses a startTime setting,
                which is needed to store results correctly.`;
    ctx.status = 400;
    return;
  }

  try {
    const recRunsPromise = db.recordMetaDataAndRuns(data);
    log.info(`/rebenchdb/results: Content-Length=${ctx.request.length}`);
    const recordedRuns = await recRunsPromise;
    db.recordAllData(data)
      .then(([recMs, recPs]) =>
        log.info(
          // eslint-disable-next-line max-len
          `/rebenchdb/results: stored ${recMs} measurements, ${recPs} profiles`
        )
      )
      .catch((e) => {
        log.error('/rebenchdb/results failed to store measurements:', e.stack);
      });

    ctx.body =
      `Meta data for ${recordedRuns} stored.` +
      ' Storing of measurements is ongoing';
    ctx.status = 201;
  } catch (e: any) {
    ctx.status = 500;
    ctx.body = `${e.stack}`;
    log.error(e, e.stack);
  }

  completeRequest(start, db, 'put-results');
}
