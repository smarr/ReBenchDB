import { cacheInvalidationDelay, dbConfig, statsConfig } from '../../util.js';
import { DatabaseWithPool } from '../../db.js';

export const db = new DatabaseWithPool(
  dbConfig,
  statsConfig.numberOfBootstrapSamples,
  true,
  cacheInvalidationDelay
);
