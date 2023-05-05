import { BenchmarkId } from 'api';
import { CriterionData, Environment, RevisionData } from 'db';
import { ComparisonStatistics, BasicSummaryStatistics } from 'stats';

declare type DataFormat = typeof import('../data-format');
declare type ViewHelpers = typeof import('./helpers');

/** Summary statistics for the overall comparison. */
export interface StatsSummary {
  /** The URL to a PNG with the overview statistics. */
  overviewPngUrl: string;

  /** The URLs to SVGs with the overview statistics. */
  overviewSvgUrls: string[];

  numRunConfigs: number;
  total: BasicSummaryStatistics;
  gcTime: BasicSummaryStatistics;
  allocated: BasicSummaryStatistics;
}

/** Types for the Compare Partials */

export type CompareStatsTableHeader = Record<string, CriterionData>;

export interface CompareStatsTableHeaderPartial {
  criteria: CompareStatsTableHeader;
}

export interface CompareStatsRowAcrossExes {
  name: string;
  total: ComparisonStatistics;
  gcTime: ComparisonStatistics;
  allocated: ComparisonStatistics;
}

export interface CompareStatsRowAccrossExesPartial {
  exes: CompareStatsRowAcrossExes[];
  dataFormatters: DataFormat;
  viewHelpers: ViewHelpers;
}

export interface CompareStatsRowAcrossVersions {
  total: ComparisonStatistics;
  gcTime: ComparisonStatistics;
  allocated: ComparisonStatistics;
}

export interface CompareStatsRowAcrossVersionsPartial {
  stats: CompareStatsRowAcrossVersions;
  dataFormatters: DataFormat;
}

export interface ProfileId {
  commitId: string;
  runId: number;
  trialId: number;
}

export interface ProfileIds {
  base: ProfileId;
  change: ProfileId;
}

export interface DetailedInfo {
  cmdline: string;

  envId: number;

  warmupPlotUrl?: string;

  profileIds?: ProfileIds;

  /** Number of VarValues */
  numV: number;

  /** Number of Cores */
  numC: number;

  /** Number of Input Sizes */
  numI: number;

  /** Number of Extra Argument */
  numEa: number;
}

export interface CompareStatsRow {
  benchId: BenchmarkId;
  details: DetailedInfo;

  inlinePlot: string;

  /** The commit id for which data is missing for the comparison. */
  missingCommitId?: string;

  versionStats?: CompareStatsRowAcrossVersions;
  exeStats?: CompareStatsRowAcrossExes[];
}

export interface CompareStatsRowPartial {
  stats: CompareStatsRow;
  environments: Environment[];
  dataFormatters: DataFormat;
  viewHelpers: ViewHelpers;
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
}

export interface CompareNavPartial {
  nav: { exeName: string; suites: string[] }[];
  navExeComparison: { suites: string[] };
}

export type BySuiteComparison = Map<string, CompareStatsTable>;
export type ByExeSuiteComparison = Map<string, BySuiteComparison>;

export interface CompareVersionsPartial {
  allMeasurements: ByExeSuiteComparison;
  environments: Environment[];
  dataFormatters: DataFormat;
  viewHelpers: ViewHelpers;
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

  stats: CompareVersionsPartial;
}

export type CompareView = CompareViewWithoutData | CompareViewWithData;
