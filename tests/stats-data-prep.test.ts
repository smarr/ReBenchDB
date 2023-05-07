import { describe, expect, it } from '@jest/globals';

import { readFileSync } from 'node:fs';

import { robustPath } from '../src/util.js';
import {
  MeasurementData,
  Measurements,
  ProcessedResult,
  RevisionComparison,
  RunSettings
} from '../src/db.js';
import {
  ResultsByBenchmark,
  ResultsByExeSuiteBenchmark,
  ResultsBySuiteBenchmark,
  allExesAreTheSame,
  arrangeChangeDataForChart,
  calculateAllChangeStatistics,
  calculateChangeStatsForBenchmark,
  compareStringOrNull,
  compareToSortForSinglePassChangeStats,
  dropMeasurementsWhereBaseOrChangeIsMissing,
  getChangeDataBySuiteAndExe,
  prepareCompareView
} from '../src/stats-data-prep.js';
import { ComparisonStatistics } from '../src/stats.js';
import { collateMeasurements } from '../src/db-data-processing.js';
import { CompareViewWithData } from '../src/views/view-types.js';
import { prepareTemplate } from '../src/templates.js';
import * as dataFormatters from '../src/data-format.js';
import * as viewHelpers from '../src/views/helpers.js';

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

const dataJsSOM: { results: MeasurementData[] } = JSON.parse(
  readFileSync(
    robustPath(`../tests/data/compare-view-data-jssom.json`)
  ).toString()
);

const dataTSOM: { results: MeasurementData[] } = JSON.parse(
  readFileSync(
    robustPath(`../tests/data/compare-view-data-trufflesom.json`)
  ).toString()
);

describe('calculateChangeStatsForBenchmark()', () => {
  describe('with data from JsSOM', () => {
    const perCriteria = new Map<string, ComparisonStatistics[]>();

    const result: ResultsByExeSuiteBenchmark = collateMeasurements(
      dataJsSOM.results
    );
    const som = <ResultsBySuiteBenchmark>result.get('som');
    const macro = <ResultsByBenchmark>som.get('macro');
    const nbody = <ProcessedResult>macro.benchmarks.get('NBody');

    const changeOffset = 1;
    const dropped = calculateChangeStatsForBenchmark(
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

const resultJsSOM: ResultsByExeSuiteBenchmark = collateMeasurements(
  dataJsSOM.results
);
const resultTSOM: ResultsByExeSuiteBenchmark = collateMeasurements(
  dataTSOM.results
);

describe('calculateAllChangeStatistics()', () => {
  it(
    'should assign changeStats to the changeOffset ' +
      'measurement for all elements of JsSOM data',
    () => {
      const numRuns = calculateAllChangeStatistics(resultJsSOM, 0, 1, null);
      expect(numRuns).toBe(26);

      for (const bySuite of resultJsSOM.values()) {
        for (const byBench of bySuite.values()) {
          for (const bench of byBench.benchmarks.values()) {
            for (let i = 0; i < bench.measurements.length; i += 1) {
              const m = bench.measurements[i];
              if (i % 2 === 1) {
                expect(m.changeStats).toBeDefined();
              } else {
                expect(m.changeStats).toBeUndefined();
              }
            }
          }
        }
      }
    }
  );

  it(
    'should assign changeStats to the changeOffset ' +
      'measurement for all elements of TruffleSOM data',
    () => {
      const numRuns = calculateAllChangeStatistics(resultTSOM, 0, 1, null);
      expect(numRuns).toBe(166);

      for (const bySuite of resultJsSOM.values()) {
        for (const byBench of bySuite.values()) {
          for (const bench of byBench.benchmarks.values()) {
            for (let i = 0; i < bench.measurements.length; i += 1) {
              const m = bench.measurements[i];
              if (i % 2 === 1) {
                expect(m.changeStats).toBeDefined();
              } else {
                expect(m.changeStats).toBeUndefined();
              }
            }
          }
        }
      }
    }
  );
});

describe('getChangeDataBySuiteAndExe()', () => {
  const resultJsSOM: ResultsByExeSuiteBenchmark = collateMeasurements(
    dataJsSOM.results
  );
  const resultTSOM: ResultsByExeSuiteBenchmark = collateMeasurements(
    dataTSOM.results
  );
  const jsRuns = calculateAllChangeStatistics(resultJsSOM, 0, 1, null);
  const tsRuns = calculateAllChangeStatistics(resultTSOM, 0, 1, null);

  it('should return the expected data for JsSOM', () => {
    const result = getChangeDataBySuiteAndExe(resultJsSOM, 'total');
    expect(result.size).toEqual(2);
    expect(result.has('micro')).toBe(true);
    expect(result.has('macro')).toBe(true);

    const micro = result.get('micro');
    const macro = result.get('macro');

    expect(micro?.labels).toEqual(['som']);
    expect(macro?.labels).toEqual(['som']);

    expect(micro?.data).toHaveLength(1);
    expect(macro?.data).toHaveLength(1);

    expect(micro?.data[0]).toHaveLength(20);
    expect(macro?.data[0]).toHaveLength(6);

    expect(jsRuns).toBe(20 + 6);
  });

  it('should return the expected data for TruffleSOM', () => {
    const result = getChangeDataBySuiteAndExe(resultTSOM, 'total');
    expect(result.size).toEqual(5);

    expect(result.has('macro-startup')).toBe(true);
    expect(result.has('micro-startup')).toBe(true);
    expect(result.has('macro-steady')).toBe(true);
    expect(result.has('micro-steady')).toBe(true);
    expect(result.has('micro-somsom')).toBe(true);

    const macroStartup = result.get('macro-startup');
    const microSomSom = result.get('micro-somsom');

    expect(macroStartup?.labels).toEqual([
      'TruffleSOM-graal',
      'TruffleSOM-interp',
      'TruffleSOM-graal-bc',
      'TruffleSOM-native-interp-bc',
      'TruffleSOM-native-interp-ast'
    ]);
    expect(microSomSom?.labels).toEqual([
      'SomSom-native-interp-ast',
      'SomSom-native-interp-bc'
    ]);

    expect(macroStartup?.data).toHaveLength(5);
    expect(microSomSom?.data).toHaveLength(2);

    expect(macroStartup?.data[0]).toHaveLength(5);
    expect(microSomSom?.data[0]).toHaveLength(5);

    expect(tsRuns).toBe(166);
  });
});

describe('allExesAreTheSame()', () => {
  it('should return true for the JsSOM data', () => {
    const result = getChangeDataBySuiteAndExe(resultJsSOM, 'total');
    expect(allExesAreTheSame(result)).toEqual([true, 'som']);
  });

  it('should return false for the TruffleSOM data', () => {
    const result = getChangeDataBySuiteAndExe(resultTSOM, 'total');
    expect(allExesAreTheSame(result)).toEqual([false, null]);
  });
});

describe('arrangeChangeDataForChart()', () => {
  it(
    'should transpose the JsSOM data ' +
      'from grouping by suite to grouping by exe',
    () => {
      const changeData = getChangeDataBySuiteAndExe(resultJsSOM, 'total');
      const result = arrangeChangeDataForChart(changeData);

      expect(result.size).toEqual(1);
      const data = result.get('som');

      expect(data).toBeDefined();

      if (!data) {
        return;
      }

      expect(data.labels).toEqual(['macro', 'micro']);
      expect(data.data).toHaveLength(2);
    }
  );

  it('should not have changed the TruffleSOM data', () => {
    const changeData = getChangeDataBySuiteAndExe(resultTSOM, 'total');
    const result = arrangeChangeDataForChart(changeData);

    expect(result).toBe(changeData);
  });
});

const revDataJs: RevisionComparison = {
  dataFound: true,
  base: {
    projectid: 1,
    name: 'som',
    sourceid: 1,
    commitid: '4dff7e',
    repourl: 'repo-url',
    branchortag: 'main',
    commitmessage: 'msg1',
    authorname: 'foo@bar'
  },
  change: {
    projectid: 1,
    name: 'som',
    sourceid: 1,
    commitid: 'bc1105',
    repourl: 'repo-url',
    branchortag: 'main',
    commitmessage: 'msg2',
    authorname: 'foo@bar'
  },
  baseCommitId: '4dff7e',
  changeCommitId: 'bc1105',
  baseCommitId6: '4dff7e',
  changeCommitId6: 'bc1105'
};

const revDataT: RevisionComparison = {
  dataFound: true,
  base: {
    projectid: 1,
    name: 'som',
    sourceid: 1,
    commitid: '5820ec',
    repourl: 'repo-url',
    branchortag: 'main',
    commitmessage: 'msg1',
    authorname: 'foo@bar'
  },
  change: {
    projectid: 1,
    name: 'som',
    sourceid: 1,
    commitid: '5fa4bd',
    repourl: 'repo-url',
    branchortag: 'main',
    commitmessage: 'msg2',
    authorname: 'foo@bar'
  },
  baseCommitId: '5820ec',
  changeCommitId: '5fa4bd',
  baseCommitId6: '5820ec',
  changeCommitId6: '5fa4bd'
};

// TODO: this is duplicated from compare-view.test.ts
function loadResult(name: string): string {
  return readFileSync(
    robustPath(`../tests/views/expected-results/${name}.html`)
  ).toString();
}

// TODO: does this belong into compare-view.test.ts?
describe('prepareCompareView()', () => {
  const compareTpl = prepareTemplate('compare-new.html');

  describe('based on data for JsSOM', () => {
    let result: CompareViewWithData | null = null;

    it('should execute without exception', async () => {
      result = await prepareCompareView(
        dataJsSOM.results,
        [],
        'jssom',
        'jssom',
        revDataJs,
        outputFolder
      );
      expect(result).toBeDefined();
    });

    it.todo('should return the expected data');
    it.todo('should produce the expected plots');

    it('should render to the expected html', () => {
      const r = <CompareViewWithData>result;
      const html = compareTpl({ ...r, dataFormatters, viewHelpers });
      expect(html).toEqual(loadResult('compare-view-jssom'));
    });
  });

  describe('based on data for TruffleSOM', () => {
    let result: CompareViewWithData | null = null;
    it('should execute without exception', async () => {
      result = await prepareCompareView(
        dataTSOM.results,
        [],
        'tsom',
        'tsom',
        revDataT,
        outputFolder
      );
      expect(result).toBeDefined();
    });

    it.todo('should return the expected data');
    it.todo('should produce the expected plots');

    it('should render to the expected html', () => {
      const r = <CompareViewWithData>result;
      const html = compareTpl({ ...r, dataFormatters, viewHelpers });
      expect(html).toEqual(loadResult('compare-view-tsom'));
    });
  });
});
