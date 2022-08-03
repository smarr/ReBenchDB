import { TimedCacheValidity } from '../src/db.js';

async function delayOf(ms): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe('Timed Cache Validity', () => {
  it('should be valid on creation', () => {
    const v = new TimedCacheValidity(0);
    expect(v.isValid()).toBeTruthy();
  });

  it('should be immediately invalid when delay is 0', () => {
    const v = new TimedCacheValidity(0);
    v.invalidateAndNew();
    expect(v.isValid()).toBeFalsy();
  });

  it('should return a new validity object on immediate invalidation', () => {
    const v = new TimedCacheValidity(0);
    const v2 = v.invalidateAndNew();
    expect(v2).not.toBe(v);
  });

  it('should not be immediately invalid if delay is set', () => {
    const v = new TimedCacheValidity(10);
    expect(v.isValid()).toBeTruthy();
  });

  it('should not be invalid if delay is set, after delay is over', async () => {
    const v = new TimedCacheValidity(10);
    expect(v.isValid()).toBeTruthy();

    v.invalidateAndNew();
    await delayOf(20);
    expect(v.isValid()).toBeFalsy();
  });

  it('should not return new validity while not yet invalid', async () => {
    const v = new TimedCacheValidity(10);
    expect(v.isValid()).toBeTruthy();

    const vPre = v.invalidateAndNew();
    const validPre = v.isValid();

    await delayOf(5);

    const vPre2 = v.invalidateAndNew();
    const validPre2 = v.isValid();

    await delayOf(10);

    expect(validPre).toBeTruthy();
    expect(vPre).toBe(v);

    expect(validPre2).toBeTruthy();
    expect(vPre2).toBe(v);

    expect(v.isValid()).toBeFalsy();
    expect(v.invalidateAndNew()).not.toBe(v);
  });
});
