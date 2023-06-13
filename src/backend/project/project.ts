import { ParameterizedContext } from 'koa';
import { db } from '../db/db-instance.js';
import { prepareTemplate } from '../../templates.js';
import {
  respondProjectAndSourceNotFound,
  respondProjectNotFound
} from '../common/standard-responses.js';

const projectHtml = prepareTemplate('../backend/project/project.html');

export async function renderProjectPage(
  ctx: ParameterizedContext
): Promise<void> {
  const project = await db.getProjectBySlug(ctx.params.projectSlug);
  if (project) {
    ctx.body = projectHtml(project);
    ctx.type = 'html';
  } else {
    respondProjectNotFound(ctx, ctx.params.projectSlug);
  }
}

export async function getSourceAsJson(
  ctx: ParameterizedContext
): Promise<void> {
  const result = await db.getSourceById(
    ctx.params.projectSlug,
    ctx.params.sourceId
  );

  if (result !== null) {
    ctx.body = result;
    ctx.type = 'application/json';
  } else {
    respondProjectAndSourceNotFound(
      ctx,
      ctx.params.projectSlug,
      ctx.params.sourceId
    );
  }
}
