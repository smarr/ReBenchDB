import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { robustPath } from '../src/util.js';
import { collateMeasurements } from '../src/db-data-processing.js';
import {
  ResultsByBenchmark,
  ResultsByExeSuiteBenchmark,
  ResultsBySuiteBenchmark
} from '../src/stats-data-prep.js';
import { ProcessedResult } from '../src/db.js';

const dataJsSOM = JSON.parse(
  readFileSync(
    robustPath(`../tests/data/compare-view-data-jssom.json`)
  ).toString()
);

const dataTSOM = JSON.parse(
  readFileSync(
    robustPath(`../tests/data/compare-view-data-trufflesom.json`)
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
      expect(macro.benchmarks.size).toBe(6);

      const benchmarks = Array.from(macro.benchmarks.keys()).sort();
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
      expect(micro.benchmarks.size).toBe(20);
    });

    it('should have the expected high-level details for NBody', () => {
      const som = <ResultsBySuiteBenchmark>result.get('som');
      const macro = <ResultsByBenchmark>som.get('macro');
      const nbody = <ProcessedResult>macro.benchmarks.get('NBody');

      expect(nbody.bench).toEqual('NBody');
      expect(nbody.exe).toEqual('som');
      expect(nbody.suite).toEqual('macro');

      expect(nbody.measurements).toHaveLength(2);
    });

    it('should have the expected measurements for NBody', () => {
      const som = <ResultsBySuiteBenchmark>result.get('som');
      const macro = <ResultsByBenchmark>som.get('macro');
      const nbody = <ProcessedResult>macro.benchmarks.get('NBody');

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

  describe('with data from TruffleSOM', () => {
    const result: ResultsByExeSuiteBenchmark = collateMeasurements(
      dataTSOM.results
    );

    it('should have 7 executors', () => {
      expect(result.size).toBe(7);
      expect([...result.keys()]).toEqual([
        'TruffleSOM-graal',
        'TruffleSOM-interp',
        'TruffleSOM-graal-bc',
        'TruffleSOM-native-interp-bc',
        'TruffleSOM-native-interp-ast',
        'SomSom-native-interp-ast',
        'SomSom-native-interp-bc'
      ]);
    });

    it('should have 2 suites', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('TruffleSOM-graal');
      expect(suites.size).toBe(4);
      expect([...suites.keys()]).toEqual([
        'macro-steady',
        'micro-steady',
        'macro-startup',
        'micro-startup'
      ]);
    });

    it('should have the expected macro benchmarks', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('TruffleSOM-graal');
      const macro = <ResultsByBenchmark>suites.get('macro-steady');
      expect(macro.benchmarks.size).toBe(6);

      expect([...macro.benchmarks.keys()]).toEqual([
        'Json',
        'Richards',
        'NBody',
        'DeltaBlue',
        'GraphSearch',
        'PageRank'
      ]);
    });

    it('should have the expected high-level details for NBody', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('TruffleSOM-graal');
      const macro = <ResultsByBenchmark>suites.get('macro-steady');
      const nbody = <ProcessedResult>macro.benchmarks.get('NBody');

      expect(nbody.bench).toEqual('NBody');
      expect(nbody.exe).toEqual('TruffleSOM-graal');
      expect(nbody.suite).toEqual('macro-steady');

      expect(nbody.measurements).toHaveLength(2);
    });

    it('should have the expected measurements for NBody', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('TruffleSOM-graal');
      const macro = <ResultsByBenchmark>suites.get('macro-steady');
      const nbody = <ProcessedResult>macro.benchmarks.get('NBody');

      const m1 = nbody.measurements[0];
      const m2 = nbody.measurements[1];

      expect(m1.commitId).toEqual('5820ec');
      expect(m2.commitId).toEqual('5fa4bd');
      expect(m1.criterion).toEqual({ name: 'total', unit: 'ms' });
      expect(m2.criterion).toEqual({ name: 'total', unit: 'ms' });

      expect(m1.values).toHaveLength(1);
      expect(m2.values).toHaveLength(1);

      expect(m1.values[0]).toHaveLength(120);
      expect(m2.values[0]).toHaveLength(120);
    });
  });
});
