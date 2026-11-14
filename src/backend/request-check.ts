import { ParameterizedContext } from 'koa';

const nonNegativeInteger = /^\d+$/;

/**
 * Parse a string as a non-negative integer, as used for database ids.
 * Rejects anything `Number()` would accept but PostgreSQL would not,
 * e.g., '', '12.5', '1e3', '0x10', or ' 12'.
 */
export function parseId(value: string | undefined): number | null {
  if (value === undefined || !nonNegativeInteger.test(value)) {
    return null;
  }
  const num = Number(value);
  return Number.isSafeInteger(num) ? num : null;
}

export function getNumberOrError(
  ctx: ParameterizedContext,
  paramName: string
): number | null {
  const value = parseId(ctx.params[paramName]);

  if (value === null) {
    const received = ctx.params[paramName];
    ctx.status = 400;
    ctx.body = {
      error: `Invalid ${paramName} provided. Received "${received}".`
    };

    return null;
  }

  return value;
}

/**
 * Browsers may speculatively fetch links, which we do not want to trigger
 * expensive operations. Note, Node.js lowercases header names.
 */
export function isPrefetchRequest(ctx: ParameterizedContext): boolean {
  const h = ctx.header;
  return (
    h['x-purpose'] === 'preview' ||
    h['purpose'] === 'prefetch' ||
    h['x-moz'] === 'prefetch'
  );
}
