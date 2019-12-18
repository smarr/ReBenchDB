import { readFileSync } from 'fs';
import { getProgramFromFiles, generateSchema, CompilerOptions } from 'typescript-json-schema';
import Ajv from 'ajv';
import { expect } from 'chai';

describe('Ensure Test Payloads conform to API', () => {
  it('should validate small-payload.json', () => {
    const compilerOptions: CompilerOptions = {
      strictNullChecks: true
    };
    const program = getProgramFromFiles([`${__dirname}/../../src/api.ts`], compilerOptions);
    const schema = generateSchema(program, 'BenchmarkData');

    const basicTestData = JSON.parse(
      readFileSync(`${__dirname}/../../tests/small-payload.json`).toString());

    const ajv = new Ajv({allErrors: true});
    const validateFn = ajv.compile(<any> schema);
    const result = validateFn(basicTestData);
    if (!result) {
      console.error(validateFn.errors);
    }
    expect(result).to.be.true;
  });
});
