/**
 * This file contains functions that change the format of that data
 * to make it easier to work with in the frontend.
 */

import { ResultsByBenchmark, ResultsByExeSuiteBenchmark } from './prep-data.js';
import type {
  CriterionData,
  MeasurementData,
  Measurements,
  ProcessedResult,
  RunSettings
} from '../db/types.js';
import { simplifyCmdline } from '../../shared/util.js';

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

  let lastInvocation = 0;
  let lastTrialId = -1;
  let lastMeasurements: Measurements | null = null;
  let lastValues: number[] = [];

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

    if (
      lastMeasurements === null ||
      !isSameInvocation(row, lastMeasurements, lastInvocation, lastTrialId)
    ) {
      const benchResult = findOrConstructProcessedResult(forSuiteByBench, row);

      const m: Measurements = findOrConstructMeasurements(
        benchResult,
        row,
        criterion,
        runSetting,
        forSuiteByBench
      );

      // We don't store the invocation number anymore
      // I think this is fine, we don't really need it.
      // We just need to distinguish iterations, but their ordering
      // doesn't have any particular meaning.
      // If we should need it for statistical analysis of inter-invocation
      // effects, we may need to re-introduce it.
      lastValues = [];
      m.values.push(lastValues);
      lastInvocation = row.invocation;
      lastMeasurements = m;
      lastTrialId = row.trialid;
    }

    // adjusted to be zero-based
    lastValues[row.iteration - 1] = row.value;
  }

  return sortResultsAlphabetically(byExeSuiteBench);
}

function sortResultsAlphabetically(
  byExeSuiteBench: ResultsByExeSuiteBenchmark
) {
  const exeBySuiteBench = Array.from(byExeSuiteBench.entries());
  exeBySuiteBench.sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true })
  );

  for (const exeSuitePair of exeBySuiteBench) {
    const bySuiteBench = exeSuitePair[1];
    const suiteByBench = Array.from(bySuiteBench.entries());
    suiteByBench.sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true })
    );

    for (const suiteBenchPair of suiteByBench) {
      const byBench = suiteBenchPair[1];
      const bench = Array.from(byBench.benchmarks.entries());
      bench.sort((a, b) =>
        a[0].localeCompare(b[0], undefined, { numeric: true })
      );
      byBench.benchmarks = new Map(bench);
    }

    exeSuitePair[1] = new Map(suiteByBench);
  }

  const sorted = new Map<string, Map<string, ResultsByBenchmark>>(
    exeBySuiteBench
  );

  return sorted;
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
    runId: row.runid
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
  for (const mm of benchResult.measurements) {
    if (isSameMeasurements(row, mm)) {
      return mm;
    }
  }
  return null;
}

function isSameMeasurements(row: MeasurementData, m: Measurements) {
  return (
    m.envId == row.envid &&
    m.commitId == row.commitid &&
    m.runId == row.runid &&
    m.criterion.name == row.criterion
  );
}

function isSameInvocation(
  row: MeasurementData,
  m: Measurements,
  invocation: number,
  trialId: number
) {
  return (
    invocation == row.invocation &&
    trialId == row.trialid &&
    isSameMeasurements(row, m)
  );
}
