import { describe, expect, it } from '@jest/globals';
import { GraphQLClient } from 'graphql-request';

import { RequestCache } from '../../../src/backend/gitlab/request-cache.js';

function createGraphQLClient(): GraphQLClient {
  return new GraphQLClient('https://example/api/graphql', {
    headers: {
      Authorization: 'Bearer token'
    }
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('RequestCache', () => {
  it('returns cached value within TTL', async () => {
    let fetchCount = 0;
    const cache = new RequestCache<number>(
      60,
      async () => {
        fetchCount += 1;
        return 42;
      },
      createGraphQLClient()
    );

    const first = await cache.getCachedValue('SSW', new Date('2024-01-01'));
    const second = await cache.getCachedValue('SSW', new Date('2024-01-02'));

    expect(first).toBe(42);
    expect(second).toBe(42);
    expect(fetchCount).toBe(1);
  });

  it('deduplicates concurrent requests and reuse pending promise', async () => {
    const inFlight = deferred<string>();
    let fetchCount = 0;

    const cache = new RequestCache<string>(
      60,
      async () => {
        fetchCount += 1;
        return inFlight.promise;
      },
      createGraphQLClient()
    );

    const first = cache.getCachedValue('SSW', new Date('2024-01-01'));
    const second = cache.getCachedValue('SSW', new Date('2024-01-01'));

    expect(fetchCount).toBe(1);

    inFlight.resolve('done');

    await expect(first).resolves.toBe('done');
    await expect(second).resolves.toBe('done');

    const cached = await cache.getCachedValue('SSW', new Date('2024-01-01'));
    expect(cached).toBe('done');
    expect(fetchCount).toBe(1);
  });

  it('clears cached state and refetches', async () => {
    let fetchCount = 0;
    const cache = new RequestCache<number>(
      60,
      async () => {
        fetchCount += 1;
        return fetchCount;
      },
      createGraphQLClient()
    );

    const first = await cache.getCachedValue('SSW', new Date('2024-01-01'));
    cache.clear();
    const second = await cache.getCachedValue('SSW', new Date('2024-01-01'));

    expect(first).toBe(1);
    expect(second).toBe(2);
    expect(fetchCount).toBe(2);
  });

  it('resets pending state after an error and allows retry', async () => {
    let shouldFail = true;
    let fetchCount = 0;

    const cache = new RequestCache<string>(
      60,
      async () => {
        fetchCount += 1;
        if (shouldFail) {
          throw new Error('temporary failure');
        }
        return 'ok';
      },
      createGraphQLClient()
    );

    await expect(
      cache.getCachedValue('SSW', new Date('2024-01-01'))
    ).rejects.toThrow('temporary failure');

    shouldFail = false;

    await expect(
      cache.getCachedValue('SSW', new Date('2024-01-01'))
    ).resolves.toBe('ok');
    expect(fetchCount).toBe(2);
  });
});
