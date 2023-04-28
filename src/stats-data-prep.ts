import { assert } from './logging.js';
import { calculateChangeStatistics } from './stats.js';
import {
  CriterionData,
  MeasurementData,
  Measurements,
  ProcessedResult,
  RunSettings
} from './db.js';
import { simplifyCmdline } from './views/util.js';

export function compareStringOrNull(
  a: string | null,
  b: string | null
): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  return a.localeCompare(b);
}

/**
 * Comparator function to sort measurements so that we can calculate
 * change statistics doing a single pass over the measurements array
 * by pairing up measurements so that always the first the baseline
 * and then the change comes in the list.
 */
export function compareToSortForSinglePassChangeStats(
  a: Measurements,
  b: Measurements
): number {
  const r = compareToSortForSinglePassChangeStatsWithoutCommitId(a, b);
  if (r !== 0) {
    return r;
  }

  return a.commitId.localeCompare(b.commitId);
}

export function compareToSortForSinglePassChangeStatsWithoutCommitId(
  a: Measurements,
  b: Measurements
): number {
  let r = a.envId - b.envId;
  if (r !== 0) {
    return r;
  }

  r = compareStringOrNull(a.runSettings.varValue, b.runSettings.varValue);
  if (r !== 0) {
    return r;
  }

  r = compareStringOrNull(a.runSettings.cores, b.runSettings.cores);
  if (r !== 0) {
    return r;
  }

  r = compareStringOrNull(a.runSettings.inputSize, b.runSettings.inputSize);
  if (r !== 0) {
    return r;
  }

  r = compareStringOrNull(a.runSettings.extraArgs, b.runSettings.extraArgs);
  if (r !== 0) {
    return r;
  }

  return a.criterion.name.localeCompare(b.criterion.name);
}

export type ResultsByBenchmark = Map<string, ProcessedResult>;
export type ResultsBySuiteBenchmark = Map<string, ResultsByBenchmark>;
export type ResultsByExeSuiteBenchmark = Map<string, ResultsBySuiteBenchmark>;

export function collateMeasurements(
  data: MeasurementData[]
): ResultsByExeSuiteBenchmark {
  const byExeSuiteBench = new Map<
    string,
    Map<string, Map<string, ProcessedResult>>
  >();
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
      forSuiteByBench = new Map();
      forExeBySuiteBench.set(row.suite, forSuiteByBench);
    }

    let benchResult = forSuiteByBench.get(row.bench);
    if (benchResult === undefined) {
      benchResult = {
        exe: row.exe,
        suite: row.suite,
        bench: row.bench,
        measurements: []
      };
      forSuiteByBench.set(row.bench, benchResult);
    }

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

    if (!m) {
      m = {
        criterion,
        values: [],
        envId: row.envid,
        commitId: row.commitid,
        runSettings: runSetting
      };
      benchResult.measurements.push(m);
    }

    if (!m.values[row.invocation - 1]) {
      m.values[row.invocation - 1] = [];
    }
    m.values[row.invocation - 1][row.iteration - 1] = row.value;
  }

  return byExeSuiteBench;
}

export function dropMeasurementsWhereBaseOrChangeIsMissing(
  measurements: Measurements[]
): Measurements[] | undefined {
  const dropped: Measurements[] = [];

  function drop(i: number) {
    dropped.push(measurements[i]);
    measurements.splice(i, 1);
  }

  let i = 0;
  while (i < measurements.length) {
    if (i + 1 >= measurements.length) {
      drop(i);
      return dropped;
    }

    const base = measurements[i];
    const change = measurements[i + 1];
    if (
      compareToSortForSinglePassChangeStatsWithoutCommitId(base, change) !== 0
    ) {
      drop(i);
    } else {
      i += 2;
    }
  }

  if (dropped.length === 0) {
    return undefined;
  }
  return dropped;
}

export function calculateAllChangeStatistics(
  measurements: Measurements[],
  baseOffset: number,
  changeOffset: number
): Measurements[] | undefined {
  assert(
    measurements.length % 2 === 0,
    'measurements.length must be even, ' +
      'because we expect pairs of measurements from baseline and change'
  );
  measurements.sort(compareToSortForSinglePassChangeStats);

  const dropped = dropMeasurementsWhereBaseOrChangeIsMissing(measurements);

  // separate the measurements by criterion and envId
  // but handle a few trivial cases first
  if (measurements.length === 0) {
    return dropped;
  }

  for (let i = 0; i < measurements.length; i += 2) {
    const sortedBase = measurements[i + baseOffset].values.flat();
    sortedBase.sort((a, b) => a - b);

    const sortedChange = measurements[i + changeOffset].values.flat();
    sortedChange.sort((a, b) => a - b);

    measurements[i + changeOffset].changeStats = calculateChangeStatistics(
      sortedBase,
      sortedChange
    );
  }
}
