import { describe, expect, it } from '@jest/globals';
import { ParameterizedContext } from 'koa';
import { getNumberOrError } from '../../src/backend/request-check.js';

function ctxWithParams(params: Record<string, string>): ParameterizedContext {
  return { params } as any;
}

describe('getNumberOrError', () => {
  it('should accept a non-negative integer', () => {
    const ctx = ctxWithParams({ projectId: '42' });
    expect(getNumberOrError(ctx, 'projectId')).toEqual(42);
  });

  it.each(['', 'abc', '12.5', '1e3', '0x10', ' 12', '-1', 'NaN', '12abc'])(
    'should reject %p',
    (value) => {
      const ctx = ctxWithParams({ projectId: value });
      expect(getNumberOrError(ctx, 'projectId')).toBeNull();
      expect(ctx.status).toEqual(400);
    }
  );

  it('should report the value of the requested parameter', () => {
    const ctx = ctxWithParams({ projectId: 'abc', runId: 'other' });
    getNumberOrError(ctx, 'projectId');
    expect((ctx.body as any).error).toEqual(
      'Invalid projectId provided. Received "abc".'
    );
  });
});
