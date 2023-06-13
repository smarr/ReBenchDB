import { ParameterizedContext } from 'koa';
import { db } from '../db/db-instance.js';
import { prepareTemplate, processTemplate } from '../../templates.js';
import {
  respondProjectAndSourceNotFound,
  respondProjectIdNotFound,
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

/**
 * @deprecated remove for 1.0
 */
export async function redirectToNewProjectDataUrl(
  ctx: ParameterizedContext
): Promise<void> {
  const project = await db.getProject(Number(ctx.params.projectId));
  if (project) {
    ctx.redirect(`/${project.slug}/data`);
  } else {
    respondProjectIdNotFound(ctx, Number(ctx.params.projectId));
  }
  ctx.body = processTemplate('../backend/project/project-data.html', {
    project
  });
  ctx.type = 'html';
}

export async function renderProjectDataPage(
  ctx: ParameterizedContext
): Promise<void> {
  const project = await db.getProjectBySlug(ctx.params.projectSlug);
  if (project) {
    ctx.body = processTemplate('../backend/project/project-data.html', {
      project
    });
    ctx.type = 'html';
  } else {
    respondProjectNotFound(ctx, ctx.params.projectSlug);
  }
}
