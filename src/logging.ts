import { Logger } from 'tslog';

export const log = new Logger({ name: 'index' });

if ('DEV' in process.env ? process.env.DEV === 'true' : false) {
  log.setSettings({ minLevel: 'trace' });
} else {
  log.setSettings({ minLevel: 'info' });
}

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
