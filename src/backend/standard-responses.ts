import { ParameterizedContext } from 'koa';

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
): string {
  ctx.status = 404;
  ctx.type = 'text';
  return (
    `Requested combination of project "${projectSlug}"` +
    ` and source ${sourceId} not found`
  );
}
