import { describe, expect, beforeAll, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { ValidateFunction } from 'ajv';

import { createValidator } from '../../../src/backend/rebench/api-validator.js';
import { robustPath } from '../../../src/backend/util.js';
import { log } from '../../../src/backend/logging.js';

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
    const testData = JSON.parse(
      readFileSync(robustPath('../tests/data/large-payload.json')).toString()
    );

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
});
