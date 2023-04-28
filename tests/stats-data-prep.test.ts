import { describe, expect, it } from '@jest/globals';

import { readFileSync } from 'fs';

import { robustPath } from '../src/util.js';
import { Measurements, ProcessedResult, RunSettings } from '../src/db.js';
import {
  ResultsByBenchmark,
  ResultsByExeSuiteBenchmark,
  ResultsBySuiteBenchmark,
  calculateAllChangeStatistics,
  collateMeasurements,
  compareStringOrNull,
  compareToSortForSinglePassChangeStats,
  dropMeasurementsWhereBaseOrChangeIsMissing
} from '../src/stats-data-prep.js';
import { ComparisonStatistics } from '../src/stats.js';

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

const runSettings: RunSettings = {
  cmdline: 'Exec TestBenchmark1',
  varValue: null,
  cores: null,
  inputSize: null,
  extraArgs: null,
  warmup: null,
  simplifiedCmdline: 'Exec TestBenchmark1'
};

describe('compareToSortForSinglePassChangeStats()', () => {
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

describe('dropMeasurementsWhereBaseOrChangeIsMissing()', () => {
  it('should not drop anything from properly paired up list', () => {
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
      },
      {
        criterion: { name: 'alloc', unit: 'byte' },
        values: [[]],
        envId: 1,
        commitId: 'a',
        runSettings
      },
      {
        criterion: { name: 'alloc', unit: 'byte' },
        values: [[]],
        envId: 1,
        commitId: 'b',
        runSettings
      }
    ];

    const dropped = dropMeasurementsWhereBaseOrChangeIsMissing(data);

    expect(data.length).toBe(4);
    expect(dropped).toBeUndefined();
  });

  it('should drop measurements where base is missing', () => {
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
      },
      {
        criterion: { name: 'alloc', unit: 'byte' },
        values: [[]],
        envId: 1,
        commitId: 'b',
        runSettings
      }
    ];

    const dropped = dropMeasurementsWhereBaseOrChangeIsMissing(data);

    expect(data.length).toBe(2);
    expect(dropped).toBeDefined();
    if (dropped === undefined) throw new Error('dropped is undefined');
    expect(dropped.length).toBe(1);
    expect(dropped[0].commitId).toBe('b');
    expect(dropped[0].criterion.name).toBe('alloc');
  });

  it('should drop measurements where change is missing', () => {
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
      },
      {
        criterion: { name: 'alloc', unit: 'byte' },
        values: [[]],
        envId: 1,
        commitId: 'a',
        runSettings
      }
    ];

    const dropped = dropMeasurementsWhereBaseOrChangeIsMissing(data);

    expect(data.length).toBe(2);
    expect(dropped).toBeDefined();
    if (dropped === undefined) throw new Error('dropped is undefined');
    expect(dropped.length).toBe(1);
    expect(dropped[0].commitId).toBe('a');
    expect(dropped[0].criterion.name).toBe('alloc');
  });

  it('should drop measurements that do not pair up', () => {
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
        criterion: { name: 'alloc', unit: 'byte' },
        values: [[]],
        envId: 1,
        commitId: 'a',
        runSettings
      },
      {
        criterion: { name: 'trace', unit: 'byte' },
        values: [[]],
        envId: 1,
        commitId: 'c',
        runSettings
      }
    ];

    const dropped = dropMeasurementsWhereBaseOrChangeIsMissing(data);

    expect(data.length).toBe(0);
    expect(dropped).toBeDefined();
    if (dropped === undefined) throw new Error('dropped is undefined');
    expect(dropped.length).toBe(4);
    expect(dropped[0].commitId).toBe('a');
    expect(dropped[0].envId).toBe(1);
    expect(dropped[1].commitId).toBe('a');
    expect(dropped[1].envId).toBe(2);
    expect(dropped[2].commitId).toBe('a');
    expect(dropped[2].criterion.name).toBe('alloc');
    expect(dropped[3].commitId).toBe('c');
    expect(dropped[3].criterion.name).toBe('trace');
  });
});

const dataJsSOM = JSON.parse(
  readFileSync(
    robustPath(`../tests/data/compare-view-data-jssom.json`)
  ).toString()
);

describe('collateMeasurements()', () => {
  describe('with data from JsSOM', () => {
    const result: ResultsByExeSuiteBenchmark = collateMeasurements(
      dataJsSOM.results
    );

    it('should have 1 exe', () => {
      expect(result.size).toBe(1);
      expect(result.has('som')).toBe(true);
    });

    it('should have 2 suites', () => {
      const som = <ResultsBySuiteBenchmark>result.get('som');
      expect(som.size).toBe(2);
      expect(som.has('macro')).toBe(true);
      expect(som.has('micro')).toBe(true);
    });

    it('should have the expected macro benchmarks', () => {
      const som = <ResultsBySuiteBenchmark>result.get('som');
      const macro = <ResultsByBenchmark>som.get('macro');
      expect(macro.size).toBe(6);

      const benchmarks = Array.from(macro.keys()).sort();
      expect(benchmarks).toEqual([
        'DeltaBlue',
        'GraphSearch',
        'JsonSmall',
        'NBody',
        'PageRank',
        'Richards'
      ]);
    });

    it('should have 20 micro benchmarks', () => {
      const som = <ResultsBySuiteBenchmark>result.get('som');
      const micro = <ResultsByBenchmark>som.get('micro');
      expect(micro.size).toBe(20);
    });

    it('should have the expected high-level details for NBody', () => {
      const som = <ResultsBySuiteBenchmark>result.get('som');
      const macro = <ResultsByBenchmark>som.get('macro');
      const nbody = <ProcessedResult>macro.get('NBody');

      expect(nbody.bench).toEqual('NBody');
      expect(nbody.exe).toEqual('som');
      expect(nbody.suite).toEqual('macro');

      expect(nbody.measurements).toHaveLength(2);
    });

    it('should have the expected measurements for NBody', () => {
      const som = <ResultsBySuiteBenchmark>result.get('som');
      const macro = <ResultsByBenchmark>som.get('macro');
      const nbody = <ProcessedResult>macro.get('NBody');

      const m1 = nbody.measurements[0];
      const m2 = nbody.measurements[1];

      expect(m1.commitId).toEqual('4dff7e');
      expect(m2.commitId).toEqual('bc1105');

      expect(m1.criterion).toEqual({ name: 'total', unit: 'ms' });
      expect(m2.criterion).toEqual({ name: 'total', unit: 'ms' });

      expect(m1.values).toHaveLength(1);
      expect(m1.values[0]).toHaveLength(10);
      expect(m2.values).toHaveLength(1);
      expect(m2.values[0]).toHaveLength(10);
      expect(m1.values[0][0]).toEqual(158.311);
      expect(m1.values[0][9]).toEqual(93.441);

      expect(m2.values[0][0]).toEqual(156.942);
      expect(m2.values[0][9]).toEqual(78.637);
    });
  });
});

describe('calculateAllChangeStatistics()', () => {
  describe('with data from JsSOM', () => {
    const perCriteria = new Map<string, ComparisonStatistics[]>();

    const result: ResultsByExeSuiteBenchmark = collateMeasurements(
      dataJsSOM.results
    );
    const som = <ResultsBySuiteBenchmark>result.get('som');
    const macro = <ResultsByBenchmark>som.get('macro');
    const nbody = <ProcessedResult>macro.get('NBody');

    const changeOffset = 1;
    const dropped = calculateAllChangeStatistics(
      nbody.measurements,
      0,
      changeOffset,
      perCriteria
    );

    it('should not have dropped any data', () => {
      expect(nbody.measurements).toHaveLength(2);
      expect(dropped).toBeUndefined();
    });

    it('should have added the expected statistics', () => {
      const change = nbody.measurements[changeOffset];
      expect(change.changeStats).toBeDefined();
      expect(change.changeStats?.change_m).toBeCloseTo(-0.096325, 5);
      expect(change.changeStats?.median).toBeCloseTo(81.384, 5);
      expect(change.changeStats?.samples).toBe(10);
      expect(perCriteria.size).toEqual(1);
      expect(perCriteria.has('total')).toBe(true);

      const total = <ComparisonStatistics[]>perCriteria.get('total');
      expect(total).toHaveLength(1);

      expect(total[0]).toBe(change.changeStats);
    });
  });
});
