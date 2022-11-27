import { dirname } from 'path';
import { fileURLToPath } from 'url';

export function getDirname(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

const __dirname = getDirname(import.meta.url);

export const robustPath = __dirname.includes('dist/')
  ? function (path) {
      return `${__dirname}/../../src/${path}`;
    }
  : function (path) {
      return `${__dirname}/${path}`;
    };

export const robustSrcPath = !__dirname.includes('dist/')
  ? function (path) {
      return `${__dirname}/../dist/src/${path}`;
    }
  : function (path) {
      return `${__dirname}/${path}`;
    };

export const dbConfig = {
  user: process.env.RDB_USER || '',
  password: process.env.RDB_PASS || '',
  host: process.env.RDB_HOST || 'localhost',
  database: process.env.RDB_DB || 'test_rdb4',
  port: 5432
};

/** How long to still hold on to the cache after it became invalid. In ms. */
export const cacheInvalidationDelay = 1000 * 60 * 5; /* 5 minutes */

const _rebench_dev = 'https://rebench.dev';

export function isReBenchDotDev(): boolean {
  return siteConfig.publicUrl === _rebench_dev;
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
    process.env.GITHUB_PK || 'rebenchdb.2020-08-11.private-key.pem'
};

export const TotalCriterion = 'total';
