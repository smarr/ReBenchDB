/**
 * This file contains functions that change the format of that data
 * to make it easier to work with in the frontend.
 */

import {
  ResultsByBenchmark,
  ResultsByExeSuiteBenchmark
} from './stats-data-prep.js';
import {
  CriterionData,
  MeasurementData,
  Measurements,
  ProcessedResult,
  RunSettings
} from './db.js';
import { simplifyCmdline } from './views/util.js';

/**
 * Turn the flat list of measurements into a nested structure
 * that separates measurements by exe, suite, and benchmark.
 *
 * This function isn't doing any statistics calculations.
 * We strictly separate the issues, because it is unclear that we can rely
 * on any order of the data to know when we have all relevant data for
 * calculating statistics.
 *
 * So, we just do it in a second pass.
 */
export function collateMeasurements(
  data: MeasurementData[]
): ResultsByExeSuiteBenchmark {
  const byExeSuiteBench = new Map<string, Map<string, ResultsByBenchmark>>();
  const runSettings = new Map<string, RunSettings>();
  const criteria = new Map<string, CriterionData>();

  for (const row of data) {
    const c = `${row.criterion}|${row.unit}`;

    let criterion = criteria.get(c);
    if (criterion === undefined) {
      criterion = {
        name: row.criterion,
        unit: row.unit
      };
      criteria.set(c, criterion);
    }

    let runSetting = runSettings.get(row.cmdline);
    if (runSetting === undefined) {
      runSetting = {
        cmdline: row.cmdline,
        varValue: row.varvalue,
        cores: row.cores,
        inputSize: row.inputsize,
        extraArgs: row.extraargs,
        warmup: row.warmup,
        simplifiedCmdline: simplifyCmdline(row.cmdline)
      };
      runSettings.set(row.cmdline, runSetting);
    }

    let forExeBySuiteBench = byExeSuiteBench.get(row.exe);
    if (forExeBySuiteBench === undefined) {
      forExeBySuiteBench = new Map();
      byExeSuiteBench.set(row.exe, forExeBySuiteBench);
    }

    let forSuiteByBench = forExeBySuiteBench.get(row.suite);
    if (forSuiteByBench === undefined) {
      forSuiteByBench = {
        benchmarks: new Map(),
        criteria: {}
      };
      forExeBySuiteBench.set(row.suite, forSuiteByBench);
    }

    const benchResult = findOrConstructProcessedResult(forSuiteByBench, row);

    const m: Measurements = findOrConstructMeasurements(
      benchResult,
      row,
      criterion,
      runSetting,
      forSuiteByBench
    );

    // adjust invocation and iteration to be zero-based
    if (!m.values[row.invocation - 1]) {
      m.values[row.invocation - 1] = [];
    }
    m.values[row.invocation - 1][row.iteration - 1] = row.value;
  }

  return byExeSuiteBench;
}

function findOrConstructProcessedResult(
  forSuiteByBench: ResultsByBenchmark,
  row: MeasurementData
): ProcessedResult {
  let benchResult = forSuiteByBench.benchmarks.get(row.bench);
  if (benchResult === undefined) {
    benchResult = {
      exe: row.exe,
      suite: row.suite,
      bench: row.bench,
      measurements: []
    };
    forSuiteByBench.benchmarks.set(row.bench, benchResult);
  }
  return benchResult;
}

function findOrConstructMeasurements(
  benchResult: ProcessedResult,
  row: MeasurementData,
  criterion: CriterionData,
  runSetting: RunSettings,
  forSuiteByBench: ResultsByBenchmark
): Measurements {
  let m: Measurements | null = findMeasurements(benchResult, row);

  if (m) {
    return m;
  }

  m = {
    criterion,
    values: [],
    envId: row.envid,
    commitId: row.commitid,
    runSettings: runSetting,
    runId: row.runid,
    trialId: row.trialid
  };
  benchResult.measurements.push(m);
  forSuiteByBench.criteria[criterion.name] = criterion;

  return m;
}

/**
 * Find the matching measurements for the given row.
 */
function findMeasurements(
  benchResult: ProcessedResult,
  row: MeasurementData
): Measurements | null {
  let m: Measurements | null = null;
  for (const mm of benchResult.measurements) {
    if (
      mm.envId == row.envid &&
      mm.commitId == row.commitid &&
      mm.criterion.name == row.criterion
    ) {
      m = mm;
      break;
    }
  }
  return m;
}
