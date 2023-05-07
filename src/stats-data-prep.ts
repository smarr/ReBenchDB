import { mkdirSync } from 'node:fs';
import { assert } from './logging.js';
import {
  ComparisonStatistics,
  calculateChangeStatistics,
  calculateSummaryOfChangeSummaries,
  median,
  normalize
} from './stats.js';
import {
  CriterionData,
  Environment,
  MeasurementData,
  Measurements,
  ProcessedResult,
  RevisionComparison,
  RevisionData
} from './db.js';
import {
  ByExeSuiteComparison,
  CompareNavPartial,
  CompareStatsRow,
  CompareStatsRowAcrossVersions,
  CompareStatsTable,
  CompareViewWithData,
  StatsSummary
} from './views/view-types.js';
import {
  createCanvas,
  renderInlinePlot,
  renderOverviewPlots
} from './charts.js';
import { siteAesthetics, siteConfig } from './util.js';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import { collateMeasurements } from './db-data-processing.js';

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

export function getCommitOffsetsInSortedMeasurements(
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

let inlinePlotCanvas: ChartJSNodeCanvas | null = null;

export function getDataNormalizedToBaselineMedian(
  base: Measurements,
  change: Measurements
): ChangeData {
  const sortedB = base.values.flat();
  const sortedC = change.values.flat();
  sortedB.sort((a, b) => a - b);
  sortedC.sort((a, b) => a - b);
  const baseM = median(sortedB);

  return {
    labels: [base.commitId, change.commitId],
    data: [normalize(sortedB, baseM), normalize(sortedC, baseM)]
  };
}

export async function convertMeasuresToBenchmarks(
  bench: ProcessedResult,
  baseOffset: number,
  changeOffset: number,
  outputFolder: string,
  plotName: string,
  lastPlotId: number
): Promise<{ stats: CompareStatsRow[]; lastPlotId: number }> {
  // Start by checking some basic assertions.
  // This is mostly for my own sanity,
  // and to encode the invariants that we assume.

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
    // TODO: missingCommitId handling here?
    throw new Error(
      'base and change are the same for ' +
        `${bench.bench}, ${bench.exe}, ${bench.suite}, ` +
        `but are expected to be different` +
        `both are ${bench.measurements[0].commitId}`
    );
  }

  const benchmarks: CompareStatsRow[] = [];
  let lastEnvId = -1;
  let lastVarValue: string | null = null;
  let lastCores: string | null = null;
  let lastInputSize: string | null = null;
  let lastExtraArgs: string | null = null;

  let numV = 0;
  let numC = 0;
  let numI = 0;
  let numEa = 0;

  let versionStats: CompareStatsRowAcrossVersions = {};
  let numVersionStats = 0;
  let inlinePlotUrl: string | undefined = undefined;

  for (let i = 0; i < bench.measurements.length; i += 2) {
    const isLastIteration = i + 2 >= bench.measurements.length;

    let sameAsLast = true;

    const m = bench.measurements[i + baseOffset];
    if (lastEnvId === -1) {
      lastEnvId = m.envId;
      lastVarValue = m.runSettings.varValue;
      lastCores = m.runSettings.cores;
      lastInputSize = m.runSettings.inputSize;
      lastExtraArgs = m.runSettings.extraArgs;
    } else {
      if (lastEnvId !== m.envId) {
        sameAsLast = false;
      }

      if (lastVarValue !== m.runSettings.varValue) {
        sameAsLast = false;
        numV += 1;
      }

      if (lastCores !== m.runSettings.cores) {
        sameAsLast = false;
        numC += 1;
      }

      if (lastInputSize !== m.runSettings.inputSize) {
        sameAsLast = false;
        numI += 1;
      }

      if (lastExtraArgs !== m.runSettings.extraArgs) {
        sameAsLast = false;
        numEa += 1;
      }
    }

    if (!sameAsLast && numVersionStats > 0) {
      if (inlinePlotUrl === undefined) {
        throw new Error(
          'inlinePlotUrl has not been set for ' +
            `${bench.bench}, ${bench.exe}, ${bench.suite}. `
        );
      }

      const b: CompareStatsRow = {
        benchId: {
          b: bench.bench,
          e: bench.exe,
          s: bench.suite
        },
        details: {
          cmdline: m.runSettings.simplifiedCmdline,
          envId: m.envId,
          hasProfiles: false, // TODO
          hasWarmup: false, // TODO
          // profileIds,
          numV,
          numC,
          numI,
          numEa
        },
        inlinePlot: inlinePlotUrl,
        missingCommitId: undefined, // TODO
        versionStats: versionStats
        // exeStats: undefined
      };
      benchmarks.push(b);
      versionStats = {};
    }

    const change = bench.measurements[i + changeOffset];
    if (!change.changeStats) {
      throw new Error(
        'changeStats has not yet been set ' +
          `for ${bench.bench}, ${bench.exe}, ${bench.suite}. ` +
          `This should have been done in calculateAllChangeStatistics()`
      );
    }
    versionStats[change.criterion.name] = change.changeStats;
    if (change.criterion.name === 'total') {
      if (inlinePlotCanvas === null) {
        inlinePlotCanvas = createCanvas(
          siteAesthetics.inlinePlot.height,
          siteAesthetics.inlinePlot.width,
          'svg',
          'boxplot'
        );
      }

      const data = getDataNormalizedToBaselineMedian(m, change);

      lastPlotId += 1;

      inlinePlotUrl = await renderInlinePlot(
        inlinePlotCanvas,
        data,
        outputFolder,
        plotName,
        lastPlotId
      );
    }

    numVersionStats += 1;

    if (isLastIteration) {
      if (inlinePlotUrl === undefined) {
        throw new Error(
          'inlinePlotUrl has not been set for ' +
            `${bench.bench}, ${bench.exe}, ${bench.suite}. `
        );
      }

      const b: CompareStatsRow = {
        benchId: {
          b: bench.bench,
          e: bench.exe,
          s: bench.suite
        },
        details: {
          cmdline: m.runSettings.simplifiedCmdline,
          envId: m.envId,
          // profileIds,
          hasProfiles: false, // TODO
          hasWarmup: false, // TODO
          numV,
          numC,
          numI,
          numEa
        },
        inlinePlot: inlinePlotUrl,
        missingCommitId: undefined, // TODO
        versionStats: versionStats
        // exeStats: undefined
      };
      benchmarks.push(b);
    }

    // TODO: get the profileIds
    // const profileIds = {
    //   base: {
    //     commitId: bench.measurements[i + baseOffset].commitId,
    //     runId: bench.measurements[i + baseOffset].runSettings.runId,
    //     trialId: bench.measurements[i + baseOffset].runSettings.trialId,
    //   },
    //   change: {
    //     commitId: bench.measurements[i + changeOffset].commitId,
    //     runId: bench.measurements[i + changeOffset].runSettings.runId,
    //     trialId: bench.measurements[i + changeOffset].runSettings.trialId,
    //   }
    // };
  }

  // do extra pass to adjust the counts as needed
  if (numV > 0 || numC > 0 || numI > 0 || numEa > 0) {
    for (const b of benchmarks) {
      b.details.numV = numV;
      b.details.numC = numC;
      b.details.numI = numI;
      b.details.numEa = numEa;
    }
  }

  return { stats: benchmarks, lastPlotId };
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

export function calculateChangeStatsForBenchmark(
  measurements: Measurements[],
  baseOffset: number,
  changeOffset: number,
  perCriteria: Map<string, ComparisonStatistics[]> | null
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

    const stats = calculateChangeStatistics(sortedBase, sortedChange);
    measurements[i + changeOffset].changeStats = stats;

    if (perCriteria !== null) {
      const criterionName = measurements[i + baseOffset].criterion.name;
      let allStats = perCriteria.get(criterionName);
      if (allStats === undefined) {
        allStats = [];
        perCriteria.set(criterionName, allStats);
      }
      allStats.push(stats);
    }
  }

  return undefined;
}

export async function calculateAllChangeStatisticsAndInlinePlots(
  byExeSuiteBench: ResultsByExeSuiteBenchmark,
  baseOffset: number,
  changeOffset: number,
  criteria: Map<string, ComparisonStatistics[]> | null,
  outputFolder: string,
  plotName: string
): Promise<{ numRunConfigs: number; comparisonData: ByExeSuiteComparison }> {
  const comparisonData = new Map<string, Map<string, CompareStatsTable>>();
  // those two counts are likely always the same,
  // but for the moment, I'll keep themseparate
  let lastPlotId = 0;
  let numRunConfigs = 0;

  for (const [exe, bySuite] of byExeSuiteBench.entries()) {
    const bySuiteCompare = new Map<string, CompareStatsTable>();
    comparisonData.set(exe, bySuiteCompare);

    for (const [suite, byBench] of bySuite.entries()) {
      const byBenchmark: CompareStatsTable = {
        benchmarks: [],
        criteria: byBench.criteria
      };

      for (const bench of byBench.benchmarks.values()) {
        numRunConfigs += 1;

        const dropped = calculateChangeStatsForBenchmark(
          bench.measurements,
          baseOffset,
          changeOffset,
          criteria
        );

        if (dropped) {
          throw new Error(
            'TODO: storing details about dropped data to show in the UI'
          );
        }

        const result = await convertMeasuresToBenchmarks(
          bench,
          baseOffset,
          changeOffset,
          outputFolder,
          plotName,
          lastPlotId
        );
        byBenchmark.benchmarks.push(...result.stats);
        lastPlotId = result.lastPlotId;
      }

      bySuiteCompare.set(suite, byBenchmark);
    }
  }
  return { numRunConfigs, comparisonData };
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
  byExeSuiteBench: ResultsByExeSuiteBenchmark,
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
        for (const m of bench.measurements) {
          if (m.changeStats === undefined) {
            continue;
          }

          if (m.criterion.name !== criterion) {
            continue;
          }

          changeDataForExe.push(m.changeStats.change_m);
        }
      }

      bySuiteChangeData.labels.push(exe);
      bySuiteChangeData.data.push(changeDataForExe);
    }
  }

  return bySuiteAndExe;
}

export function calculateRunTimeFactor(
  changeData: BySuiteChangeData
): BySuiteChangeData {
  const bySuiteAndExe = new Map<string, ChangeData>();

  for (const [suite, data] of changeData.entries()) {
    const bySuiteChangeData: ChangeData = { labels: data.labels, data: [] };
    bySuiteAndExe.set(suite, bySuiteChangeData);

    for (const exe of data.data) {
      bySuiteChangeData.data.push(exe.map((v) => v + 1));
    }
  }

  return bySuiteAndExe;
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
  byExeSuiteBench: ResultsByExeSuiteBenchmark,
  criterion: string
): ByGroupChangeData {
  const changeData = getChangeDataBySuiteAndExe(byExeSuiteBench, criterion);
  const runTimeFactor = calculateRunTimeFactor(changeData);
  return arrangeChangeDataForChart(runTimeFactor);
}

export async function prepareCompareView(
  results: MeasurementData[],
  environments: Environment[],
  reportId: string,
  projectSlug: string,
  revDetails: RevisionComparison,
  reportOutputFolder: string
): Promise<CompareViewWithData> {
  const collatedMs = collateMeasurements(results);
  const { summary, allMeasurements } =
    await calculateAllStatisticsAndRenderPlots(
      collatedMs,
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
    navigation: getNavigation(collatedMs),

    noData: false, // TODO: need to derive this from one of the stats details
    notInBoth: null, // TODO: need to get this out of the stats calculations

    statsSummary: summary,
    stats: {
      allMeasurements,
      environments
    },
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
  base: string,
  change: string,
  reportId: string,
  reportOutputFolder: string,
  inlinePlotName: string
): Promise<{ summary: StatsSummary; allMeasurements: ByExeSuiteComparison }> {
  const { baseOffset, changeOffset } = getCommitOffsetsInSortedMeasurements(
    base,
    change
  );

  const criteria = new Map<string, ComparisonStatistics[]>();

  const { numRunConfigs, comparisonData } =
    await calculateAllChangeStatisticsAndInlinePlots(
      byExeSuiteBench,
      baseOffset,
      changeOffset,
      criteria,
      reportOutputFolder,
      inlinePlotName
    );

  const absolutePath = `${reportOutputFolder}/${reportId}`;
  mkdirSync(absolutePath, { recursive: true });

  const plotData = calculateDataForOverviewPlot(byExeSuiteBench, 'total');

  const files = await renderOverviewPlots(
    reportOutputFolder,
    `${reportId}/overview`,
    plotData
  );

  return {
    summary: {
      stats: calculateSummaryOfChangeSummaries(criteria),
      numRunConfigs,
      overviewPngUrl: files.png,
      overviewSvgUrls: files.svg
    },
    allMeasurements: comparisonData
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
