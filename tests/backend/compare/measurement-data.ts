import type { MeasurementData } from '../../../src/backend/db/types.js';

/**
 * Create a row as it comes from the database,
 * with defaults for everything not given explicitly.
 */
export function makeMeasurementData(
  details: Partial<MeasurementData>
): MeasurementData {
  return {
    expid: 1,
    runid: 1,
    commitid: 'a',
    trialid: 1,

    bench: 'b',
    exe: 'e',
    suite: 's',

    cmdline: 'b e s',
    varvalue: null,
    cores: null,
    inputsize: null,
    extraargs: null,

    invocation: 1,
    warmup: null,

    criterion: 'total',
    unit: 'ms',
    values: [1],

    envid: 1,
    ...details
  };
}
