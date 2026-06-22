import Koa from 'koa';
import { koaBody } from 'koa-body';
import Router from '@koa/router';

import { initPerfTracker } from './backend/perf-tracker.js';
import {
  cacheInvalidationDelay,
  dbConfig,
  DEV,
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
  addMember,
  createProject,
  addGroupMember,
  assignGroupToProject,
  createNewGroup,
  deleteMember,
  generateMyApiToken,
  getGroupMembers,
  getMembers,
  getMyApiToken,
  listAllGroups,
  listMyProjects,
  removeGroup,
  removeGroupMember,
  renderAdminPage,
  updateMember
} from './backend/admin/admin-routes.js';
import {
  acceptResultData,
  reportResultApiVersion
} from './backend/rebench/results.js';
import { requireAuth } from './backend/auth/auth-middleware.js';
import {
  login,
  register,
  renderLoginPage
} from './backend/auth/auth-routes.js';
import { setTimeout } from 'node:timers/promises';
import { reportConnectionRefused } from './shared/errors.js';

log.info('Starting ReBenchDB Version ' + rebenchVersion);

const app = new Koa();
const router = new Router();

export const db = new DatabaseWithPool(
  dbConfig,
  statsConfig.numberOfBootstrapSamples,
  true,
  cacheInvalidationDelay
);

router.get('/', requireAuth(db), async (ctx) => {
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

router.post('/auth/register', koaBody(), async (ctx) => register(ctx, db));
router.post('/auth/login', koaBody(), async (ctx) => login(ctx, db));

router.get('/admin', requireAuth(db), async (ctx) => renderAdminPage(ctx));

router.get('/:projectSlug', requireAuth(db), async (ctx) =>
  renderProjectPage(ctx, db)
);
router.get('/:projectSlug/source/:sourceId', requireAuth(db), async (ctx) =>
  getSourceAsJson(ctx, db)
);
router.get('/:projectSlug/timeline', requireAuth(db), async (ctx) =>
  renderTimeline(ctx, db)
);
router.get('/:projectSlug/data', requireAuth(db), async (ctx) =>
  renderProjectDataPage(ctx, db)
);
router.get(
  '/:projectSlug/data/:expIdAndExtension',
  requireAuth(db),
  async (ctx) => {
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
  }
);
router.get(
  '/:projectSlug/compare/:baseline..:change',
  requireAuth(db),
  async (ctx) => renderComparePage(ctx, db)
);

// todo: rename this to say that this endpoint gets the last 100 measurements
//       for the project
router.get('/rebenchdb/dash/:projectId/results', requireAuth(db), async (ctx) =>
  getLast100MeasurementsAsJson(ctx, db)
);
router.get(
  '/rebenchdb/dash/:projectId/timeline/:runId',
  requireAuth(db),
  async (ctx) => getTimelineAsJson(ctx, db)
);
router.get(
  '/rebenchdb/dash/:projectSlug/profiles/:runId/:commitId',
  requireAuth(db),
  async (ctx) => getProfileAsJson(ctx, db)
);
router.get(
  '/rebenchdb/dash/:projectSlug/measurements/:runId/:baseId/:changeId',
  requireAuth(db),
  async (ctx) => getMeasurementsAsJson(ctx, db)
);
router.get('/rebenchdb/stats', requireAuth(db), async (ctx) =>
  getSiteStatsAsJson(ctx, db)
);
router.get('/rebenchdb/dash/:projectId/changes', requireAuth(db), async (ctx) =>
  getChangesAsJson(ctx, db)
);
router.get(
  '/rebenchdb/dash/:projectId/data-overview',
  requireAuth(db),
  async (ctx) => getAvailableDataAsJson(ctx, db)
);
router.post(
  '/rebenchdb/dash/:projectName/timelines',
  requireAuth(db),
  koaBody(),
  async (ctx) => getTimelineDataAsJson(ctx, db)
);

router.get('/admin/api/my-projects', requireAuth(db), async (ctx) =>
  listMyProjects(ctx, db)
);
router.post('/admin/api/projects', requireAuth(db), koaBody(), async (ctx) =>
  createProject(ctx, db)
);
router.get(
  '/admin/api/projects/:projectId/members', requireAuth(db), async (ctx) =>
    getMembers(ctx, db)
);
router.post(
  '/admin/api/projects/:projectId/members',
  requireAuth(db),
  koaBody(),
  async (ctx) => addMember(ctx, db)
);
router.put(
  '/admin/api/projects/:projectId/members/:userId',
  requireAuth(db),
  koaBody(),
  async (ctx) => updateMember(ctx, db)
);
router.delete(
  '/admin/api/projects/:projectId/members/:userId',
  requireAuth(db),
  async (ctx) => deleteMember(ctx, db)
);

router.get('/admin/api/groups', requireAuth(db), async (ctx) =>
  listAllGroups(ctx, db)
);
router.post('/admin/api/groups', requireAuth(db), koaBody(), async (ctx) =>
  createNewGroup(ctx, db)
);
router.delete('/admin/api/groups/:groupId', requireAuth(db), async (ctx) =>
  removeGroup(ctx, db)
);
router.get('/admin/api/groups/:groupId/members', requireAuth(db), async (ctx) =>
  getGroupMembers(ctx, db)
);
router.post(
  '/admin/api/groups/:groupId/members',
  requireAuth(db),
  koaBody(),
  async (ctx) => addGroupMember(ctx, db)
);
router.delete(
  '/admin/api/groups/:groupId/members/:userId',
  requireAuth(db),
  async (ctx) => removeGroupMember(ctx, db)
);
router.post(
  '/admin/api/projects/:projectId/groups',
  requireAuth(db),
  koaBody(),
  async (ctx) => assignGroupToProject(ctx, db)
);

router.get('/admin/api/token', requireAuth(db), async (ctx) =>
  getMyApiToken(ctx, db)
);
router.post('/admin/api/token/generate', requireAuth(db), async (ctx) =>
  generateMyApiToken(ctx, db)
);

router.get('/admin/perform-timeline-update', requireAuth(db), async (ctx) =>
  submitTimelineUpdateJobs(ctx, db)
);
router.post(
  '/admin/refresh/:project/:baseline/:change',
  requireAuth(db),
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
