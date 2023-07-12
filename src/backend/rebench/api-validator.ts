import Ajv, { ValidateFunction } from 'ajv';
import {
  getProgramFromFiles,
  generateSchema,
  CompilerOptions,
  PartialArgs
} from 'typescript-json-schema';
import { robustPath } from '../util.js';

export function createValidator(): ValidateFunction {
  const compilerOptions: CompilerOptions = {
    strictNullChecks: true
  };

  const settings: PartialArgs = {
    required: true
  };

  const api = robustPath('shared/api.ts');

  const program = getProgramFromFiles([api], compilerOptions);
  const schema = generateSchema(program, 'BenchmarkData', settings);

  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  return ajv.compile(<any>schema);
}
