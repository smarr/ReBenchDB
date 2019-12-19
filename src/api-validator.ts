import Ajv from 'ajv';
import { getProgramFromFiles, generateSchema, CompilerOptions } from 'typescript-json-schema';

export function createValidator(): Ajv.ValidateFunction {
  const compilerOptions: CompilerOptions = {
    strictNullChecks: true
  };
  const program = getProgramFromFiles([`${__dirname}/../../src/api.ts`], compilerOptions);
  const schema = generateSchema(program, 'BenchmarkData');

  const ajv = new Ajv({ allErrors: true });
  return ajv.compile(<any> schema);
}
