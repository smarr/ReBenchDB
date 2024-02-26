import { readFileSync } from 'node:fs';
import { convertToCurrentApi } from '../src/backend/common/api-v1.js';
import { robustPath } from '../src/backend/util.js';

import type { BenchmarkData } from '../src/shared/api.js';

export function loadLargePayload(): BenchmarkData {
  const testData = JSON.parse(
    readFileSync(robustPath('../tests/data/large-payload.json')).toString()
  );

  return convertToCurrentApi(testData);
}

export function loadLargePayloadApiV1(): any {
  return JSON.parse(
    readFileSync(robustPath('../tests/data/large-payload.json')).toString()
  );
}
