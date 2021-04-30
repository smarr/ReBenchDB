import Ajv, { ValidateFunction } from 'ajv';
import { existsSync } from 'fs';
import {
  getProgramFromFiles,
  generateSchema,
  CompilerOptions,
  PartialArgs
} from 'typescript-json-schema';

export function createValidator(): ValidateFunction {
  const compilerOptions: CompilerOptions = {
    strictNullChecks: true
  };

  const settings: PartialArgs = {
    required: true
  };

  let api = `${__dirname}/../src/api.ts`;
  if (!existsSync(api)) {
    api = `${__dirname}/../../src/api.ts`;
  }

  const program = getProgramFromFiles([api], compilerOptions);
  const schema = generateSchema(program, 'BenchmarkData', settings);

  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  return ajv.compile(<any>schema);
}
