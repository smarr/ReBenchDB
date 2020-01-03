import { readFileSync } from 'fs';

import Koa from 'koa';
import koaBody from 'koa-body';
import Router from 'koa-router';
import { Database } from './db';
import { BenchmarkData } from './api';
import { createValidator } from './api-validator';
import ajv from 'ajv';

import { version } from '../package.json';
import { initPerfTracker, startRequest, completeRequest } from './perf-tracker';
import { dashResults, dashStatistics, dashChanges, dashCompare, dashProjects } from './dashboard';
import { processTemplate } from './templates';

console.log('Starting ReBenchDB Version ' + version);

const dbConfig = {
  user: process.env.RDB_USER || '',
  password: process.env.RDB_PASS || '',
  host: process.env.RDB_HOST || 'localhost',
  database: process.env.RDB_DB || 'test_rdb3',
  port: 5432
};

const port = process.env.PORT || 33333;

const DEBUG = 'DEBUG' in process.env ? process.env.DEBUG === 'true' : false;
const DEV = 'DEV' in process.env ? process.env.DEV === 'true' : false;


const app = new Koa();
const router = new Router();
const db = new Database(dbConfig, 1000, true);

router.get('/', async ctx => {
  ctx.body = processTemplate('index.html');
  ctx.type = 'html';
});

router.get(`/rebenchdb/dash/projects`, async ctx => {
  ctx.body = await dashProjects(db);
  ctx.type = 'application/json';
});


router.get('/rebenchdb/dash/:projectId/results', async ctx => {
  const start = startRequest();

  ctx.body = await dashResults(ctx.params.projectId, db);
  ctx.type = 'application/json';

  await completeRequest(start, db, 'get-results');
});

router.get('/rebenchdb/stats', async ctx => {
  ctx.body = await dashStatistics(db);
  ctx.body.version = version;
  ctx.type = 'application/json';
});

router.get('/rebenchdb/dash/:projectId/changes', async ctx => {
  ctx.body = await dashChanges(ctx.params.projectId, db);
  ctx.type = 'application/json';
});

router.get('/compare/:project/:baseline/:change', async ctx => {
  const start = startRequest();

  const data = dashCompare(
    ctx.params.baseline, ctx.params.change, ctx.params.project, dbConfig, db);
  ctx.body = processTemplate('compare.html', data);
  ctx.type = 'html';

  if (data.generatingReport) {
    ctx.set('Cache-Control', 'no-cache');
  }

  await completeRequest(start, db, 'change');
});

if (DEV) {
  router.get('/static/:filename', async ctx => {
    console.log(`serve ${ctx.params.filename}`);
    ctx.body = readFileSync(`${__dirname}/../../resources/${ctx.params.filename}`);
    if (ctx.params.filename.endsWith('.css')) {
      ctx.type = 'css';
    } else if (ctx.params.filename.endsWith('.js')) {
      ctx.type = 'application/javascript';
    }
  });

  router.get('/static/reports/:change/figure-html/:filename', async ctx => {
    console.log(`serve ${ctx.params.filename}`);
    ctx.body = readFileSync(`${__dirname}/../../resources/reports/${ctx.params.change}/figure-html/${ctx.params.filename}`);
    if (ctx.params.filename.endsWith('.svg')) {
      ctx.type = 'svg';
    } else if (ctx.params.filename.endsWith('.css')) {
      ctx.type = 'application/javascript';
    }
  });
}

router.get('/status', async ctx => {
  ctx.body = `# ReBenchDB Status

- version ${version}
`;
  ctx.type = 'text';
});

const validateFn: ajv.ValidateFunction = DEBUG ? createValidator() : <any> undefined;

function validateSchema(data: BenchmarkData, ctx: Router.IRouterContext) {
  const result = validateFn(data);
  if (!result) {
    console.log('Data validation failed.');
    console.error(validateFn.errors);
    ctx.status = 500;
    ctx.body = `Request does not validate:
${validateFn.errors}`;
  } else {
    console.log('Data validated successfully.');
  }
}

// curl -X PUT -H "Content-Type: application/json" -d '{"foo":"bar","baz":3}' http://localhost:33333/rebenchdb/results
// DEBUG: koaBody({includeUnparsed: true})
router.put('/rebenchdb/results', koaBody(), async ctx => {
  const start = startRequest();

  const data: BenchmarkData = await ctx.request.body;
  ctx.type = 'text';

  if (DEBUG) {
    validateSchema(data, ctx);
  }

  try {
    const recordedMeasurements = await db.recordData(data);
    ctx.body = `Data recorded, ${recordedMeasurements} measurements stored.`;
    ctx.status = 200;
  } catch (e) {
    ctx.status = 500;
    ctx.body = `${e.stack}`;
    console.log(e.stack);
  }

  await completeRequest(start, db, 'put-results');
});

app.use(router.routes());
app.use(router.allowedMethods());

(async () => {
  console.log('Initialize Database');
  await db.initializeDatabase();

  initPerfTracker();

  console.log(`Starting server on localhost:${port}`);
  app.listen(port);
})();
