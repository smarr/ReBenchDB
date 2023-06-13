import { Logger } from 'tslog';
import { isRunningTests } from './util.js';

// 0: silly, 1: trace, 2: debug, 3: info, 4: warn, 5: error, 6: fatal
const trace = 2;
const info = 3;
const error = 5;

function getLoggingLevel(): number {
  if (isRunningTests()) {
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
