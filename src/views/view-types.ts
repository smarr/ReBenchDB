import { BenchmarkId } from 'api';
import { Environment } from 'db';
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

export interface CompareStatsRowAcrossExes extends DataFormat, ViewHelpers {
  exes: {
    name: string;
    total: ComparisonStatistics;
    gcTime: ComparisonStatistics;
    allocated: ComparisonStatistics;
  }[];
}

export interface CompareStatsRowAcrossVersions extends DataFormat, ViewHelpers {
  total: ComparisonStatistics;
  gcTime: ComparisonStatistics;
  allocated: ComparisonStatistics;
}

export interface ButtonsAdditionalInfo
  extends BenchmarkId,
    DataFormat,
    ViewHelpers {
  cmdline: string;

  environments: Environment[];
  envId: number;

  warmupPlotUrl?: string;

  hasProfileData: boolean;

  base: {
    commitId: string;
    runId: number;
    trialId: number;
  };

  change: {
    commitId: string;
    runId: number;
    trialId: number;
  };

  /** Number of Versions */
  numV: number;

  /** Number of Cores */
  numC: number;

  /** Number of Input Sizes */
  numI: number;

  /** Number of Extra Argument */
  numEa: number;
}
