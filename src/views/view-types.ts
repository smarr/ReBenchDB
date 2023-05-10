import { BenchmarkId } from 'api';
import { CriterionData, Environment, RevisionData } from 'db';
import { ComparisonStatistics, BasicSummaryStatistics } from 'stats';

declare type DataFormat = typeof import('../data-format');
declare type ViewHelpers = typeof import('./helpers');

/** Summary statistics for the overall comparison. */
export interface StatsSummary {
  stats: Record<string, BasicSummaryStatistics>;

  /** The URL to a PNG with the overview statistics. */
  overviewPngUrl: string;

  /** The URLs to SVGs with the overview statistics. */
  overviewSvgUrls: string[];

  numRunConfigs: number;
}

export interface StatsSummaryPartial extends StatsSummary {
  config: ReportConfig;
  dataFormatters: DataFormat;
}

/** Types for the Compare Partials */

export type CompareStatsTableHeader = Record<string, CriterionData>;

export interface CompareStatsTableHeaderPartial {
  criteria: CompareStatsTableHeader;
}

export interface CompareStatsRowAcrossExes {
  name: string;
  criteria: Record<string, ComparisonStatistics>;
}

export interface CompareStatsRowAccrossExesPartial {
  exes: CompareStatsRowAcrossExes[];
  dataFormatters: DataFormat;
  viewHelpers: ViewHelpers;
}

export type CompareStatsRowAcrossVersions = Record<
  string,
  ComparisonStatistics
>;

export interface CompareStatsRowAcrossVersionsPartial {
  stats: CompareStatsRowAcrossVersions;
  dataFormatters: DataFormat;
}

/**
 * Identifies the set of measurements of a specific run, i.e., a concrete
 * benchmark execution, and a specific trial, i.e., in a specific environment.
 */
export interface DataSeriesId {
  commitId: string; // this one is a bit redundant, it's implied by the trialId
  runId: number;
  trialId: number;
}

export interface DataSeriesVersionComparison {
  base: DataSeriesId;
  change: DataSeriesId;
}

export interface DetailedInfo {
  cmdline: string;

  envId: number;

  hasWarmup: boolean;
  hasProfiles: boolean;

  dataSeries?: DataSeriesVersionComparison;

  /** Number of VarValues */
  numV: number;

  /** Number of Cores */
  numC: number;

  /** Number of Input Sizes */
  numI: number;

  /** Number of Extra Argument */
  numEa: number;

  /** Number of Environments */
  numEnv: number;
}

export interface MissingData {
  /* Commit hash for which the data is missing. */
  commitId: string;

  /* Criterion for which the data is missing. */
  criterion: CriterionData;
}

export interface CompareStatsRow {
  benchId: BenchmarkId;
  details: DetailedInfo;

  missing?: MissingData[];

  inlinePlot?: string;

  /** Statistics per criterion, comparing base and change. */
  versionStats?: CompareStatsRowAcrossVersions;
  exeStats?: CompareStatsRowAcrossExes[];
}

export interface CompareStatsRowPartial {
  stats: CompareStatsRow;
  environments: Environment[];
  dataFormatters: DataFormat;
  viewHelpers: ViewHelpers;
  config: ReportConfig;
}

export interface ButtonsAdditionalInfoPartial {
  details: DetailedInfo;
  benchId: BenchmarkId;
  environments: Environment[];
  dataFormatters: DataFormat;
}

export interface CompareStatsTable {
  criteria: CompareStatsTableHeader;
  benchmarks: CompareStatsRow[];
}

export interface CompareStatsTablePartial extends CompareStatsTable {
  environments: Environment[];
  dataFormatters: DataFormat;
  viewHelpers: ViewHelpers;
  config: ReportConfig;
}

export interface CompareNavPartial {
  nav: { exeName: string; suites: string[] }[];
  navExeComparison: { suites: string[] };
}

export type BySuiteComparison = Map<string, CompareStatsTable>;
export type ByExeSuiteComparison = Map<string, BySuiteComparison>;

export interface CompareVersions {
  allMeasurements: ByExeSuiteComparison;
  environments: Environment[];
}

export interface CompareVersionsPartial extends CompareVersions {
  dataFormatters: DataFormat;
  viewHelpers: ViewHelpers;
  config: ReportConfig;
}

export interface RefreshMenuPartial {
  /* Name of the project. */
  project: string;

  /* Full commit hash of the base commit. */
  baselineHash: string;

  /* Full commit hash of the change commit. */
  changeHash: string;
}

export interface CompareViewBasics {
  /** Name of the project. */
  project: string;

  baselineHash: string;
  changeHash: string;

  baselineHash6: string;
  changeHash6: string;
}

export interface CompareViewWithoutData extends CompareViewBasics {
  revisionFound: false;
}

export interface CompareViewWithData extends CompareViewBasics {
  revisionFound: true;

  noData: boolean;
  notInBoth: any; // TODO

  base: RevisionData;
  change: RevisionData;

  navigation: CompareNavPartial;
  statsSummary: StatsSummary;

  stats: CompareVersions;
  config: ReportConfig;
}

export interface ReportConfig {
  /** The URL part where reports are stored, and publically accessible. */
  reportsUrl: string;
  overviewPlotWidth: number;
}

export type CompareView = CompareViewWithoutData | CompareViewWithData;
