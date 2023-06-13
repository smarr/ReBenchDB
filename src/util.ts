import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { promisify } from 'node:util';
import { gzip as gzipCallback } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { CanvasSettings } from 'charts';

const gzip = promisify(gzipCallback);

export async function storeJsonGzip(
  data: any[],
  filePath: string
): Promise<void> {
  const str = JSON.stringify(data);
  const compressedData = await gzip(str);
  await writeFile(filePath, compressedData);
}

export function getDirname(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

const __dirname = getDirname(import.meta.url);

/**
 * Get a robust path, relative to the source directory.
 */
export const robustPath = __dirname.includes('dist/')
  ? function (path) {
      return `${__dirname}/../../src/${path}`;
    }
  : function (path) {
      return `${__dirname}/${path}`;
    };

/**
 * Get a robust path in the compiled source directory.
 */
export const robustSrcPath = __dirname.includes('dist/')
  ? function (path) {
      return `${__dirname}/${path}`;
    }
  : function (path) {
      return `${__dirname}/../dist/src/${path}`;
    };

export const dbConfig = {
  user: process.env.RDB_USER || '',
  password: process.env.RDB_PASS || '',
  host: process.env.RDB_HOST || 'localhost',
  database: process.env.RDB_DB || 'rdb_smde',
  port: 5432
};

/** How long to still hold on to the cache after it became invalid. In ms. */
export const cacheInvalidationDelay = 1000 * 60 * 5; /* 5 minutes */

const _rebench_dev = 'https://rebench.dev';

export function isReBenchDotDev(): boolean {
  return siteConfig.publicUrl === _rebench_dev;
}

export function isRunningTests(): boolean {
  return (
    ('NODE_ENV' in process.env && process.env.NODE_ENV === 'test') ||
    ('JEST_WORKER_ID' in process.env &&
      process.env.JEST_WORKER_ID !== undefined)
  );
}

export const statsConfig = {
  numberOfBootstrapSamples: 50
};

export const siteConfig = {
  reportsUrl: process.env.REPORTS_URL || '/static/reports',
  staticUrl: process.env.STATIC_URL || '/static',
  publicUrl: process.env.PUBLIC_URL || _rebench_dev,
  appId: parseInt(process.env.GITHUB_APP_ID || '') || 76497,
  githubPrivateKey:
    process.env.GITHUB_PK || 'rebenchdb.2020-08-11.private-key.pem',

  canShowWarmup: (data: number[][]): boolean => {
    return data.some((ms) => ms.length >= 5);
  },
  inlinePlotCriterion: 'total'
};

const inlinePlot: CanvasSettings = {
  width: 336,
  height: 38,
  outputType: 'svg',
  plotType: 'boxplot'
};

export const siteAesthetics = {
  changeColor: '#e9b96e',
  baseColor: '#729fcf',

  changeColorLight: '#efd0a7',
  baseColorLight: '#97c4f0',

  fastColor: '#e4ffc7',
  slowColor: '#ffcccc',

  backgroundColor: '#ffffff',

  overviewPlotWidth: 432,

  inlinePlot
};

export const TotalCriterion = 'total';
