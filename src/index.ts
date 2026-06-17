import Koa from 'koa';
import { koaBody } from 'koa-body';
import Router from '@koa/router';

import { initPerfTracker } from './backend/perf-tracker.js';
import {
  DEV,
  cacheInvalidationDelay,
  dbConfig,
  rebenchVersion,
  siteConfig,
  statsConfig
} from './backend/util.js';
import { handleReBenchCompletion } from './backend/github/github.js';
import { log } from './backend/logging.js';
import {
  getChangesAsJson,
  getLast100MeasurementsAsJson,
  getSiteStatsAsJson,
  renderMainPage
} from './backend/main/main.js';
import {
  getSourceAsJson,
  renderDataExport,
  renderProjectDataPage,
  renderProjectPage
} from './backend/project/project.js';
import {
  getTimelineAsJson,
  renderTimeline
} from './backend/timeline/timeline.js';
import {
  serveReport,
  serveStaticResource,
  serveStaticSharedResource,
  serveViewJs
} from './backend/dev-server/server.js';
import { DatabaseWithPool } from './backend/db/database-with-pool.js';
import {
  deleteCachedReport,
  getMeasurementsAsJson,
  getProfileAsJson,
  getTimelineDataAsJson,
  renderComparePage
} from './backend/compare/compare.js';
import { getAvailableDataAsJson } from './backend/project/data-export.js';
import { submitTimelineUpdateJobs } from './backend/admin/operations.js';
import {
  acceptResultData,
  reportResultApiVersion
} from './backend/rebench/results.js';
import { setTimeout } from 'node:timers/promises';
import { reportConnectionRefused } from './shared/errors.js';
import { defineRoute } from './backend/server-routes.js';
import { renderRunners } from './backend/gitlab/runner-status.js';

log.info('Starting ReBenchDB Version ' + rebenchVersion);

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

router.get('/status', async (ctx) => {
  ctx.body = `# ReBenchDB Status

- version ${rebenchVersion}
`;
  ctx.type = 'text';
});

router.get('/robots.txt', async (ctx) => {
  ctx.body = `User-agent: *

Disallow: /status
Disallow: /*/data*
Disallow: /rebenchdb*
`;
  ctx.type = 'text';
});

router.get('/:projectSlug', async (ctx) => renderProjectPage(ctx, db));
defineRoute('/:projectSlug/source/:sourceId', router, db, getSourceAsJson);
router.get('/:projectSlug/timeline', async (ctx) => renderTimeline(ctx, db));
router.get('/:projectSlug/runners', async (ctx) => renderRunners(ctx, db));
router.get('/:projectSlug/data', async (ctx) => renderProjectDataPage(ctx, db));
router.get('/:projectSlug/data/:expIdAndExtension', async (ctx) => {
  if (
    ctx.header['X-Purpose'] === 'preview' ||
    ctx.header['Purpose'] === 'prefetch' ||
    ctx.header['X-Moz'] === 'prefetch'
  ) {
    ctx.set('Cache-Control', 'must-revalidate');
    ctx.status = 425; // HTTP Code for 'Too Early'
    return;
  }
  return renderDataExport(ctx, db);
});
router.get('/:projectSlug/compare/:baseline..:change', async (ctx) =>
  renderComparePage(ctx, db)
);

// TODO: rename this to say that this endpoint gets the last 100 measurements
//       for the project
defineRoute(
  '/rebenchdb/dash/:projectId/results',
  router,
  db,
  getLast100MeasurementsAsJson
);
defineRoute(
  '/rebenchdb/dash/:projectId/timeline/:runId',
  router,
  db,
  getTimelineAsJson
);
defineRoute(
  '/rebenchdb/dash/:projectSlug/profiles/:runId/:commitId',
  router,
  db,
  getProfileAsJson
);
defineRoute(
  '/rebenchdb/dash/:projectSlug/measurements/:runId/:baseId/:changeId',
  router,
  db,
  getMeasurementsAsJson
);
defineRoute('/rebenchdb/stats', router, db, getSiteStatsAsJson);
defineRoute('/rebenchdb/dash/:projectId/changes', router, db, getChangesAsJson);

defineRoute(
  '/rebenchdb/dash/:projectId/data-overview',
  router,
  db,
  getAvailableDataAsJson
);
defineRoute(
  '/rebenchdb/dash/:projectName/timelines',
  router,
  db,
  getTimelineDataAsJson,
  koaBody()
);

router.get('/admin/perform-timeline-update', async (ctx) =>
  submitTimelineUpdateJobs(ctx, db)
);
router.post(
  '/admin/refresh/:project/:baseline/:change',
  koaBody({ urlencoded: true }),
  deleteCachedReport
);

if (DEV) {
  router.get(`${siteConfig.staticUrl}/*filename`, serveStaticResource);
  router.get(`/shared/*filename`, serveStaticSharedResource);
  router.get(`/src/frontend/*filename`, serveViewJs);
  router.get(
    `${siteConfig.reportsUrl}/:change/figure-html/:filename`,
    serveReport
  );
}

// curl -X OPTIONS http://localhost:33333/rebenchdb/results -i
router.options('/rebenchdb/results', reportResultApiVersion);

// curl -X PUT -H "Content-Type: application/json" -d '{"foo":"bar","baz":3}'
//  http://localhost:33333/rebenchdb/results
// DEBUG: koaBody({includeUnparsed: true})
router.put('/rebenchdb/results', koaBody({ jsonLimit: '500mb' }), async (ctx) =>
  acceptResultData(ctx, db)
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

async function tryToConnect(n: number): Promise<boolean> {
  if (n <= 0) {
    return false;
  }

  try {
    await db.initializeDatabase();
    return true;
  } catch (e: any) {
    if (e.code == 'ECONNREFUSED') {
      reportConnectionRefused(e);
      await setTimeout(5000);
      return await tryToConnect(n - 1);
    }
    throw e;
  }
}

(async () => {
  log.info('Initialize Database');
  if (!(await tryToConnect(5))) {
    process.exit(1);
  }

  await initPerfTracker(db);

  log.info(`Starting server on http://localhost:${siteConfig.port}`);
  app.listen(siteConfig.port);
})();
