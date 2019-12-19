import Koa from 'koa';
import koaBody from 'koa-body';
import Router from 'koa-router';
import { Database } from './db';
import { BenchmarkData } from './api';

console.log('Starting up ReBenchDB');


const dbConfig = {
  user: process.env.RDB_USER || '',
  password: process.env.RDB_PASS || '',
  host: process.env.RDB_HOST || 'localhost',
  database: process.env.RDB_DB || 'test_rdb3',
  port: 5432
};

const port = process.env.PORT || 33333;


const app = new Koa();
const router = new Router();
const db = new Database(dbConfig);


router.get('/', async ctx => {
  ctx.body = 'TODO';
  ctx.type = 'text';
});

// curl -X PUT -H "Content-Type: application/json" -d '{"foo":"bar","baz":3}' http://localhost:33333/rebenchdb/results
router.put('/rebenchdb/results', koaBody(), async ctx => {
  const data: BenchmarkData = ctx.request.body;
  try {
    await db.recordData(data);
    ctx.status = 200;
  } catch (e) {
    ctx.status = 500;
    ctx.type = 'text';
    ctx.body = `An error:
${e.stack}`;
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

(async () => {
  console.log('Initialize Database');
  await db.initializeDatabase();

  console.log(`Starting server on localhost:${port}`);
  app.listen(port);
})();
