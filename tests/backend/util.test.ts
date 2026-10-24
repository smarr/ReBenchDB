import { describe, expect, it } from '@jest/globals';
import { yieldToEventLoopPeriodically } from '../../src/backend/util.js';

function busyWait(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // busy wait, until we waited ms milliseconds
  }
}

describe('yieldToEventLoopPeriodically()', () => {
  it('should let other work run when computing for too long', async () => {
    let otherWorkDone = false;
    setImmediate(() => (otherWorkDone = true));

    busyWait(5);
    await yieldToEventLoopPeriodically(1);

    expect(otherWorkDone).toBe(true);
  });

  it('should not yield when it yielded only recently', async () => {
    await yieldToEventLoopPeriodically(0);

    let otherWorkDone = false;
    setImmediate(() => (otherWorkDone = true));

    await yieldToEventLoopPeriodically(60_000);

    expect(otherWorkDone).toBe(false);
  });
});
