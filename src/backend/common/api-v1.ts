import type { BenchmarkData, DataPoint } from '../../shared/api.js';

export interface MeasureV1 {
  /** Criterion id. */
  c: number;

  /** Value */
  v: number;
}

export interface DataPointV1 {
  /** Invocation */
  in: number;

  /** Iteration */
  it: number;

  m: MeasureV1[];
}

function convertDataPointsToCurrentApi(oldDs: any): DataPoint[] {
  const result: Map<number, DataPoint> = new Map();
  const oldDataPoints = oldDs as DataPointV1[];

  for (const oldD of oldDataPoints) {
    if (!result.has(oldD.in)) {
      result.set(oldD.in, {
        in: oldD.in,
        m: []
      });
    }

    const newDP = result.get(oldD.in)!;
    const iteration = oldD.it;
    for (const measure of oldD.m) {
      if (newDP.m[measure.c] === undefined || newDP.m[measure.c] === null) {
        newDP.m[measure.c] = [];

        // mark criteria we have not seen yet explicitly with null
        for (let i = 0; i < measure.c; i += 1) {
          if (newDP.m[i] === undefined) {
            newDP.m[i] = null;
          }
        }
      }

      // iteration 1 is at index 0, etc
      newDP.m[measure.c]![iteration - 1] = measure.v;
    }
  }

  const newDataPoints = [...result.values()];

  // turn undefined into null, to have a consistent absent value
  for (const dp of newDataPoints) {
    for (const criterionMs of dp.m) {
      if (criterionMs !== null) {
        const cMs = criterionMs as (number | null)[];
        for (let i = 0; i < cMs.length; i += 1) {
          if (cMs[i] === undefined) {
            cMs[i] = null;
          }
        }
      }
    }
  }

  return newDataPoints;
}

export function convertToCurrentApi(data: BenchmarkData): BenchmarkData {
  for (const run of data.data) {
    if (!run.d) {
      continue;
    }

    run.d = convertDataPointsToCurrentApi(run.d);
  }
  return data;
}
