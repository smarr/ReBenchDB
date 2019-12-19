import { readFileSync } from 'fs';
import Ajv from 'ajv';
import { expect } from 'chai';
import { createValidator } from '../src/api-validator';

describe('Ensure Test Payloads conform to API', () => {
  let validateFn: Ajv.ValidateFunction;

  before(() => {
    validateFn = createValidator();
  });

  it('should validate small-payload.json', () => {
    const basicTestData = JSON.parse(
      readFileSync(`${__dirname}/../../tests/small-payload.json`).toString());

    const result = validateFn(basicTestData);
    if (!result) {
      console.error(validateFn.errors);
    }
    expect(result).to.be.true;
  });

  it('should validate large-payload.json', () => {
    const basicTestData = JSON.parse(
      readFileSync(`${__dirname}/../../tests/large-payload.json`).toString());

    const result = validateFn(basicTestData);
    if (!result) {
      console.error(validateFn.errors);
    }
    expect(result).to.be.true;
  });
});
