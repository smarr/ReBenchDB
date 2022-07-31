import { readFileSync } from 'fs';
import { ValidateFunction } from 'ajv';
import { createValidator } from '../src/api-validator.js';
import { getDirname } from '../src/util.js';
import { log } from '../src/logging.js';

const __dirname = getDirname(import.meta.url);

describe('Ensure Test Payloads conform to API', () => {
  let validateFn: ValidateFunction;

  beforeAll(() => {
    validateFn = createValidator();
  });

  it('should execute tests in the right folder', () => {
    expect(__dirname).toMatch(/tests$/);
  });

  it('should validate small-payload.json', () => {
    const testData = JSON.parse(
      readFileSync(`${__dirname}/small-payload.json`).toString()
    );

    const result = validateFn(testData);
    if (!result) {
      log.error(validateFn.errors);
    }
    expect(result).toBeTruthy();
  });

  it('should validate large-payload.json', () => {
    const testData = JSON.parse(
      readFileSync(`${__dirname}/large-payload.json`).toString()
    );

    const result = validateFn(testData);
    if (!result) {
      log.error(validateFn.errors);
    }
    expect(result).toBeTruthy();
  });

  it('should validate profile-payload.json', () => {
    const testData = JSON.parse(
      readFileSync(`${__dirname}/profile-payload.json`).toString()
    );

    const result = validateFn(testData);
    if (!result) {
      log.error(validateFn.errors);
    }
    expect(result).toBeTruthy();
  });
});
