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
import { dashReBenchDb, dashStatistics } from './dashboard';
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


const app = new Koa();
const router = new Router();
const db = new Database(dbConfig);

router.get('/', async ctx => {
  ctx.body = processTemplate('index.html');
  ctx.type = 'html';
});

router.get('/rebenchdb/dash/:project', async ctx => {
  if (ctx.params.project === 'rebenchdb') {
    ctx.body = await dashReBenchDb(db);
    ctx.type = 'application/json';
  }
});

router.get('/rebenchdb/stats', async ctx => {
  ctx.body = await dashStatistics(db);
  ctx.body.version = version;
  ctx.type = 'application/json';
});

router.get('/rebenchdb/dash/:project/changes', async ctx => {
  ctx.body = await dashChanges(ctx.params.project, db);
  ctx.type = 'application/json';
});

router.get('/status', async ctx => {
  ctx.body = `# ReBenchDB Status

- version ${version}
- data
  - measurements ${await db.getNumberOfMeasurements()}
  - experiments ${await db.getNumberOfExperiments()}
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

  try {
    await completeRequest(start, db);
  } catch (e) {
    console.error(e);
  }
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
