import { readFileSync } from 'fs';
import { getProgramFromFiles, generateSchema, CompilerOptions } from 'typescript-json-schema';
import Ajv from 'ajv';
import { expect } from 'chai';

describe('Ensure Test Payloads conform to API', () => {
  let validateFn: Ajv.ValidateFunction;

  before(() => {
    const compilerOptions: CompilerOptions = {
      strictNullChecks: true
    };
    const program = getProgramFromFiles([`${__dirname}/../../src/api.ts`], compilerOptions);
    const schema = generateSchema(program, 'BenchmarkData');

    const ajv = new Ajv({allErrors: true});
    validateFn = ajv.compile(<any> schema);
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
