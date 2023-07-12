import { ParameterizedContext } from 'koa';

import { Database } from '../db/db.js';

export async function submitTimelineUpdateJobs(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  db
    .getTimelineUpdater()
    ?.submitUpdateJobs()
    .then((n) => n)
    .catch((e) => e);
  ctx.body = 'update process started';
  ctx.type = 'text';
  ctx.status = 200;
}
