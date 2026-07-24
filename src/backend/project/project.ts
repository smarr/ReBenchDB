import { ParameterizedContext } from 'koa';
import { prepareTemplate } from '../templates.js';
import {
  respondProjectAndSourceNotFound,
  respondProjectNotFound
} from '../standard-responses.js';
import {
  completeRequestAndHandlePromise,
  startRequest
} from '../perf-tracker.js';
import { getExpData } from './data-export.js';
import { Database } from '../db/db.js';
import { rebenchVersion, robustPath } from '../../backend/util.js';
import { Source } from '../db/types.js';

const projectHtml = prepareTemplate(robustPath('backend/project/project.html'));

export async function renderProjectPage(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const project = await db.getProjectBySlug(ctx.params.projectSlug);
  if (project) {
    ctx.body = projectHtml({ ...project, rebenchVersion });
    ctx.type = 'html';
  } else {
    respondProjectNotFound(ctx, ctx.params.projectSlug);
  }
}

export async function getSourceAsJson(
  ctx: ParameterizedContext,
  db: Database
): Promise<Source | string> {
  const result = await db.getSourceById(
    ctx.params.projectSlug,
    ctx.params.sourceId
  );

  if (result !== null) {
    return result;
  }

  return respondProjectAndSourceNotFound(
    ctx,
    ctx.params.projectSlug,
    ctx.params.sourceId
  );
}

const projectDataTpl = prepareTemplate(
  robustPath('backend/project/project-data.html'),
  false
);

export async function renderProjectDataPage(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const project = await db.getProjectBySlug(ctx.params.projectSlug);
  if (project) {
    ctx.body = projectDataTpl({ project, rebenchVersion });
    ctx.type = 'html';
  } else {
    respondProjectNotFound(ctx, ctx.params.projectSlug);
  }
}

const expDataTpl = prepareTemplate(
  robustPath('backend/project/get-exp-data.html'),
  false
);

export async function renderDataExport(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const start = startRequest();
  const format = ctx.params.expIdAndExtension.endsWith('.json.gz')
    ? 'json'
    : 'csv';
  const expId = ctx.params.expIdAndExtension.replace(`.${format}.gz`, '');

  const data = await getExpData(
    ctx.params.projectSlug,
    Number(expId),
    db,
    format
  );

  if (data.preparingData) {
    ctx.body = expDataTpl({ ...data, rebenchVersion });
    ctx.type = 'html';
    ctx.set('Cache-Control', 'no-cache');
  } else {
    ctx.redirect(data.downloadUrl);
  }

  completeRequestAndHandlePromise(start, db, 'get-exp-data');
}
