import { ParameterizedContext } from 'koa';
import { prepareTemplate, processTemplate } from '../templates.js';
import {
  respondExpIdNotFound,
  respondProjectAndSourceNotFound,
  respondProjectIdNotFound,
  respondProjectNotFound
} from '../common/standard-responses.js';
import { completeRequest, startRequest } from '../perf-tracker.js';
import { getExpData } from './data-export.js';
import { Database } from '../db/db.js';

const projectHtml = prepareTemplate('../backend/project/project.html');

export async function renderProjectPage(
  ctx: ParameterizedContext,
  db: Database
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
  ctx: ParameterizedContext,
  db: Database
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
  ctx: ParameterizedContext,
  db: Database
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
  ctx: ParameterizedContext,
  db: Database
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

/**
 * @deprecated remove for 1.0
 */
export async function redirectToNewProjectDataExportUrl(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const project = await db.getProjectByExpId(Number(ctx.params.expId));
  if (project) {
    ctx.redirect(`/${project.slug}/data/${ctx.params.expId}`);
  } else {
    respondExpIdNotFound(ctx, ctx.params.expId);
  }
}

export async function renderDataExport(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const start = startRequest();

  const data = await getExpData(
    ctx.params.projectSlug,
    Number(ctx.params.expId),
    db
  );

  if (data.preparingData) {
    ctx.body = processTemplate('get-exp-data.html', data);
    ctx.type = 'html';
    ctx.set('Cache-Control', 'no-cache');
  } else {
    ctx.redirect(data.downloadUrl);
  }

  completeRequest(start, db, 'get-exp-data');
}
