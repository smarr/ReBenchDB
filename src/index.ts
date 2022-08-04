import { readFileSync } from 'fs';

import Koa from 'koa';
import koaBody from 'koa-body';
import Router from 'koa-router';
import { DatabaseWithPool } from './db.js';
import { BenchmarkData, BenchmarkCompletion, TimelineRequest } from './api.js';
import { createValidator } from './api-validator.js';
import { ValidateFunction } from 'ajv';

import {
  initPerfTracker,
  startRequest,
  completeRequest
} from './perf-tracker.js';
import {
  dashResults,
  dashStatistics,
  dashChanges,
  dashCompare,
  dashBenchmarksForProject,
  dashDataOverview,
  dashGetExpData,
  reportCompletion,
  dashDeleteOldReport,
  dashProfile
} from './dashboard.js';
import { processTemplate } from './templates.js';
import {
  cacheInvalidationDelay,
  dbConfig,
  robustPath,
  siteConfig
} from './util.js';
import { createGitHubClient } from './github.js';
import { getDirname } from './util.js';
import { log } from './logging.js';

const __dirname = getDirname(import.meta.url);

const packageJson = JSON.parse(
  readFileSync(robustPath('../package.json'), 'utf-8')
);

log.info('Starting ReBenchDB Version ' + packageJson.version);

const port = process.env.PORT || 33333;

const DEBUG = 'DEBUG' in process.env ? process.env.DEBUG === 'true' : false;
const DEV = 'DEV' in process.env ? process.env.DEV === 'true' : false;

const refreshSecret =
  'REFRESH_SECRET' in process.env ? process.env.REFRESH_SECRET : undefined;

const app = new Koa();
const router = new Router();
const db = new DatabaseWithPool(dbConfig, 1000, true, cacheInvalidationDelay);

router.get('/', async (ctx) => {
  const projects = await db.getAllProjects();
  ctx.body = processTemplate('index.html', { projects });
  ctx.type = 'html';
});

router.get('/:projectSlug', async (ctx) => {
  const project = await db.getProjectBySlug(ctx.params.projectSlug);
  if (project) {
    ctx.body = processTemplate('project.html', { project });
    ctx.type = 'html';
  } else {
    respondProjectNotFound(ctx, ctx.params.projectSlug);
  }
});

function respondProjectIdNotFound(ctx, projectId: number) {
  ctx.body = `Requested project with id ${projectId} not found`;
  ctx.status = 404;
  ctx.type = 'text';
}

function respondProjectNotFound(ctx, projectSlug: string) {
  ctx.body = `Requested project "${projectSlug}" not found`;
  ctx.status = 404;
  ctx.type = 'text';
}

router.get('/timeline/:projectId', async (ctx) => {
  const project = await db.getProject(Number(ctx.params.projectId));
  if (project) {
    ctx.redirect(`/${project.slug}/timeline`);
  } else {
    respondProjectIdNotFound(ctx, Number(ctx.params.projectId));
  }
});

router.get('/:projectSlug/timeline', async (ctx) => {
  const project = await db.getProjectBySlug(ctx.params.projectSlug);

  if (project) {
    ctx.body = processTemplate('timeline.html', {
      project,
      benchmarks: await db.getLatestBenchmarksForTimelineView(project.id)
    });
    ctx.type = 'html';
  } else {
    respondProjectNotFound(ctx, ctx.params.projectSlug);
  }
});

router.get('/project/:projectId', async (ctx) => {
  const project = await db.getProject(Number(ctx.params.projectId));
  if (project) {
    ctx.redirect(`/${project.slug}/data`);
  } else {
    respondProjectIdNotFound(ctx, Number(ctx.params.projectId));
  }
  ctx.body = processTemplate('project-data.html', {
    project
  });
  ctx.type = 'html';
});

router.get('/:projectSlug/data', async (ctx) => {
  const project = await db.getProjectBySlug(ctx.params.projectSlug);
  if (project) {
    ctx.body = processTemplate('project-data.html', { project });
    ctx.type = 'html';
  } else {
    respondProjectNotFound(ctx, ctx.params.projectSlug);
  }
});

router.get('/:projectSlug/data/:expId', async (ctx) => {
  const start = startRequest();

  const data = await dashGetExpData(
    ctx.params.projectSlug,
    Number(ctx.params.expId),
    dbConfig,
    db
  );

  if (data.preparingData) {
    ctx.body = processTemplate('get-exp-data.html', data);
    ctx.type = 'html';
    ctx.set('Cache-Control', 'no-cache');
  } else {
    log.debug(data.downloadUrl);
    ctx.redirect(data.downloadUrl);
  }

  completeRequest(start, db, 'get-exp-data');
});

router.get('/rebenchdb/dash/:projectId/results', async (ctx) => {
  const start = startRequest();

  ctx.body = await dashResults(Number(ctx.params.projectId), db);
  ctx.type = 'application/json';

  completeRequest(start, db, 'get-results');
});

router.get('/rebenchdb/dash/:projectId/benchmarks', async (ctx) => {
  const start = startRequest();

  ctx.body = await dashBenchmarksForProject(db, Number(ctx.params.projectId));
  ctx.type = 'application/json';

  completeRequest(start, db, 'project-benchmarks');
});

router.get('/rebenchdb/dash/:projectId/timeline/:runId', async (ctx) => {
  ctx.body = await db.getTimelineForRun(
    Number(ctx.params.projectId),
    Number(ctx.params.runId)
  );
  if (ctx.body === null) {
    ctx.status = 500;
  }
  ctx.type = 'application/json';
});

router.get(
  '/rebenchdb/dash/:projectId/profiles/:runId/:trialId',
  async (ctx) => {
    const start = startRequest();

    ctx.body = await dashProfile(
      Number(ctx.params.runId),
      Number(ctx.params.trialId),
      db
    );
    ctx.type = 'application/json';
    completeRequest(start, db, 'get-profiles');
  }
);

router.get('/rebenchdb/stats', async (ctx) => {
  ctx.body = await dashStatistics(db);
  ctx.body.version = packageJson.version;
  ctx.type = 'application/json';
});

router.get('/rebenchdb/dash/:projectId/changes', async (ctx) => {
  ctx.body = await dashChanges(Number(ctx.params.projectId), db);
  ctx.type = 'application/json';
});

router.get('/rebenchdb/dash/:projectId/data-overview', async (ctx) => {
  ctx.body = await dashDataOverview(Number(ctx.params.projectId), db);
  ctx.type = 'application/json';
});

router.get('/compare/:project/:baseline/:change', async (ctx) => {
  const project = await db.getProjectByName(ctx.params.project);
  if (project) {
    ctx.redirect(
      `/${project.slug}/compare/${ctx.params.baseline}..${ctx.params.change}`
    );
  } else {
    respondProjectNotFound(ctx, ctx.params.project);
  }
});

router.get('/:projectSlug/compare/:baseline..:change', async (ctx) => {
  const start = startRequest();

  const data = await dashCompare(
    ctx.params.baseline,
    ctx.params.change,
    ctx.params.projectSlug,
    dbConfig,
    db
  );
  ctx.body = processTemplate('compare.html', data);
  ctx.type = 'html';

  if (data.generatingReport) {
    ctx.set('Cache-Control', 'no-cache');
  }

  completeRequest(start, db, 'change');
});

router.get('/admin/perform-timeline-update', async (ctx) => {
  await db.performTimelineUpdate();
  ctx.body = 'ok';
  ctx.type = 'text';
  ctx.status = 200;
});

router.post(
  '/admin/refresh/:project/:baseline/:change',
  koaBody({ urlencoded: true }),
  async (ctx) => {
    ctx.type = 'text';

    if (refreshSecret === undefined) {
      ctx.body = 'ReBenchDB is not configured to accept refresh requests.';
      ctx.status = 503;
      return;
    }

    if (ctx.request.body.password === refreshSecret) {
      const project = ctx.params.project;
      const base = ctx.params.baseline;
      const change = ctx.params.change;
      dashDeleteOldReport(project, base, change);

      ctx.body = `Refresh requests accepted for
        Project:  ${project}
        Baseline: ${base}
        Change:   ${change}
        `;
      ctx.status = 303;
      ctx.redirect(`/compare/${project}/${base}/${change}`);
    } else {
      ctx.body = 'Incorrect authentication.';
      ctx.status = 403;
    }
  }
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
  router.get(`${siteConfig.staticUrl}/:filename*`, async (ctx) => {
    const filename = ctx.params.filename;
    log.debug(`serve ${filename}`);
    let path: string;

    // TODO: robustPath?
    if (filename.endsWith('.css')) {
      ctx.type = 'css';
      path = `${__dirname}/../../resources/${filename}`;
    } else if (filename.endsWith('.js')) {
      ctx.type = 'application/javascript';
      if (filename.includes('uPlot')) {
        path = `${__dirname}/../../resources/${filename}`;
      } else {
        path = `${__dirname}/views/${filename}`;
      }
    } else if (filename.endsWith('.map')) {
      ctx.type = 'application/json';
      path = `${__dirname}/views/${filename}`;
    } else if (filename.endsWith('.svg')) {
      ctx.type = 'image/svg+xml';
      path = `${__dirname}/../../resources/${filename}`;
    } else {
      throw new Error(`Unsupported file type. Filename: ${filename}`);
    }
    ctx.body = readFileSync(path);
  });

  router.get(`/src/views/:filename*`, async (ctx) => {
    log.debug(`serve ${ctx.params.filename}`);
    let path: string;
    if (ctx.params.filename.endsWith('.ts')) {
      ctx.type = 'application/typescript';
      path = `${__dirname}/../../src/views/${ctx.params.filename}`;
    } else {
      throw new Error(`Unsupported file type ${ctx.params.filename}`);
    }
    ctx.body = readFileSync(path);
  });

  router.get(`${siteConfig.staticUrl}/exp-data/:filename`, async (ctx) => {
    log.debug(`serve ${ctx.params.filename}`);
    ctx.body = readFileSync(
      `${__dirname}/../../resources/exp-data/${ctx.params.filename}`
    );
    if (ctx.params.filename.endsWith('.qs')) {
      ctx.type = 'application/octet-stream';
    }
  });

  router.get(
    `${siteConfig.reportsUrl}/:change/figure-html/:filename`,
    async (ctx) => {
      log.debug(`serve ${ctx.params.filename}`);
      const reportPath = `${__dirname}/../../resources/reports`;
      ctx.body = readFileSync(
        `${reportPath}/${ctx.params.change}/figure-html/${ctx.params.filename}`
      );
      if (ctx.params.filename.endsWith('.svg')) {
        ctx.type = 'svg';
      } else if (ctx.params.filename.endsWith('.css')) {
        ctx.type = 'application/javascript';
      }
    }
  );
}

router.get('/status', async (ctx) => {
  ctx.body = `# ReBenchDB Status

- version ${packageJson.version}
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
      const recordedRuns = await db.recordMetaDataAndRuns(data);
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

const github = createGitHubClient(siteConfig);
if (github === null) {
  log.info(
    'Reporting to GitHub is not yet enabled.' +
      ' Make sure GITHUB_APP_ID and GITHUB_PK are set to enable it.'
  );
}

// curl -X PUT -H "Content-Type: application/json" \
// -d '{"endTime":"bar","experimentName": \
// "CI Benchmark Run Pipeline ID 7204","projectName": "SOMns"}' \
//  https://rebench.stefan-marr.de/rebenchdb/completion
router.put('/rebenchdb/completion', koaBody(), async (ctx) => {
  const data: BenchmarkCompletion = await ctx.request.body;
  ctx.type = 'text';

  if (!data.experimentName || !data.projectName) {
    ctx.body =
      'Completion request misses mandatory fields. ' +
      'In needs to have experimentName, and projectName';
    ctx.status = 400;
    return;
  }

  try {
    await reportCompletion(dbConfig, db, github, data);
    log.debug(
      `/rebenchdb/completion: ${data.projectName}` +
        `${data.experimentName} was completed`
    );
    ctx.status = 201;
    ctx.body =
      `Completion recorded of ` + `${data.projectName} ${data.experimentName}`;
  } catch (e: any) {
    ctx.status = 500;
    ctx.body = `Failed to record completion: ${e}\n${e.stack}`;
    log.error('/rebenchdb/completion failed to record completion:', e);
  }
});

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
