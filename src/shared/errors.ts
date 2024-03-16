import { log } from '../backend/logging.js';

export function reportConnectionRefused(e: any): void {
  if (e.errors && e.errors.length > 0) {
    for (const currentE of e.errors) {
      if (currentE.code == 'ECONNREFUSED' && currentE.port) {
        log.error(
          `Unable to connect to database on port ` +
            `${currentE.address}:${currentE.port}.\n`
        );
      }
    }
    log.error(
      'Connection refused.\n' +
        'ReBenchDB requires a Postgres database to work.'
    );
  } else {
    log.error(
      `Unable to connect to database on port ${e.address}:${e.port}.\n` +
        'Connection refused.\n' +
        'ReBenchDB requires a Postgres database to work.'
    );
  }
}

export function reportDatabaseInUse(e: any): void {
  log.error(e.message);
  log.error(e.detail);
}

export function reportOtherErrors(e: any): void {
  log.error('benchmark failed unexpectedly', e);
}
