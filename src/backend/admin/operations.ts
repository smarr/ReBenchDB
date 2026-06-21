import { ParameterizedContext } from 'koa';

import { Database } from '../db/db.js';

export async function submitTimelineUpdateJobs(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  // Detached background job that outlives this request's RLS-scoped
  // connection, so it needs its own independent context.
  const updater = db.getTimelineUpdater();
  if (updater) {
    db.withSystemContext(() => updater.submitUpdateJobs())
      .then((n) => n)
      .catch((e) => e);
  }
  ctx.body = 'update process started';
  ctx.type = 'text';
  ctx.status = 200;
}
