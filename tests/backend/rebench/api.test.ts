import { describe, expect, beforeAll, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { ValidateFunction } from 'ajv';

import { createValidator } from '../../../src/backend/rebench/api-validator.js';
import { robustPath } from '../../../src/backend/util.js';
import { assert, log } from '../../../src/backend/logging.js';
import { loadLargePayload } from '../../payload.js';
import type { BenchmarkData } from '../../../src/shared/api.js';
import type { DataPointV1 } from '../../../src/backend/common/api-v1.js';

describe('Ensure Test Payloads conform to API', () => {
  let validateFn: ValidateFunction;

  beforeAll(() => {
    validateFn = createValidator();
  });

  it('should validate small-payload.json', () => {
    const testData = JSON.parse(
      readFileSync(robustPath('../tests/data/small-payload.json')).toString()
    );

    const result = validateFn(testData);
    if (!result) {
      log.error(validateFn.errors);
    }
    expect(result).toBeTruthy();
  });

  it('should validate large-payload.json', () => {
    const testData = loadLargePayload();

    const result = validateFn(testData);
    if (!result) {
      log.error(validateFn.errors);
    }
    expect(result).toBeTruthy();
  });

  it('should validate profile-payload.json', () => {
    const testData = JSON.parse(
      readFileSync(robustPath('../tests/data/profile-payload.json')).toString()
    );

    const result = validateFn(testData);
    if (!result) {
      log.error(validateFn.errors);
    }
    expect(result).toBeTruthy();
  });

  function countValues(data: BenchmarkData): number {
    let count = 0;
    for (const run of data.data) {
      if (!run.d) {
        continue;
      }
      for (const dp of run.d) {
        for (const criterion of dp.m) {
          if (criterion !== null) {
            assert(criterion !== undefined);
            for (const value of criterion) {
              if (value !== null) {
                assert(typeof value === 'number');
                count += 1;
              }
            }
          }
        }
      }
    }
    return count;
  }

  function countValuesApiV1(data: any): number {
    let count = 0;
    for (const run of data.data) {
      if (!run.d) {
        continue;
      }
      for (const dp of run.d) {
        const dpV1 = dp as DataPointV1;
        for (const m of dpV1.m) {
          assert(m != undefined);
          assert(typeof m.v === 'number');
          count += 1;
        }
      }
    }
    return count;
  }

  it('expected number of values in large-payload.json: 1st run', () => {
    const testData = loadLargePayload();
    testData.data.splice(1);

    expect(countValues(testData)).toBe(2999);
  });

  it('expected number of values in raw large-payload.json: 1st run', () => {
    const testData = JSON.parse(
      readFileSync(robustPath('../tests/data/large-payload.json')).toString()
    );
    testData.data.splice(1);
    expect(countValuesApiV1(testData)).toBe(2999);
  });

  it('should give the expected number of values in large-payload.json', () => {
    const testData = loadLargePayload();
    expect(testData.data).toHaveLength(316);
    expect(countValues(testData)).toBe(459928);
  });

  it('should give expected number of values in raw large-payload.json', () => {
    const testData = JSON.parse(
      readFileSync(robustPath('../tests/data/large-payload.json')).toString()
    );
    expect(testData.data).toHaveLength(316);
    expect(countValuesApiV1(testData)).toBe(459928);
  });
});
