import { mkdirSync } from 'node:fs';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

import {
  ComparisonStatistics,
  ComparisonStatsWithUnit,
  calculateChangeStatistics,
  calculateChangeStatisticsForFirstAsBaseline,
  calculateSummaryOfChangeSummaries,
  median,
  normalize
} from '../../shared/stats.js';
import type {
  CriterionData,
  Environment,
  MeasurementData,
  Measurements,
  ProcessedResult,
  RevisionComparison,
  RevisionData
} from '../db/types.js';
import {
  AllStats,
  ByExeSuiteComparison,
  BySuiteComparison,
  CompareNavPartial,
  CompareStatsRow,
  CompareStatsTable,
  CompareViewWithData,
  DataSeriesVersionComparison
} from '../../shared/view-types.js';
import {
  calculateInlinePlotHeight,
  createCanvas,
  renderInlinePlot,
  renderOverviewPlot,
  renderOverviewPlots
} from './charts.js';
import { siteConfig } from '../util.js';
import { siteAesthetics } from '../../shared/aesthetics.js';

import { collateMeasurements } from './db-data.js';
import { HasProfile } from '../db/has-profile.js';
import { assert } from '../../backend/logging.js';

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
  let r = a.runId - b.runId;
  if (r !== 0) {
    return r;
  }

  r = a.envId - b.envId;
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

function getCommitOffsetsInSortedMeasurements(
  baseCommitId: string,
  changeCommitId: string
): { baseOffset: number; changeOffset: number } {
  const cmp = baseCommitId.localeCompare(changeCommitId);
  if (cmp === 0) {
    throw new Error('base and change are the same');
  }
  const baseCommitIdIsFirst = cmp < 0;

  return {
    baseOffset: baseCommitIdIsFirst ? 0 : 1,
    changeOffset: baseCommitIdIsFirst ? 1 : 0
  };
}

export interface ResultsByBenchmark {
  benchmarks: Map<string, ProcessedResult>;
  criteria: Record<string, CriterionData>;
}

export type ResultsBySuiteBenchmark = Map<string, ResultsByBenchmark>;
export type ResultsByExeSuiteBenchmark = Map<string, ResultsBySuiteBenchmark>;

export interface AllResultsByBenchmark {
  benchmarks: Map<string, ProcessedResult[]>; // list of results for each exe
  criteria: Record<string, CriterionData>;
}

export type AcrossExesBySuite = Map<string, AllResultsByBenchmark>;

let inlinePlotCanvas: ChartJSNodeCanvas | null = null;

export function getDataNormalizedToBaselineMedian(
  base: string,
  change: string,
  sortedBase: number[],
  sortedChange: number[]
): ChangeData {
  const baseM = median(sortedBase);
  const data: ChangeData = {
    labels: [base, change],
    data: [normalize(sortedBase, baseM), normalize(sortedChange, baseM)]
  };
  return data;
}

export function getDataSeriesNormalizedToBaselineMedian(
  exeNames: string[],
  sorted: number[][]
): ChangeData {
  const baseM = median(sorted[0]);
  const data: ChangeData = {
    labels: exeNames,
    data: sorted.map((s) => normalize(s, baseM))
  };
  return data;
}

function assertBasicPropertiesOfSortedMeasurements(
  bench: ProcessedResult,
  baseOffset: number,
  changeOffset: number
) {
  if (bench.measurements.length % 2 !== 0 && bench.measurements.length <= 0) {
    throw new Error(
      'measurements.length must be even and >0, ' +
        'because we expect pairs of measurements from baseline and change,' +
        `but has length ${bench.measurements.length} ` +
        `for ${bench.bench}, ${bench.exe}, ${bench.suite}`
    );
  }

  if (
    (baseOffset === 0 || changeOffset === 0) &&
    baseOffset + changeOffset !== 1
  ) {
    throw new Error(
      'baseOffset and changeOffset must be 0 and 1, or 1 and 0, but are ' +
        `${baseOffset} and ${changeOffset} for ` +
        `${bench.bench}, ${bench.exe}, ${bench.suite}`
    );
  }

  if (bench.measurements[0].commitId === bench.measurements[1].commitId) {
    throw new Error(
      'base and change are the same for ' +
        `${bench.bench}, ${bench.exe}, ${bench.suite}, ` +
        `but are expected to be different` +
        `both are ${bench.measurements[0].commitId}`
    );
  }
}

function addOrGetCompareStatsRow(
  variants: Map<string, CompareStatsRow>,
  countsAndMissing: VariantCountAndMissing | null,
  measurements: Measurements,
  bench: ProcessedResult,
  hasProfiles: HasProfile | null
): CompareStatsRow {
  const b = bench.bench;
  const e = bench.exe;
  const s = bench.suite;

  // only these will vary between different sets of measurements
  const v = measurements.runSettings.varValue || undefined;
  const c = measurements.runSettings.cores || undefined;
  const i = measurements.runSettings.inputSize || undefined;
  const ea = measurements.runSettings.extraArgs || undefined;
  const envId = measurements.envId;

  const key = `${v || ''}-${c || ''}-${i || ''}-${ea || ''}-${envId}`;

  let row = variants.get(key);
  if (row === undefined) {
    const benchId = { b, e, s, v, c, i, ea };
    const profileIds = hasProfiles ? hasProfiles.get(benchId) : false;

    row = {
      benchId,
      details: {
        cmdline: measurements.runSettings.simplifiedCmdline,
        envId,
        profileTrialIdBase: profileIds ? profileIds[0] : false,
        profileTrialIdChange:
          profileIds && profileIds[1] ? profileIds[1] : false,
        hasWarmup: false,
        numV: countsAndMissing === null ? 0 : countsAndMissing.numV,
        numC: countsAndMissing === null ? 0 : countsAndMissing.numC,
        numI: countsAndMissing === null ? 0 : countsAndMissing.numI,
        numEa: countsAndMissing === null ? 0 : countsAndMissing.numEa,
        numEnv: countsAndMissing === null ? 0 : countsAndMissing.numEnv
      }
    };
    variants.set(key, row);
  }
  return row;
}

function addMissingCompareStatsRow(
  variants: Map<string, CompareStatsRow>,
  measurements: Measurements,
  bench: ProcessedResult,
  base: string,
  change: string
): void {
  const row = addOrGetCompareStatsRow(
    variants,
    null,
    measurements,
    bench,
    null
  );

  if (!row.missing) {
    row.missing = [];
  }

  row.missing.push({
    commitId: measurements.commitId === base ? change : base,
    criterion: measurements.criterion
  });
}

export interface VariantCountAndMissing {
  numV: number;
  numC: number;
  numI: number;
  numEa: number;
  numEnv: number;
  missing: Map<string, CompareStatsRow>;
}

/**
 * Missing data is recorded, and the missing criteria a collected into
 * the CompareStatsRow.
 */
export function countVariantsAndDropMissing(
  bench: ProcessedResult,
  base: string,
  change: string
): VariantCountAndMissing {
  const measurements = bench.measurements;
  const missing: Map<string, CompareStatsRow> = new Map();
  let lastEnvId = -1;
  let lastVarValue: string | null = null;
  let lastCores: string | null = null;
  let lastInputSize: string | null = null;
  let lastExtraArgs: string | null = null;

  let numV = 0;
  let numC = 0;
  let numI = 0;
  let numEa = 0;
  let numEnv = 0;

  function dropAsMissing(i: number): void {
    addMissingCompareStatsRow(missing, measurements[i], bench, base, change);
    measurements.splice(i, 1);
  }

  function createResult(): VariantCountAndMissing {
    // adjust the counts as needed
    if (numV > 0 || numC > 0 || numI > 0 || numEa > 0 || numEnv > 0) {
      for (const mi of missing.values()) {
        mi.details.numV = numV;
        mi.details.numC = numC;
        mi.details.numI = numI;
        mi.details.numEa = numEa;
        mi.details.numEnv = numEnv;
      }
    }
    return { numV, numC, numI, numEa, numEnv, missing };
  }

  let i = 0;
  while (i < measurements.length) {
    const isLastItem = i + 1 >= measurements.length;

    const base = measurements[i];

    if (lastEnvId !== base.envId) {
      lastEnvId = base.envId;
      numEnv += 1;
    }

    if (lastVarValue !== base.runSettings.varValue) {
      lastVarValue = base.runSettings.varValue;
      numV += 1;
    }

    if (lastCores !== base.runSettings.cores) {
      lastCores = base.runSettings.cores;
      numC += 1;
    }

    if (lastInputSize !== base.runSettings.inputSize) {
      lastInputSize = base.runSettings.inputSize;
      numI += 1;
    }

    if (lastExtraArgs !== base.runSettings.extraArgs) {
      lastExtraArgs = base.runSettings.extraArgs;
      numEa += 1;
    }

    if (isLastItem) {
      dropAsMissing(i);
      return createResult();
    }

    const change = measurements[i + 1];

    if (
      compareToSortForSinglePassChangeStatsWithoutCommitId(base, change) !== 0
    ) {
      dropAsMissing(i);
    } else {
      i += 2;
    }
  }

  return createResult();
}

export interface StatsForBenchmark {
  stats: CompareStatsRow[];
  lastPlotId: number;
  numRunConfigs: number;
}

export async function calculateChangeStatsForBenchmark(
  bench: ProcessedResult,
  hasProfiles: HasProfile | null,
  base: string,
  change: string,
  baseOffset: number,
  changeOffset: number,
  perCriteria: Map<string, ComparisonStatsWithUnit> | null,
  lastPlotId: number,
  outputFolder: string | null = null,
  plotName: string | null = null
): Promise<StatsForBenchmark> {
  const measurements = bench.measurements;

  // sort measurements to create the structure of paired measurements
  measurements.sort(compareToSortForSinglePassChangeStats);

  // drop everything that doesn't pair up
  const countsAndMissing = countVariantsAndDropMissing(bench, base, change);

  if (measurements.length === 0) {
    // nothing to do, so just try returning the missing
    return {
      stats: [...countsAndMissing.missing.values()],
      lastPlotId,
      numRunConfigs: 0
    };
  }

  // check that we have the expected structure
  assertBasicPropertiesOfSortedMeasurements(bench, baseOffset, changeOffset);

  const variants: Map<string, CompareStatsRow> = countsAndMissing.missing;

  // now we have pairs of measurements
  // and we have various different criteria
  // we need to
  // - calculate the change statistics for each criterion
  const counts = await computeStatisticsAndInlinePlot(
    variants,
    countsAndMissing,
    bench,
    measurements,
    hasProfiles,
    baseOffset,
    changeOffset,
    perCriteria,
    lastPlotId,
    siteConfig.inlinePlotCriterion,
    outputFolder,
    plotName
  );

  return {
    stats: [...variants.values()],
    lastPlotId: counts.lastPlotId,
    numRunConfigs: counts.numRunConfigs
  };
}

function getDataSeriesIds(
  base: Measurements,
  change: Measurements
): DataSeriesVersionComparison {
  if (base.runId !== change.runId) {
    throw new Error(
      `runIds are expected to be the same but` +
        ` are: ${base.runId} and ${change.runId}` +
        ` for ${base.criterion.name}`
    );
  }
  return {
    runId: base.runId,
    base: {
      commitId: base.commitId,
      trialId: base.trialId
    },
    change: {
      commitId: change.commitId,
      trialId: change.trialId
    }
  };
}

export function getMsFlattenedAndSorted(
  base: Measurements,
  change: Measurements
): { sortedBase: number[]; sortedChange: number[] } {
  // TODO: need to consider warmup setting there, before flattening
  const sortedBase = base.values.flat();
  sortedBase.sort((a, b) => a - b);

  // TODO: need to consider warmup setting there, before flattening
  const sortedChange = change.values.flat();
  sortedChange.sort((a, b) => a - b);
  return { sortedBase, sortedChange };
}

async function computeStatisticsAndInlinePlot(
  variants: Map<string, CompareStatsRow>,
  countsAndMissing: VariantCountAndMissing,
  bench: ProcessedResult,
  measurements: Measurements[],
  hasProfiles: HasProfile | null,
  baseOffset: number,
  changeOffset: number,
  perCriteria: Map<string, ComparisonStatsWithUnit> | null,
  lastPlotId: number,
  inlinePlotCriterion: string | null = null,
  outputFolder: string | null = null,
  plotName: string | null = null
): Promise<{ lastPlotId: number; numRunConfigs: number }> {
  let numRunConfigs = 0;

  for (let i = 0; i < measurements.length; i += 2) {
    const base = measurements[i + baseOffset];
    const change = measurements[i + changeOffset];

    const { sortedBase, sortedChange } = getMsFlattenedAndSorted(base, change);
    const changeStats = calculateChangeStatistics(sortedBase, sortedChange);

    const row = addOrGetCompareStatsRow(
      variants,
      countsAndMissing,
      change,
      bench,
      hasProfiles
    );

    // add the various details
    row.details.hasWarmup = siteConfig.canShowWarmup(change.values);

    if (
      (row.details.hasWarmup || row.details.profileTrialIdBase) &&
      !row.details.dataSeries
    ) {
      row.details.dataSeries = getDataSeriesIds(base, change);
    }

    if (!row.versionStats) {
      row.versionStats = {};
    }

    row.versionStats[change.criterion.name] = changeStats;

    if (
      outputFolder !== null &&
      plotName != null &&
      change.criterion.name === inlinePlotCriterion
    ) {
      lastPlotId += 1;
      row.inlinePlot = await createInlinePlot(
        base.commitId,
        change.commitId,
        sortedBase,
        sortedChange,
        outputFolder,
        plotName,
        lastPlotId
      );
    }

    if (perCriteria !== null) {
      recordPerCriteria(perCriteria, measurements, i, baseOffset, changeStats);
    }

    numRunConfigs += 1;
  }

  return { lastPlotId, numRunConfigs };
}

async function createInlinePlot(
  base: string,
  change: string,
  sortedBase: number[],
  sortedChange: number[],
  outputFolder: string,
  plotName: string,
  plotId: number
): Promise<string> {
  if (inlinePlotCanvas === null) {
    inlinePlotCanvas = createCanvas(siteAesthetics.inlinePlot);
  }

  const data: ChangeData = getDataNormalizedToBaselineMedian(
    base,
    change,
    sortedBase,
    sortedChange
  );

  return await renderInlinePlot(
    inlinePlotCanvas,
    data,
    outputFolder,
    plotName,
    plotId,
    true
  );
}

const inlinePlotCanvasByNumExes: ChartJSNodeCanvas[] = [];

async function createExeInlinePlot(
  exeNames: string[],
  values: number[][],
  outputFolder: string,
  plotName: string,
  plotId: number,
  exeColors: Map<string, string>
): Promise<string> {
  if (!inlinePlotCanvasByNumExes[exeNames.length]) {
    const height = calculateInlinePlotHeight(exeNames.length);
    inlinePlotCanvasByNumExes[exeNames.length] = createCanvas({
      ...siteAesthetics.inlinePlot,
      height
    });
  }

  const data: ChangeData = getDataSeriesNormalizedToBaselineMedian(
    exeNames,
    values
  );

  const exeColorsArray = exeNames.map((e) => <string>exeColors.get(e));

  return await renderInlinePlot(
    inlinePlotCanvasByNumExes[exeNames.length],
    data,
    outputFolder,
    plotName,
    plotId,
    false,
    exeColorsArray
  );
}

function recordPerCriteria(
  perCriteria: Map<string, ComparisonStatsWithUnit>,
  measurements: Measurements[],
  i: number,
  offset: number,
  changeStats: ComparisonStatistics
) {
  const criterionName = measurements[i + offset].criterion.name;
  let allStats = perCriteria.get(criterionName);
  if (allStats === undefined) {
    allStats = {
      data: [],
      unit: measurements[i + offset].criterion.unit
    };
    perCriteria.set(criterionName, allStats);
  }
  allStats.data.push(changeStats);
}

export async function calculateAllChangeStatisticsAndInlinePlots(
  byExeSuiteBench: ResultsByExeSuiteBenchmark,
  hasProfiles: HasProfile | null,
  base: string,
  change: string,
  baseOffset: number,
  changeOffset: number,
  criteria: Map<string, ComparisonStatsWithUnit> | null = null,
  outputFolder: string | null = null,
  plotName: string | null = null
): Promise<{ numRunConfigs: number; comparisonData: ByExeSuiteComparison }> {
  const comparisonData = new Map<string, Map<string, CompareStatsTable>>();
  // those two counts are likely always the same,
  // but for the moment, I'll keep them separate
  let lastPlotId = 0;
  let numRunConfigs = 0;

  for (const [exe, bySuite] of byExeSuiteBench.entries()) {
    const bySuiteCompare = new Map<string, CompareStatsTable>();
    comparisonData.set(exe, bySuiteCompare);

    for (const [suite, suiteWithBench] of bySuite.entries()) {
      const byBenchmark: CompareStatsTable = {
        benchmarks: [],
        criteria: suiteWithBench.criteria
      };

      for (const bench of suiteWithBench.benchmarks.values()) {
        const result = await calculateChangeStatsForBenchmark(
          bench,
          hasProfiles,
          base,
          change,
          baseOffset,
          changeOffset,
          criteria,
          lastPlotId,
          outputFolder,
          plotName
        );

        lastPlotId = result.lastPlotId;
        numRunConfigs += result.numRunConfigs;

        byBenchmark.benchmarks.push(...result.stats);
      }

      bySuiteCompare.set(suite, byBenchmark);
    }
  }
  return { numRunConfigs, comparisonData };
}

/**
 * Flip the data around. For each suite, we want to have
 * all the data of the executors for each benchmark.
 */
export function groupDataBySuiteAndBenchmark(
  byExeSuiteBench: ResultsByExeSuiteBenchmark,
  suitesWithMultipleExecutors: string[]
): { bySuite: AcrossExesBySuite; executors: Set<string> } {
  const resultsBySuite = new Map<string, AllResultsByBenchmark>();
  const executors = new Set<string>();
  for (const [exe, bySuite] of byExeSuiteBench.entries()) {
    for (const [suite, byBench] of bySuite.entries()) {
      if (!suitesWithMultipleExecutors.includes(suite)) {
        // skip suites that only have a single executor
        continue;
      }
      executors.add(exe);

      let resultSuite = resultsBySuite.get(suite);
      if (resultSuite === undefined) {
        // TODO: the set of criteria here might differ
        //       across executors and benchmarks
        resultSuite = { benchmarks: new Map(), criteria: byBench.criteria };
        resultsBySuite.set(suite, resultSuite);
      }

      for (const [bench, result] of byBench.benchmarks.entries()) {
        let byBench = resultSuite.benchmarks.get(bench);
        if (byBench === undefined) {
          byBench = [];
          resultSuite.benchmarks.set(bench, byBench);
        }

        byBench.push(result);
      }
    }
  }

  return { bySuite: resultsBySuite, executors };
}

export async function calculateAcrossExesStatsAndAllPlots(
  byExeSuiteBench: ResultsByExeSuiteBenchmark,
  suitesWithMultipleExecutors: string[],
  hasProfiles: HasProfile | null,
  changeOffset: number,
  criteria: Map<string, ComparisonStatsWithUnit>,
  outputFolder: string,
  plotName: string
): Promise<BySuiteComparison> {
  const result = new Map<string, CompareStatsTable>();

  const { bySuite, executors } = groupDataBySuiteAndBenchmark(
    byExeSuiteBench,
    suitesWithMultipleExecutors
  );

  const exeColors = siteAesthetics.getColorsForExecutors(executors);
  let lastPlotId = 0;

  for (const [suite, suiteWithBench] of bySuite.entries()) {
    const byBenchmark: CompareStatsTable = {
      benchmarks: [],
      criteria: suiteWithBench.criteria
    };

    for (const results of suiteWithBench.benchmarks.values()) {
      // 1. calculate stats and inline plots per benchmark
      const result = await calculateAcrossExesStatsForBenchmark(
        results,
        hasProfiles,
        changeOffset,
        criteria,
        lastPlotId,
        outputFolder,
        plotName,
        exeColors
      );

      lastPlotId = result.lastPlotId;
      byBenchmark.benchmarks.push(...result.stats);
    }

    // if there's no data, we don't report this as a result
    if (byBenchmark.benchmarks.length > 0) {
      // 2. create per-suite overview plot
      const changeData = getChangeDataByExe(byBenchmark, 'total');
      const runTimeFactor = calculateRunTimeFactorFor(changeData);

      byBenchmark.overviewSvgUrl = await renderOverviewPlot(
        outputFolder,
        plotName,
        suite,
        runTimeFactor,
        changeData.labels.map((l) => <string>exeColors.get(l))
      );
      byBenchmark.baselineExeName = changeData.labels[0];

      result.set(suite, byBenchmark);
    }
  }

  return result;
}

export async function calculateAcrossExesStatsForBenchmark(
  results: ProcessedResult[],
  hasProfiles: HasProfile | null,
  changeOffset: number,
  perCriteria: Map<string, ComparisonStatsWithUnit>,
  lastPlotId: number,
  outputFolder: string,
  plotName: string,
  exeColors: Map<string, string>
): Promise<{
  stats: CompareStatsRow[];
  lastPlotId: number;
}> {
  const resultStats = new Map<string, CompareStatsRow>();

  // sort results alphabetically, and results[0] is the baseline
  results.sort((a, b) => a.exe.localeCompare(b.exe));

  // identify the exes
  const exes = new Set<string>();
  for (const result of results) {
    exes.add(result.exe);

    // make sure we have the expected structure
    assertBasicPropertiesOfSortedMeasurements(result, 0, 1);
    assert(
      result.measurements.length === results[0].measurements.length,
      'For the rest of this code to work, ' +
        'we assume that all results have the same shape, i.e., set of criteria.'
    );
  }

  const exesArr = [...exes];

  assert(exes.size === results.length, 'We expect a single result per exe');

  const count = countVariantsAndDropMissing(results[0], '', '');

  // the measurements may still mix different run ids
  // since we assume the same set of criteria for all results,
  // we iterate over the pairs of base/change
  const iterM = results[0].measurements;
  for (let i = 0; i < iterM.length; i += 2) {
    const criterion = iterM[i + changeOffset].criterion.name;

    const values: number[][] = [];

    for (const result of results) {
      assert(
        result.measurements[i + changeOffset].criterion.name === criterion,
        'We expect the same criteria to be at the same index'
      );
      const sorted = result.measurements[i + changeOffset].values.flat();
      sorted.sort((a, b) => a - b);
      values.push(sorted);
    }

    const stats = calculateChangeStatisticsForFirstAsBaseline(values);

    const row = addOrGetCompareStatsRow(
      resultStats,
      count,
      results[0].measurements[i + changeOffset],
      results[0],
      hasProfiles
    );

    // initialize the exeStats with the executor names
    if (!row.exeStats) {
      row.exeStats = [];
      for (const result of results) {
        row.exeStats.push({
          exeName: result.exe,
          criteria: {}
        });
      }
    }

    // populate the exeStats for the current criterion
    for (let j = 0; j < stats.length; j += 1) {
      row.exeStats[j].criteria[criterion] = stats[j];
    }

    if (criterion === siteConfig.inlinePlotCriterion) {
      lastPlotId += 1;
      row.inlinePlot = await createExeInlinePlot(
        exesArr,
        values,
        outputFolder,
        plotName,
        lastPlotId,
        exeColors
      );
    }

    // TODO: extract per criteria for overview plot
  }

  return { stats: [...resultStats.values()], lastPlotId };
}

export interface ChangeData {
  /** Labels for the data series to be plotted. */
  labels: string[];

  /** Data of the data series. */
  data: number[][];
}

export type BySuiteChangeData = Map<string, ChangeData>;
export type ByGroupChangeData = Map<string, ChangeData>;

export function getChangeDataBySuiteAndExe(
  byExeSuiteBench: ByExeSuiteComparison,
  criterion: string
): BySuiteChangeData {
  const bySuiteAndExe = new Map<string, ChangeData>();

  for (const [exe, bySuite] of byExeSuiteBench.entries()) {
    for (const [suite, byBench] of bySuite.entries()) {
      let bySuiteChangeData = bySuiteAndExe.get(suite);
      if (bySuiteChangeData === undefined) {
        bySuiteChangeData = { labels: [], data: [] };
        bySuiteAndExe.set(suite, bySuiteChangeData);
      }

      const changeDataForExe: number[] = [];

      for (const bench of byBench.benchmarks.values()) {
        if (bench.versionStats === undefined) {
          continue;
        }

        const changeStats = bench.versionStats[criterion];
        if (changeStats === undefined) {
          continue;
        }

        changeDataForExe.push(changeStats.change_m);
      }

      bySuiteChangeData.labels.push(exe);
      bySuiteChangeData.data.push(changeDataForExe);
    }
  }

  return bySuiteAndExe;
}

export function getChangeDataByExe(
  byBenchmark: CompareStatsTable,
  criterion: string
): ChangeData {
  const byExe: ChangeData = { labels: [], data: [] };

  for (const b of byBenchmark.benchmarks) {
    if (!b.exeStats) {
      throw new Error('Expected exeStats to be defined already');
    }
    for (const e of b.exeStats) {
      let i = byExe.labels.indexOf(e.exeName);
      if (i < 0) {
        i = byExe.labels.length;
        byExe.labels.push(e.exeName);
        byExe.data.push([]);
      }

      byExe.data[i].push(e.criteria[criterion].change_m);
    }
  }

  return byExe;
}

export function calculateRunTimeFactor(
  changeData: BySuiteChangeData
): BySuiteChangeData {
  const bySuiteAndExe = new Map<string, ChangeData>();

  for (const [suite, data] of changeData.entries()) {
    const result = calculateRunTimeFactorFor(data);
    bySuiteAndExe.set(suite, result);
  }

  return bySuiteAndExe;
}

function calculateRunTimeFactorFor(data: ChangeData) {
  const bySuiteChangeData: ChangeData = { labels: data.labels, data: [] };

  for (const exe of data.data) {
    bySuiteChangeData.data.push(exe.map((v) => v + 1));
  }

  return bySuiteChangeData;
}

/**
 * If there's only a single exe in each suite, flip the data around.
 */
export function arrangeChangeDataForChart(
  changeData: BySuiteChangeData
): ByGroupChangeData {
  const [allAreTheSame, exeName] = allExesAreTheSame(changeData);

  if (!allAreTheSame || exeName === null) {
    return changeData;
  }

  const byExe = new Map<string, ChangeData>();
  const newData: ChangeData = { labels: [], data: [] };
  byExe.set(exeName, newData);

  for (const [suite, data] of changeData.entries()) {
    newData.labels.push(suite);
    newData.data.push(data.data[0]);
  }

  return byExe;
}

export function allExesAreTheSame(
  changeData: BySuiteChangeData
): [boolean, string | null] {
  let allExesAreTheSame = true;
  let exeName: string | null = null;

  for (const data of changeData.values()) {
    if (data.labels.length !== 1) {
      allExesAreTheSame = false;
      break;
    }

    if (exeName === null) {
      exeName = data.labels[0];
    } else if (exeName !== data.labels[0]) {
      allExesAreTheSame = false;
      break;
    }
  }

  if (!allExesAreTheSame) {
    exeName = null;
  }

  return [allExesAreTheSame, exeName];
}

export function calculateDataForOverviewPlot(
  byExeSuiteBench: ByExeSuiteComparison,
  criterion: string
): ByGroupChangeData {
  const changeData = getChangeDataBySuiteAndExe(byExeSuiteBench, criterion);
  const runTimeFactor = calculateRunTimeFactor(changeData);
  return arrangeChangeDataForChart(runTimeFactor);
}

export async function prepareCompareView(
  results: MeasurementData[],
  environments: Environment[],
  hasProfiles: HasProfile | null,
  reportId: string,
  projectSlug: string,
  revDetails: RevisionComparison,
  reportOutputFolder: string
): Promise<CompareViewWithData> {
  const collatedMs = collateMeasurements(results);

  const navigation = getNavigation(collatedMs);

  const allStats = await calculateAllStatisticsAndRenderPlots(
    collatedMs,
    navigation.navExeComparison.suites,
    hasProfiles,
    revDetails.baseCommitId,
    revDetails.changeCommitId,
    reportId,
    reportOutputFolder,
    `${reportId}/inline`
  );

  const data: CompareViewWithData = {
    revisionFound: true,
    project: projectSlug,
    baselineHash: revDetails.baseCommitId,
    changeHash: revDetails.changeCommitId,
    baselineHash6: revDetails.baseCommitId6,
    changeHash6: revDetails.changeCommitId6,
    base: <RevisionData>revDetails.base,
    change: <RevisionData>revDetails.change,

    navigation,
    hasExeComparison: navigation.navExeComparison.suites.length > 0,

    noData: false, // TODO: need to derive this from one of the stats details
    notInBoth: null, // TODO: need to get this out of the stats calculations

    stats: { ...allStats, environments },
    config: {
      reportsUrl: siteConfig.reportsUrl,
      overviewPlotWidth: siteAesthetics.overviewPlotWidth
    }
    // reportId,
  };

  return data;
}

export async function calculateAllStatisticsAndRenderPlots(
  byExeSuiteBench: ResultsByExeSuiteBenchmark,
  suitesWithMultipleExecutors: string[],
  hasProfiles: HasProfile | null,
  base: string,
  change: string,
  reportId: string,
  reportOutputFolder: string,
  inlinePlotName: string
): Promise<AllStats> {
  const { baseOffset, changeOffset } = getCommitOffsetsInSortedMeasurements(
    base,
    change
  );

  const absolutePath = `${reportOutputFolder}/${reportId}`;
  mkdirSync(absolutePath, { recursive: true });

  const criteriaAcrossVersions = new Map<string, ComparisonStatsWithUnit>();
  const criteriaAcrossExes = new Map<string, ComparisonStatsWithUnit>();

  const { numRunConfigs, comparisonData } =
    await calculateAllChangeStatisticsAndInlinePlots(
      byExeSuiteBench,
      hasProfiles,
      base,
      change,
      baseOffset,
      changeOffset,
      criteriaAcrossVersions,
      reportOutputFolder,
      inlinePlotName
    );

  const acrossExes = await calculateAcrossExesStatsAndAllPlots(
    byExeSuiteBench,
    suitesWithMultipleExecutors,
    hasProfiles,
    changeOffset,
    criteriaAcrossExes,
    reportOutputFolder,
    inlinePlotName + '-exe'
  );

  const plotData = calculateDataForOverviewPlot(comparisonData, 'total');

  const files = await renderOverviewPlots(
    reportOutputFolder,
    `${reportId}/overview`,
    plotData
  );

  return {
    acrossVersions: {
      summary: {
        stats: calculateSummaryOfChangeSummaries(criteriaAcrossVersions),
        numRunConfigs,
        overviewPngUrl: files.png,
        overviewSvgUrls: files.svg
      },
      allMeasurements: comparisonData
    },
    acrossExes
  };
}

export function getNavigation(
  data: ResultsByExeSuiteBenchmark
): CompareNavPartial {
  const executors = new Map<string, Set<string>>(); // executor -> suites
  const allSuites = new Map<string, Set<string>>(); // suite -> executors

  for (const [exe, suites] of data.entries()) {
    executors.set(exe, new Set(suites.keys()));

    for (const suite of suites.keys()) {
      let execs: Set<string> | undefined = allSuites.get(suite);
      if (!execs) {
        execs = new Set();
        allSuites.set(suite, execs);
      }
      execs.add(exe);
    }
  }

  const result: { exeName: string; suites: string[] }[] = [];
  const exes = Array.from(executors.entries());
  exes.sort((a, b) => a[0].localeCompare(b[0]));
  for (const [key, val] of exes) {
    const suitesSorted = Array.from(val);
    suitesSorted.sort((a, b) => a.localeCompare(b));
    result.push({ exeName: key, suites: suitesSorted });
  }

  const suitesWithMultipleExecutors: string[] = [];
  for (const [suite, execs] of allSuites) {
    if (execs.size > 1) {
      suitesWithMultipleExecutors.push(suite);
    }
  }

  suitesWithMultipleExecutors.sort((a, b) => a.localeCompare(b));

  return {
    nav: result,
    navExeComparison: { suites: suitesWithMultipleExecutors }
  };
}
