import { describe, expect, it } from '@jest/globals';
import { collateMeasurements } from '../../../src/backend/compare/db-data.js';
import {
  ResultsByBenchmark,
  ResultsByExeSuiteBenchmark,
  ResultsBySuiteBenchmark
} from '../../../src/backend/compare/prep-data.js';
import type {
  MeasurementData,
  ProcessedResult
} from '../../../src/backend/db/types.js';
import {
  loadCompareViewJsSomPayload,
  loadCompareViewTSomPayload
} from '../../payload.js';

const dataJsSOM = loadCompareViewJsSomPayload();
const dataTSOM = loadCompareViewTSomPayload();

describe('collateMeasurements()', () => {
  describe('with data from JsSOM', () => {
    const result: ResultsByExeSuiteBenchmark = collateMeasurements(dataJsSOM);

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
    const result: ResultsByExeSuiteBenchmark = collateMeasurements(dataTSOM);

    it('should have 7 executors', () => {
      expect(result.size).toBe(7);
      expect([...result.keys()]).toEqual([
        'SomSom-native-interp-ast',
        'SomSom-native-interp-bc',
        'TruffleSOM-graal',
        'TruffleSOM-graal-bc',
        'TruffleSOM-interp',
        'TruffleSOM-native-interp-ast',
        'TruffleSOM-native-interp-bc'
      ]);
    });

    it('should have 2 suites', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('TruffleSOM-graal');
      expect(suites.size).toBe(4);
      expect([...suites.keys()]).toEqual([
        'macro-startup',
        'macro-steady',
        'micro-startup',
        'micro-steady'
      ]);
    });

    it('should have the expected macro benchmarks', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('TruffleSOM-graal');
      const macro = <ResultsByBenchmark>suites.get('macro-steady');
      expect(macro.benchmarks.size).toBe(6);

      expect([...macro.benchmarks.keys()]).toEqual([
        'DeltaBlue',
        'GraphSearch',
        'Json',
        'NBody',
        'PageRank',
        'Richards'
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

    it('should have the expected measurements for all benchmarks', () => {
      const numValuesSteady: string[][] = [];
      numValuesSteady[55] = [
        'BubbleSort',
        'Dispatch',
        'Fannkuch',
        'QuickSort',
        'Queens',
        'Permute',
        'Loop',
        'FieldLoop',
        'IntegerLoop',
        'WhileLoop',
        'Sum',
        'Towers'
      ];
      numValuesSteady[60] = [
        'Bounce',
        'Fibonacci',
        'Sieve',
        'Storage',
        'TreeSort'
      ];
      numValuesSteady[65] = ['List', 'Recurse'];
      numValuesSteady[110] = ['Mandelbrot'];
      numValuesSteady[120] = ['DeltaBlue', 'Json', 'NBody', 'PageRank'];
      numValuesSteady[130] = ['Richards'];
      numValuesSteady[250] = ['GraphSearch'];

      for (const [exe, suites] of result) {
        for (const [suite, benchmarks] of suites) {
          for (const [bench, processed] of benchmarks.benchmarks) {
            expect(processed.measurements).toHaveLength(2);
            for (const m of processed.measurements) {
              if (exe.includes('SomSom')) {
                expect(m.values).toHaveLength(1);
                expect(m.values[0]).toHaveLength(1);
              } else if (suite.includes('startup')) {
                expect(m.values).toHaveLength(5);
                for (const v of m.values) {
                  expect(v).toHaveLength(1);
                }
              } else if (suite.includes('steady')) {
                expect(m.values).toHaveLength(1);
                expect(numValuesSteady[m.values[0].length]).toContain(bench);
              } else {
                expect(false).toBe({
                  exe,
                  suite,
                  bench,
                  values: m.values
                });
              }
            }
          }
        }
      }
    });
  });

  describe('needs to distinguish different run ids', () => {
    function createMeasure(
      runid: number,
      inputsize: string,
      commitid: string
    ): MeasurementData {
      return {
        expid: 1,
        runid,
        commitid,
        trialid: 1,

        bench: 'b',
        exe: 'e',
        suite: 's',

        cmdline: 'b e s ' + inputsize,
        varvalue: null,
        cores: null,
        inputsize,
        extraargs: null,

        invocation: 1,
        warmup: null,

        criterion: 'total',
        unit: 'ms',
        values: [1],

        envid: 1
      };
    }

    const data: MeasurementData[] = [
      createMeasure(1, '1', 'a'),
      createMeasure(1, '1', 'b'),
      createMeasure(2, '2', 'a'),
      createMeasure(2, '2', 'b')
    ];

    const result: ResultsByExeSuiteBenchmark = collateMeasurements(data);

    it('should have 1 executor', () => {
      expect(result.size).toBe(1);
      expect([...result.keys()]).toEqual(['e']);
    });

    it('should have 1 suite', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('e');
      expect(suites.size).toBe(1);
      expect([...suites.keys()]).toEqual(['s']);
    });

    it('should have the expected benchmark', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('e');
      const bs = <ResultsByBenchmark>suites.get('s');
      expect(bs.benchmarks.size).toBe(1);

      expect([...bs.benchmarks.keys()]).toEqual(['b']);
    });

    it('should have 4 measurements', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('e');
      const bs = <ResultsByBenchmark>suites.get('s');
      const b = <ProcessedResult>bs.benchmarks.get('b');

      expect(b.measurements).toHaveLength(4);
    });
  });

  describe('needs to combine data from different trials but same runId', () => {
    function createMeasure(
      runid: number,
      trialid: number,
      inputsize: string,
      commitid: string
    ): MeasurementData {
      return {
        expid: 1,
        runid,
        commitid,
        trialid,

        bench: 'b',
        exe: 'e',
        suite: 's',

        cmdline: 'b e s ' + inputsize,
        varvalue: null,
        cores: null,
        inputsize,
        extraargs: null,

        invocation: 1,
        warmup: null,

        criterion: 'total',
        unit: 'ms',
        values: [1],

        envid: 1
      };
    }

    const data: MeasurementData[] = [
      createMeasure(1, 1, '1', 'a'),
      createMeasure(1, 2, '1', 'a'),
      createMeasure(1, 3, '1', 'a'),
      createMeasure(1, 4, '1', 'b'),
      createMeasure(1, 5, '1', 'b'),
      createMeasure(1, 6, '1', 'b'),
      createMeasure(2, 7, '2', 'a'),
      createMeasure(2, 8, '2', 'b')
    ];

    const result: ResultsByExeSuiteBenchmark = collateMeasurements(data);

    it('should have 4 measurements', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('e');
      const bs = <ResultsByBenchmark>suites.get('s');
      const b = <ProcessedResult>bs.benchmarks.get('b');

      expect(b.measurements).toHaveLength(4);
    });

    it(
      'should have 3 invocations for the 1st and 2nd measurement,' +
        ' and 1 for the rest',
      () => {
        const suites = <ResultsBySuiteBenchmark>result.get('e');
        const bs = <ResultsByBenchmark>suites.get('s');
        const b = <ProcessedResult>bs.benchmarks.get('b');

        expect(b.measurements[0].values).toHaveLength(3);
        expect(b.measurements[1].values).toHaveLength(3);
        expect(b.measurements[2].values).toHaveLength(1);
        expect(b.measurements[3].values).toHaveLength(1);
      }
    );
  });

  describe('needs to combine data from different expIds but same runId', () => {
    function createMeasure(
      expid: number,
      runid: number,
      trialid: number,
      inputsize: string,
      commitid: string
    ): MeasurementData {
      return {
        expid,
        runid,
        commitid,
        trialid,

        bench: 'b',
        exe: 'e',
        suite: 's',

        cmdline: 'b e s ' + inputsize,
        varvalue: null,
        cores: null,
        inputsize,
        extraargs: null,

        invocation: 1,
        warmup: null,

        criterion: 'total',
        unit: 'ms',
        values: [1],

        envid: 1
      };
    }

    const data: MeasurementData[] = [
      createMeasure(1, 1, 1, '1', 'a'),
      createMeasure(2, 1, 2, '1', 'a'),
      createMeasure(2, 1, 3, '1', 'a'),
      createMeasure(3, 1, 4, '1', 'b'),
      createMeasure(3, 1, 5, '1', 'b'),
      createMeasure(3, 1, 6, '1', 'b'),
      createMeasure(1, 2, 7, '2', 'a'),
      createMeasure(3, 2, 8, '2', 'b')
    ];

    const result: ResultsByExeSuiteBenchmark = collateMeasurements(data);

    it('should have 4 measurements', () => {
      const suites = <ResultsBySuiteBenchmark>result.get('e');
      const bs = <ResultsByBenchmark>suites.get('s');
      const b = <ProcessedResult>bs.benchmarks.get('b');

      expect(b.measurements).toHaveLength(4);
    });

    it(
      'should have 3 invocations for the 1st and 2nd measurement,' +
        ' and 1 for the rest',
      () => {
        const suites = <ResultsBySuiteBenchmark>result.get('e');
        const bs = <ResultsByBenchmark>suites.get('s');
        const b = <ProcessedResult>bs.benchmarks.get('b');

        expect(b.measurements[0].values).toHaveLength(3);
        expect(b.measurements[1].values).toHaveLength(3);
        expect(b.measurements[2].values).toHaveLength(1);
        expect(b.measurements[3].values).toHaveLength(1);
      }
    );
  });
});
