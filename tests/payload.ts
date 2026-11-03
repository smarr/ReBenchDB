import { readFileSync } from 'node:fs';
import { robustPath } from '../src/backend/util.js';

import type { BenchmarkData } from '../src/shared/api.js';
import type { MeasurementData } from '../src/backend/db/types.js';

export function loadSmallPayload(): BenchmarkData {
  return JSON.parse(
    readFileSync(robustPath('../tests/data/small-payload.json')).toString()
  );
}

export function loadSmallPayloadFor(
  commitId: string,
  experimentName: string,
  startTime: string
): BenchmarkData {
  const data = loadSmallPayload();
  data.source.commitId = commitId;
  data.experimentName = experimentName;
  data.startTime = startTime;
  return data;
}

export function loadLargePayload(): BenchmarkData {
  return JSON.parse(
    readFileSync(robustPath('../tests/data/large-payload.json')).toString()
  );
}

export function loadCompareViewJsSomPayload(): MeasurementData[] {
  return JSON.parse(
    readFileSync(
      robustPath('../tests/data/compare-view-data-jssom.json')
    ).toString()
  );
}

export function loadCompareViewTSomPayload(): MeasurementData[] {
  return JSON.parse(
    readFileSync(
      robustPath('../tests/data/compare-view-data-trufflesom.json')
    ).toString()
  );
}
