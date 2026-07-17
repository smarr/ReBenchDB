import { ParameterizedContext } from 'koa';
import { apiRoutes, ApiRoutes } from '../shared/view-types.js';
import Router from '@koa/router';
import { Database } from './db/db.js';

export function defineRoute<Path extends keyof ApiRoutes>(
  path: Path,
  router: Router,
  db: Database,
  handler: (
    ctx: ParameterizedContext,
    db: Database
  ) => Promise<ApiRoutes[Path]['response']>
): void {
  switch (apiRoutes[path].method) {
    case 'GET':
      router.get(path, async (ctx) => {
        const result = await handler(ctx, db);
        ctx.type = 'application/json';
        ctx.body = result;
      });
      break;
    default:
      throw new Error(`Unsupported method: ${apiRoutes[path].method}`);
  }
}
