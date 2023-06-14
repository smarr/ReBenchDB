import { ValidateFunction } from 'ajv';
import Koa from 'koa';
import { koaBody } from 'koa-body';
import Router from 'koa-router';

import { BenchmarkData, TimelineRequest } from './api.js';
import { createValidator } from './api-validator.js';

import {
  initPerfTracker,
  startRequest,
  completeRequest
} from './perf-tracker.js';
import {
  cacheInvalidationDelay,
  dbConfig,
  rebenchVersion,
  siteConfig,
  statsConfig
} from './util.js';
import { handleReBenchCompletion } from './backend/github/github.js';
import { log } from './logging.js';
import {
  getChangesAsJson,
  getLast100MeasurementsAsJson,
  getSiteStatsAsJson,
  renderMainPage
} from './backend/main/main.js';
import {
  getSourceAsJson,
  redirectToNewProjectDataExportUrl,
  redirectToNewProjectDataUrl,
  renderDataExport,
  renderProjectDataPage,
  renderProjectPage
} from './backend/project/project.js';
import {
  getTimelineAsJson,
  redirectToNewTimelineUrl,
  renderTimeline
} from './backend/timeline/timeline.js';
import {
  serveReport,
  serveStaticResource,
  serveViewJs
} from './backend/dev-server/server.js';
import { DatabaseWithPool } from './db.js';
import {
  deleteCachedReport,
  getMeasurementsAsJson,
  getProfileAsJson,
  redirectToNewCompareUrl,
  renderComparePage,
  renderComparePageNew
} from './backend/compare/compare.js';
import { getAvailableDataAsJson } from './backend/project/data-export.js';

log.info('Starting ReBenchDB Version ' + rebenchVersion);

const port = process.env.PORT || 33333;

const DEBUG = 'DEBUG' in process.env ? process.env.DEBUG === 'true' : false;
const DEV = 'DEV' in process.env ? process.env.DEV === 'true' : false;

const app = new Koa();
const router = new Router();

export const db = new DatabaseWithPool(
  dbConfig,
  statsConfig.numberOfBootstrapSamples,
  true,
  cacheInvalidationDelay
);

router.get('/', async (ctx) => {
  return renderMainPage(ctx, db);
});
router.get('/:projectSlug', async (ctx) => renderProjectPage(ctx, db));
router.get('/:projectSlug/source/:sourceId', async (ctx) =>
  getSourceAsJson(ctx, db)
);
router.get('/:projectSlug/timeline', async (ctx) => renderTimeline(ctx, db));
router.get('/:projectSlug/data', async (ctx) => renderProjectDataPage(ctx, db));
router.get('/:projectSlug/data/:expId', async (ctx) =>
  renderDataExport(ctx, db)
);
router.get('/:projectSlug/compare/:baseline..:change', async (ctx) =>
  renderComparePage(ctx, db)
);
router.get('/:projectSlug/compare-new/:baseline..:change', async (ctx) =>
  renderComparePageNew(ctx, db)
);

// DEPRECATED: remove for 1.0
router.get('/timeline/:projectId', async (ctx) =>
  redirectToNewTimelineUrl(ctx, db)
);
router.get('/project/:projectId', async (ctx) =>
  redirectToNewProjectDataUrl(ctx, db)
);
router.get('/rebenchdb/get-exp-data/:expId', async (ctx) =>
  redirectToNewProjectDataExportUrl(ctx, db)
);
router.get('/compare/:project/:baseline/:change', async (ctx) =>
  redirectToNewCompareUrl(ctx, db)
);

// todo: rename this to say that this endpoint gets the last 100 measurements
//       for the project
router.get('/rebenchdb/dash/:projectId/results', async (ctx) =>
  getLast100MeasurementsAsJson(ctx, db)
);
router.get('/rebenchdb/dash/:projectId/timeline/:runId', async (ctx) =>
  getTimelineAsJson(ctx, db)
);
router.get(
  '/rebenchdb/dash/:projectSlug/profiles/:runId/:trialId',
  async (ctx) => getProfileAsJson(ctx, db)
);
router.get(
  '/rebenchdb/dash/:projectSlug/measurements/:runId/:trialId1/:trialId2',
  async (ctx) => getMeasurementsAsJson(ctx, db)
);
router.get('/rebenchdb/stats', async (ctx) => getSiteStatsAsJson(ctx, db));
router.get('/rebenchdb/dash/:projectId/changes', async (ctx) =>
  getChangesAsJson(ctx, db)
);
router.get('/rebenchdb/dash/:projectId/data-overview', async (ctx) =>
  getAvailableDataAsJson(ctx, db)
);

router.get('/admin/perform-timeline-update', async (ctx) => {
  db
    .getTimelineUpdater()
    ?.submitUpdateJobs()
    .then((n) => n)
    .catch((e) => e);
  ctx.body = 'update process started';
  ctx.type = 'text';
  ctx.status = 200;
});

router.post(
  '/admin/refresh/:project/:baseline/:change',
  koaBody({ urlencoded: true }),
  deleteCachedReport
);

router.post(
  '/rebenchdb/dash/:projectName/timelines',
  koaBody(),
  async (ctx) => {
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
);

if (DEV) {
  router.get(`${siteConfig.staticUrl}/:filename*`, serveStaticResource);
  router.get(`/src/views/:filename*`, serveViewJs);
  router.get(
    `${siteConfig.reportsUrl}/:change/figure-html/:filename`,
    serveReport
  );
}

router.get('/status', async (ctx) => {
  ctx.body = `# ReBenchDB Status

- version ${rebenchVersion}
`;
  ctx.type = 'text';
});

const validateFn: ValidateFunction = DEBUG ? createValidator() : <any>undefined;

function validateSchema(data: BenchmarkData, ctx: Router.IRouterContext) {
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

// curl -X PUT -H "Content-Type: application/json" -d '{"foo":"bar","baz":3}'
//  http://localhost:33333/rebenchdb/results
// DEBUG: koaBody({includeUnparsed: true})
router.put(
  '/rebenchdb/results',
  koaBody({ jsonLimit: '500mb' }),
  async (ctx) => {
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
          log.error(
            '/rebenchdb/results failed to store measurements:',
            e.stack
          );
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
);

// curl -X PUT -H "Content-Type: application/json" \
// -d '{"endTime":"bar","experimentName": \
// "CI Benchmark Run Pipeline ID 7204","projectName": "SOMns"}' \
//  https://rebench.stefan-marr.de/rebenchdb/completion
router.put('/rebenchdb/completion', koaBody(), async (ctx) =>
  handleReBenchCompletion(ctx, db)
);

app.use(router.routes());
app.use(router.allowedMethods());

(async () => {
  log.info('Initialize Database');
  try {
    await db.initializeDatabase();
  } catch (e: any) {
    if (e.code == 'ECONNREFUSED') {
      log.error(
        `Unable to connect to database on port ${e.address}:${e.port}\n` +
          'ReBenchDB requires a Postgres database to work.'
      );
      process.exit(1);
    }
  }

  initPerfTracker();

  log.info(`Starting server on http://localhost:${port}`);
  app.listen(port);
})();
