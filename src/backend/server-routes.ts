import { Middleware, ParameterizedContext } from 'koa';
import { apiRoutes, ApiRoutes } from '../shared/routes.js';
import Router from '@koa/router';
import { Database } from './db/db.js';

export function defineRoute<Path extends keyof ApiRoutes>(
  path: Path,
  router: Router,
  db: Database,
  handler: (
    ctx: ParameterizedContext,
    db: Database
  ) => Promise<ApiRoutes[Path]['response']>,
  koaBody: Middleware | null = null
): void {
  switch (apiRoutes[path].method) {
    case 'GET':
      router.get(path, async (ctx) => {
        const result = await handler(ctx, db);
        ctx.type = 'application/json';
        ctx.body = result;
      });
      break;
    case 'POST':
      router.post(path, koaBody!, async (ctx) => {
        const result = await handler(ctx, db);
        ctx.type = 'application/json';
        ctx.body = result;
      });
      break;
  }
}
