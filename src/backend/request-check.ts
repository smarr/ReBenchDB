import { ParameterizedContext } from 'koa';

export function getNumberOrError(
  ctx: ParameterizedContext,
  paramName: string
): number | null {
  const value = Number(ctx.params[paramName]);

  if (isNaN(value)) {
    ctx.status = 400;
    ctx.body = {
      error: `Invalid ${paramName} provided. Received "${ctx.params.runId}".`
    };

    return null;
  }

  return value;
}
