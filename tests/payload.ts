import { readFileSync } from 'node:fs';
import { convertToCurrentApi } from '../src/backend/common/api-v1.js';
import { robustPath } from '../src/backend/util.js';

import type { BenchmarkData } from '../src/shared/api.js';
import type {
  MeasurementData,
  MeasurementDataOld
} from '../src/backend/db/types.js';
import { assert } from '../src/backend/logging.js';

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

function convertMeasurementDataToCurrentApi(
  oldMs: MeasurementDataOld[]
): MeasurementData[] {
  const result: MeasurementData[] = [];

  let lastMD: MeasurementData | null = null;
  let lastExpId = -1;
  let lastRunId = -1;
  let lastTrialId = -1;
  let lastCriterion = '';
  let lastInvocation = -1;

  for (const oldM of oldMs) {
    if (
      oldM.expid !== lastExpId ||
      oldM.runid !== lastRunId ||
      oldM.trialid !== lastTrialId ||
      oldM.criterion !== lastCriterion ||
      oldM.invocation !== lastInvocation
    ) {
      lastMD = {
        expid: oldM.expid,
        runid: oldM.runid,
        trialid: oldM.trialid,
        commitid: oldM.commitid,
        bench: oldM.bench,
        exe: oldM.exe,
        suite: oldM.suite,
        cmdline: oldM.cmdline,
        varvalue: oldM.varvalue,
        cores: oldM.cores,
        inputsize: oldM.inputsize,
        extraargs: oldM.extraargs,
        invocation: oldM.invocation,
        warmup: oldM.warmup,
        criterion: oldM.criterion,
        unit: oldM.unit,
        values: [],
        envid: oldM.envid
      };

      result.push(lastMD);
      lastExpId = oldM.expid;
      lastRunId = oldM.runid;
      lastTrialId = oldM.trialid;
      lastCriterion = oldM.criterion;
      lastInvocation = oldM.invocation;
    }
    assert(lastMD!.values[oldM.iteration - 1] == null, 'iteration already set');
    lastMD!.values[oldM.iteration - 1] = oldM.value;
  }

  return result;
}

export function loadCompareViewJsSomPayload(): MeasurementData[] {
  const testData = JSON.parse(
    readFileSync(
      robustPath('../tests/data/compare-view-data-jssom.json')
    ).toString()
  ).results;

  return convertMeasurementDataToCurrentApi(testData);
}

export function loadCompareViewTSomPayload(): MeasurementData[] {
  const testData = JSON.parse(
    readFileSync(
      robustPath('../tests/data/compare-view-data-trufflesom.json')
    ).toString()
  ).results;

  return convertMeasurementDataToCurrentApi(testData);
}
