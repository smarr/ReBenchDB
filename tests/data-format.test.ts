import { describe, expect, it } from '@jest/globals';
import { Environment } from '../src/db.js';
import {
  asHumanHz,
  asHumanMem,
  benchmarkId,
  dataSeriesIds,
  formatEnvironment,
  per,
  r0,
  r2
} from '../src/data-format.js';
import { DataSeriesVersionComparison } from '../src/views/view-types.js';

describe('Format Functions for Numerical Values', () => {
  describe('r0 - round to 0 decimal places', () => {
    it('should round correctly', () => {
      expect(r0(0)).toBe('0');
      expect(r0(1.0)).toBe('1');
      expect(r0(1.1)).toBe('1');
      expect(r0(1.9)).toBe('2');
      expect(r0(1.99)).toBe('2');
      expect(r0(1.49)).toBe('1');
      expect(r0(1.5)).toBe('2');

      expect(r0(-0)).toBe('0');
      expect(r0(-0.1)).toBe('0');
      expect(r0(-0.4)).toBe('0');

      expect(r0(-1.0)).toBe('-1');
      expect(r0(-1.1)).toBe('-1');
      expect(r0(-1.9)).toBe('-2');
      expect(r0(-1.99)).toBe('-2');
      expect(r0(-1.49)).toBe('-1');
      expect(r0(-1.5)).toBe('-2');
    });
  });

  describe('r2 - round to 2 decimal places', () => {
    it('should round correctly', () => {
      expect(r2(0)).toBe('0.00');
      expect(r2(1.0)).toBe('1.00');
      expect(r2(1.1111)).toBe('1.11');
      expect(r2(1.999)).toBe('2.00');
      expect(r2(1.49)).toBe('1.49');
      expect(r2(1.499)).toBe('1.50');
      expect(r2(1.5)).toBe('1.50');

      expect(r2(-0)).toBe('0.00');
      expect(r2(-0.01)).toBe('-0.01');
      expect(r2(-0.001)).toBe('0.00');

      expect(r2(-1.0)).toBe('-1.00');
      expect(r2(-1.1111)).toBe('-1.11');
      expect(r2(-1.999)).toBe('-2.00');
      expect(r2(-1.49)).toBe('-1.49');
      expect(r2(-1.499)).toBe('-1.50');
      expect(r2(-1.5)).toBe('-1.50');
    });
  });

  describe('per - as percentage', () => {
    it('should return the number as a string with a percentage value', () => {
      expect(per(0)).toBe('0');
      expect(per(0.5)).toBe('50');
      expect(per(0.499)).toBe('50');

      expect(per(-0)).toBe('0');
      expect(per(-0.004)).toBe('0');

      expect(per(-0.01)).toBe('-1');
      expect(per(-0.5)).toBe('-50');
      expect(per(-0.499)).toBe('-50');
    });
  });

  describe('asHumanMem - memory value rounded to an appropriate unit', () => {
    it('should return the number as a string with a memory value', () => {
      expect(asHumanMem(0, 3)).toBe('0.000b');
      expect(asHumanMem(1, 3)).toBe('1.000b');
      expect(asHumanMem(1024, 3)).toBe('1.000kb');
      expect(asHumanMem(1024 * 1024, 3)).toBe('1.000MB');
      expect(asHumanMem(1024 * 1024 * 1024, 3)).toBe('1.000GB');
      expect(asHumanMem(1024 * 1024 * 1024 * 1024, 3)).toBe('1024.000GB');
    });

    it('should round as requested', () => {
      expect(asHumanMem(0, 0)).toBe('0b');
      expect(asHumanMem(1, 0)).toBe('1b');
      expect(asHumanMem(1024, 0)).toBe('1kb');
      expect(asHumanMem(1024 * 1024, 0)).toBe('1MB');
      expect(asHumanMem(1024 * 1024 * 1024, 0)).toBe('1GB');
      expect(asHumanMem(1024 * 1024 * 1024 * 1024, 0)).toBe('1024GB');
    });

    it('should round to 0 digits as default', () => {
      expect(asHumanMem(0)).toBe('0b');
      expect(asHumanMem(1)).toBe('1b');
      expect(asHumanMem(1024)).toBe('1kb');
      expect(asHumanMem(1024 * 1024)).toBe('1MB');
      expect(asHumanMem(1024 * 1024 * 1024)).toBe('1GB');
      expect(asHumanMem(1024 * 1024 * 1024 * 1024)).toBe('1024GB');
    });
  });

  describe('asHumanHz - frequency value rounded to an appropriate unit', () => {
    it('should return the number as a string with a frequency value', () => {
      expect(asHumanHz(0, 3)).toBe('0.000Hz');
      expect(asHumanHz(1, 3)).toBe('1.000Hz');
      expect(asHumanHz(1000, 3)).toBe('1.000kHz');
      expect(asHumanHz(1000 * 1000, 3)).toBe('1.000MHz');
      expect(asHumanHz(1000 * 1000 * 1000, 3)).toBe('1.000GHz');
      expect(asHumanHz(1000 * 1000 * 1000 * 1000, 3)).toBe('1000.000GHz');
    });

    it('should round as requested', () => {
      expect(asHumanHz(0, 0)).toBe('0Hz');
      expect(asHumanHz(1, 0)).toBe('1Hz');
      expect(asHumanHz(1000, 0)).toBe('1kHz');
      expect(asHumanHz(1000 * 1000, 0)).toBe('1MHz');
      expect(asHumanHz(1000 * 1000 * 1000, 0)).toBe('1GHz');
      expect(asHumanHz(1000 * 1000 * 1000 * 1000, 0)).toBe('1000GHz');
    });

    it('should round to 0 digits as default', () => {
      expect(asHumanHz(0)).toBe('0Hz');
      expect(asHumanHz(1)).toBe('1Hz');
      expect(asHumanHz(1000)).toBe('1kHz');
      expect(asHumanHz(1000 * 1000)).toBe('1MHz');
      expect(asHumanHz(1000 * 1000 * 1000)).toBe('1GHz');
      expect(asHumanHz(1000 * 1000 * 1000 * 1000)).toBe('1000GHz');
    });
  });

  describe('formatEnvironment - for display to user', () => {
    const envs: Environment[] = [
      {
        id: 1,
        hostname: 'host',
        ostype: 'Linux',
        memory: 453454333,
        cpu: 'Intel Something',
        clockspeed: 10000000,
        note: 'a note'
      }
    ];

    it('should return a string, if the environment is found', () => {
      expect(formatEnvironment(1, envs)).toBe(
        'host | Linux | 432MB | Intel Something | 10MHz'
      );
    });

    it('should return undefined, if the environment is not found', () => {
      expect(formatEnvironment(2, envs)).toBe(undefined);
    });

    it('should return undefined, if the environment list is empty', () => {
      expect(formatEnvironment(1, [])).toBe(undefined);
    });
  });

  describe('benchmarkId - a minimal object to identify benchmark', () => {
    it('should only include b, e, and s if other bits are unique', () => {
      expect(
        benchmarkId('b', 'e', 's', 'v', 1, 'c', 1, 'i', 1, 'ea', 1)
      ).toEqual({ b: 'b', e: 'e', s: 's' });
    });

    it('should include v if it is not unique', () => {
      expect(
        benchmarkId('b', 'e', 's', 'v', 2, 'c', 1, 'i', 1, 'ea', 1)
      ).toEqual({ b: 'b', e: 'e', s: 's', v: 'v' });
    });

    it('should include c if it is not unique', () => {
      expect(
        benchmarkId('b', 'e', 's', 'v', 1, 'c', 2, 'i', 1, 'ea', 1)
      ).toEqual({ b: 'b', e: 'e', s: 's', c: 'c' });
    });

    it('should include i if it is not unique', () => {
      expect(
        benchmarkId('b', 'e', 's', 'v', 1, 'c', 1, 'i', 2, 'ea', 1)
      ).toEqual({ b: 'b', e: 'e', s: 's', i: 'i' });
    });

    it('should include ea if it is not unique', () => {
      expect(
        benchmarkId('b', 'e', 's', 'v', 1, 'c', 1, 'i', 1, 'ea', 2)
      ).toEqual({ b: 'b', e: 'e', s: 's', ea: 'ea' });
    });

    it('should include all if all are not unique', () => {
      expect(
        benchmarkId('b', 'e', 's', 'v', 2, 'c', 2, 'i', 2, 'ea', 2)
      ).toEqual({ b: 'b', e: 'e', s: 's', v: 'v', c: 'c', i: 'i', ea: 'ea' });
    });

    it('should JSON.stringify without extra characters', () => {
      expect(
        JSON.stringify(
          benchmarkId('bench', 'exe', 'suite', 'v', 1, 'c', 1, 'i', 1, 'ea', 1)
        )
      ).toBe('{"b":"bench","e":"exe","s":"suite"}');
    });
  });
});

describe('dataSeriesIds()', () => {
  it('should return the expected string', () => {
    const ids: DataSeriesVersionComparison = {
      runId: 1,
      base: {
        commitId: '123456',
        trialId: 2
      },
      change: {
        commitId: '123457',
        trialId: 4
      }
    };

    expect(dataSeriesIds(ids, 1, 2, 4)).toBe('1,123456/2,123457/4');
  });
});
