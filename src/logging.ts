import { Logger } from 'tslog';

// 0: silly, 1: trace, 2: debug, 3: info, 4: warn, 5: error, 6: fatal
const trace = 2;
const info = 3;
const error = 5;

function getLoggingLevel(): number {
  if (
    ('NODE_ENV' in process.env && process.env.NODE_ENV === 'test') ||
    ('JEST_WORKER_ID' in process.env &&
      process.env.JEST_WORKER_ID !== undefined)
  ) {
    return error;
  }

  if ('DEV' in process.env && process.env.DEV === 'true') {
    return trace;
  }

  return info;
}

const minLevel = getLoggingLevel();

export const log = new Logger({ name: 'index', minLevel });

export function assert(
  condition: boolean,
  message: string | undefined = undefined
): void {
  if (!condition) {
    const stack = new Error().stack;
    if (message) {
      log.error('Assertion failed', message, stack);
    } else {
      log.error('Assertion failed', stack);
    }
  }
}
