import { ParameterizedContext } from 'koa';

export function respondProjectIdNotFound(
  ctx: ParameterizedContext,
  projectId: number
): void {
  ctx.body = `Requested project with id ${projectId} not found`;
  ctx.status = 404;
  ctx.type = 'text';
}

export function respondProjectNotFound(
  ctx: ParameterizedContext,
  projectSlug: string
): void {
  ctx.body = `Requested project "${projectSlug}" not found`;
  ctx.status = 404;
  ctx.type = 'text';
}

export function respondProjectAndSourceNotFound(
  ctx: ParameterizedContext,
  projectSlug: string,
  sourceId: string
): void {
  ctx.body =
    `Requested combination of project "${projectSlug}"` +
    ` and source ${sourceId} not found`;
  ctx.status = 404;
  ctx.type = 'text';
}

export function respondExpIdNotFound(
  ctx: ParameterizedContext,
  expId: string
): void {
  ctx.body = `Requested experiment ${expId} not found`;
  ctx.status = 404;
  ctx.type = 'text';
}
