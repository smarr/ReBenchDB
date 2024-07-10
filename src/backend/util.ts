import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { promisify } from 'node:util';
import { gzip as gzipCallback } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { ValuesPossiblyMissing } from '../shared/api.js';

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
      return resolve(`${__dirname}/../../../src/${path}`);
    }
  : function (path) {
      return resolve(`${__dirname}/../${path}`);
    };

/**
 * Get a robust path in the compiled source directory.
 */
export const robustSrcPath = __dirname.includes('dist/')
  ? function (path) {
      return `${__dirname}/../${path}`;
    }
  : function (path) {
      return `${__dirname}/../../dist/src/${path}`;
    };

const port: number = process.env.RDB_PORT
  ? parseInt(process.env.RDB_PORT)
  : 5432;

const _rebench_dev = 'https://rebench.dev';
const reportsUrl = process.env.REPORTS_URL || '/static/reports';
const staticUrl = process.env.STATIC_URL || '/static';
const publicUrl = process.env.PUBLIC_URL || _rebench_dev;

// configuration for data export is a little more involved,
// because the database might run elsewhere, but may produce
// data files, which we need to be able to serve, at least in the dev mode.
const dbDataExportPath =
  process.env.RDB_DATA_EXPORT_PATH || robustPath('../resources/exp-data');

// I assume that Node has access to files produced by itself and PostgreSQL.
const nodeDataExportPath =
  process.env.NODE_DATA_EXPORT_PATH || dbDataExportPath;

const dataExportUrlBase = process.env.DATA_URL_BASE || `${staticUrl}/exp-data`;

export const dbConfig = {
  user: process.env.RDB_USER || '',
  password: process.env.RDB_PASS || '',
  host: process.env.RDB_HOST || 'localhost',
  database: process.env.RDB_DB || 'rdb_smde3',

  /** The path where PostgreSQL writes data files to. */
  dataExportPath: dbDataExportPath,
  port
};

export const refreshSecret =
  'REFRESH_SECRET' in process.env ? process.env.REFRESH_SECRET : undefined;

/** How long to still hold on to the cache after it became invalid. In ms. */
export const cacheInvalidationDelay = 1000 * 60 * 5; /* 5 minutes */

export function isReBenchDotDev(): boolean {
  return siteConfig.publicUrl === _rebench_dev;
}

export const isRunningTests =
  ('NODE_ENV' in process.env && process.env.NODE_ENV === 'test') ||
  ('JEST_WORKER_ID' in process.env && process.env.JEST_WORKER_ID !== undefined);

export const DEBUG =
  'DEBUG' in process.env ? process.env.DEBUG === 'true' : false;
export const DEV = 'DEV' in process.env ? process.env.DEV === 'true' : false;

export const statsConfig = {
  numberOfBootstrapSamples: 50
};

export const siteConfig = {
  port: process.env.PORT || 33333,
  reportsUrl,
  staticUrl,
  publicUrl,
  dataExportUrlBase,

  /**
   * The path where Node.js writes data files to,
   * and Postgres generated files are accessible.
   */
  dataExportPath: nodeDataExportPath,
  appId: parseInt(process.env.GITHUB_APP_ID || '') || 76497,
  githubPrivateKey:
    process.env.GITHUB_PK || 'rebenchdb.2020-08-11.private-key.pem',

  canShowWarmup: (data: ValuesPossiblyMissing[]): boolean => {
    return data.some((ms) => ms != null && ms.length >= 5);
  },
  inlinePlotCriterion: 'total'
};

export const TotalCriterion = 'total';

export const rebenchVersion = JSON.parse(
  readFileSync(robustPath('../package.json'), 'utf-8')
).version;
