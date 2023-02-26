import { Measurements, RunSettings } from '../src/db.js';
import {
  compareStringOrNull,
  compareToSortForSinglePassChangeStats
} from '../src/stats-data-prep.js';

describe('compareStringOrNull()', () => {
  it('should compare null and null', () => {
    expect(compareStringOrNull(null, null)).toBe(0);
  });

  it('should compare null and a', () => {
    expect(compareStringOrNull(null, 'a')).toBe(-1);
  });

  it('should compare a and null', () => {
    expect(compareStringOrNull('a', null)).toBe(1);
  });

  it('should compare a and a', () => {
    expect(compareStringOrNull('a', 'a')).toBe(0);
  });

  it('should compare a and b', () => {
    expect(compareStringOrNull('a', 'b')).toBe(-1);
  });

  it('should compare b and a', () => {
    expect(compareStringOrNull('b', 'a')).toBe(1);
  });
});

describe('compareToSortForSinglePassChangeStats()', () => {
  const runSettings: RunSettings = {
    cmdline: 'Exec TestBenchmark1',
    varValue: null,
    cores: null,
    inputSize: null,
    extraArgs: null,
    warmup: null,
    simplifiedCmdline: 'Exec TestBenchmark1'
  };

  it('should give expected order when just commitId different', () => {
    const data: Measurements[] = [
      {
        criterion: { name: 'total', unit: 'ms' },
        values: [[]],
        envId: 1,
        commitId: 'a',
        runSettings
      },
      {
        criterion: { name: 'total', unit: 'ms' },
        values: [[]],
        envId: 1,
        commitId: 'b',
        runSettings
      }
    ];

    data.sort(compareToSortForSinglePassChangeStats);

    expect(data[0].commitId).toBe('a');
    expect(data[1].commitId).toBe('b');
  });

  it('should give expected order for list with different envIds', () => {
    const data: Measurements[] = [
      {
        criterion: { name: 'total', unit: 'ms' },
        values: [[]],
        envId: 1,
        commitId: 'a',
        runSettings
      },
      {
        criterion: { name: 'total', unit: 'ms' },
        values: [[]],
        envId: 2,
        commitId: 'a',
        runSettings
      },
      {
        criterion: { name: 'total', unit: 'ms' },
        values: [[]],
        envId: 1,
        commitId: 'b',
        runSettings
      },
      {
        criterion: { name: 'total', unit: 'ms' },
        values: [[]],
        envId: 2,
        commitId: 'b',
        runSettings
      }
    ];

    data.sort(compareToSortForSinglePassChangeStats);

    expect(data[0].commitId).toBe('a');
    expect(data[0].envId).toBe(1);
    expect(data[1].commitId).toBe('b');
    expect(data[1].envId).toBe(1);

    expect(data[2].commitId).toBe('a');
    expect(data[2].envId).toBe(2);
    expect(data[3].commitId).toBe('b');
    expect(data[3].envId).toBe(2);
  });

  it('should give expected order for different envIds and criteria', () => {
    const data: Measurements[] = [
      {
        criterion: { name: 'total', unit: 'ms' },
        values: [[]],
        envId: 1,
        commitId: 'a',
        runSettings
      },
      {
        criterion: { name: 'alloc', unit: 'byte' },
        values: [[]],
        envId: 1,
        commitId: 'a',
        runSettings
      },
      {
        criterion: { name: 'total', unit: 'ms' },
        values: [[]],
        envId: 1,
        commitId: 'b',
        runSettings
      },
      {
        criterion: { name: 'alloc', unit: 'ms' },
        values: [[]],
        envId: 1,
        commitId: 'b',
        runSettings
      },
      {
        criterion: { name: 'total', unit: 'ms' },
        values: [[]],
        envId: 2,
        commitId: 'b',
        runSettings
      },
      {
        criterion: { name: 'alloc', unit: 'ms' },
        values: [[]],
        envId: 2,
        commitId: 'b',
        runSettings
      },
      {
        criterion: { name: 'total', unit: 'ms' },
        values: [[]],
        envId: 2,
        commitId: 'a',
        runSettings
      },
      {
        criterion: { name: 'alloc', unit: 'byte' },
        values: [[]],
        envId: 2,
        commitId: 'a',
        runSettings
      }
    ];

    data.sort(compareToSortForSinglePassChangeStats);

    // envId == 1
    expect(data[0].commitId).toBe('a');
    expect(data[0].envId).toBe(1);
    expect(data[0].criterion.name).toBe('alloc');
    expect(data[1].commitId).toBe('b');
    expect(data[1].envId).toBe(1);
    expect(data[1].criterion.name).toBe('alloc');

    expect(data[2].commitId).toBe('a');
    expect(data[2].envId).toBe(1);
    expect(data[2].criterion.name).toBe('total');
    expect(data[3].commitId).toBe('b');
    expect(data[3].envId).toBe(1);
    expect(data[3].criterion.name).toBe('total');

    // envId == 2
    expect(data[4].commitId).toBe('a');
    expect(data[4].envId).toBe(2);
    expect(data[4].criterion.name).toBe('alloc');
    expect(data[5].commitId).toBe('b');
    expect(data[5].envId).toBe(2);
    expect(data[5].criterion.name).toBe('alloc');

    expect(data[6].commitId).toBe('a');
    expect(data[6].envId).toBe(2);
    expect(data[6].criterion.name).toBe('total');
    expect(data[7].commitId).toBe('b');
    expect(data[7].envId).toBe(2);
    expect(data[7].criterion.name).toBe('total');
  });
});
