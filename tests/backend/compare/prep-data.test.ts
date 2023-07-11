import { describe, expect, it } from '@jest/globals';

import { readFileSync, mkdirSync, existsSync } from 'node:fs';

import { robustPath } from '../../../src/backend/util.js';
import type {
  MeasurementData,
  Measurements,
  ProcessedResult,
  RevisionComparison,
  RunSettings
} from '../../../src/backend/db/types.js';
import {
  ResultsByBenchmark,
  ResultsByExeSuiteBenchmark,
  ResultsBySuiteBenchmark,
  StatsForBenchmark,
  allExesAreTheSame,
  arrangeChangeDataForChart,
  calculateAllChangeStatisticsAndInlinePlots,
  calculateChangeStatsForBenchmark,
  compareStringOrNull,
  compareToSortForSinglePassChangeStats,
  countVariantsAndDropMissing,
  getChangeDataBySuiteAndExe,
  getNavigation,
  groupDataBySuiteAndBenchmark,
  prepareCompareView
} from '../../../src/backend/compare/prep-data.js';
import { ComparisonStatsWithUnit } from '../../../src/shared/stats.js';
import { collateMeasurements } from '../../../src/backend/compare/db-data.js';
import {
  ByExeSuiteComparison,
  CompareStatsRow,
  CompareViewWithData,
  MissingData
} from '../../../src/shared/view-types.js';
import { prepareTemplate } from '../../../src/backend/templates.js';
import * as dataFormatters from '../../../src/shared/data-format.js';
import * as viewHelpers from '../../../src/shared/helpers.js';
import {
  initJestMatchers,
  isRequestedToUpdateExpectedData,
  isSupportingSvgTests
} from '../../helpers.js';

initJestMatchers();

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

function makeM(criterion, unit, envId, commitId) {
  return {
    criterion: { name: criterion, unit },
    values: [[]],
    envId,
    commitId,
    runSettings,
    runId: 1,
    trialId: 1
  };
}

describe('compareToSortForSinglePassChangeStats()', () => {
  it('should give expected order when just commitId different', () => {
    const data: Measurements[] = [
      makeM('total', 'ms', 1, 'a'),
      makeM('total', 'ms', 1, 'b')
    ];

    data.sort(compareToSortForSinglePassChangeStats);

    expect(data[0].commitId).toBe('a');
    expect(data[1].commitId).toBe('b');
  });

  it('should give expected order for list with different envIds', () => {
    const data: Measurements[] = [
      makeM('total', 'ms', 1, 'a'),
      makeM('total', 'ms', 2, 'a'),
      makeM('total', 'ms', 1, 'b'),
      makeM('total', 'ms', 2, 'b')
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
      makeM('total', 'ms', 1, 'a'),
      makeM('alloc', 'byte', 1, 'a'),
      makeM('total', 'ms', 1, 'b'),
      makeM('alloc', 'byte', 1, 'b'),
      makeM('total', 'ms', 2, 'b'),
      makeM('alloc', 'byte', 2, 'b'),
      makeM('total', 'ms', 2, 'a'),
      makeM('alloc', 'byte', 2, 'a')
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

  it('should give expected order also when bits are missing', () => {
    const data: Measurements[] = [
      makeM('total', 'ms', 1, 'a'),
      makeM('total', 'ms', 1, 'b'),
      makeM('alloc', 'byte', 1, 'b'),
      makeM('total', 'ms', 2, 'b'),
      makeM('alloc', 'byte', 2, 'b'),
      makeM('alloc', 'byte', 2, 'a')
    ];

    data.sort(compareToSortForSinglePassChangeStats);

    // envId == 1
    expect(data[0].commitId).toBe('b');
    expect(data[0].envId).toBe(1);
    expect(data[0].criterion.name).toBe('alloc');

    expect(data[1].commitId).toBe('a');
    expect(data[1].envId).toBe(1);
    expect(data[1].criterion.name).toBe('total');
    expect(data[2].commitId).toBe('b');
    expect(data[2].envId).toBe(1);
    expect(data[2].criterion.name).toBe('total');

    // envId == 2
    expect(data[3].commitId).toBe('a');
    expect(data[3].envId).toBe(2);
    expect(data[3].criterion.name).toBe('alloc');
    expect(data[4].commitId).toBe('b');
    expect(data[4].envId).toBe(2);
    expect(data[4].criterion.name).toBe('alloc');

    expect(data[5].commitId).toBe('b');
    expect(data[5].envId).toBe(2);
    expect(data[5].criterion.name).toBe('total');
  });
});

describe('countVariantsAndDropMissing()', () => {
  function makeProRes(measurements: Measurements[]): ProcessedResult {
    return {
      exe: 'exe',
      suite: 'suite',
      bench: 'bench',
      measurements
    };
  }

  it('should not drop anything from properly paired up list', () => {
    const data: Measurements[] = [
      makeM('total', 'ms', 1, 'a'),
      makeM('total', 'ms', 1, 'b'),
      makeM('alloc', 'byte', 1, 'a'),
      makeM('alloc', 'byte', 1, 'b')
    ];

    const result = countVariantsAndDropMissing(makeProRes(data), 'a', 'b');

    expect(data.length).toBe(4);
    expect(result).toEqual({
      numV: 0,
      numC: 0,
      numI: 0,
      numEa: 0,
      numEnv: 1,
      missing: new Map()
    });
  });

  it('should drop measurements where base is missing', () => {
    const data: Measurements[] = [
      makeM('total', 'ms', 1, 'a'),
      makeM('total', 'ms', 1, 'b'),
      makeM('alloc', 'byte', 1, 'b')
    ];

    const result = countVariantsAndDropMissing(makeProRes(data), 'a', 'b');

    expect(data.length).toBe(2);
    expect(result.missing.size).toEqual(1);

    const stats: CompareStatsRow = result.missing.values().next().value;
    expect(stats.missing).toHaveLength(1);
    if (stats.missing === undefined) throw new Error('missing is undefined');

    const missing = stats.missing[0];
    expect(missing.commitId).toEqual('a');
    expect(missing.criterion.name).toBe('alloc');
  });

  it('should drop measurements where change is missing', () => {
    const data: Measurements[] = [
      makeM('total', 'ms', 1, 'a'),
      makeM('total', 'ms', 1, 'b'),
      makeM('alloc', 'byte', 1, 'a')
    ];

    const result = countVariantsAndDropMissing(makeProRes(data), 'a', 'b');

    expect(data.length).toBe(2);
    expect(result.missing).toBeDefined();
    expect(result.missing.size).toEqual(1);

    const stats: CompareStatsRow = result.missing.values().next().value;
    expect(stats.missing).toHaveLength(1);
    if (stats.missing === undefined) throw new Error('missing is undefined');

    const missing = stats.missing[0];
    expect(missing.commitId).toEqual('b');
    expect(missing.criterion.name).toBe('alloc');
  });

  it('should drop measurements that do not pair up', () => {
    const data: Measurements[] = [
      makeM('total', 'ms', 1, 'a'),
      makeM('total', 'ms', 2, 'a'),
      makeM('alloc', 'byte', 1, 'a'),
      makeM('trace', 'byte', 1, 'c')
    ];

    const result = countVariantsAndDropMissing(makeProRes(data), 'a', 'b');

    expect(data).toHaveLength(0);
    expect(result.missing).toBeDefined();
    expect(result.missing.size).toEqual(2);

    const missing = [...result.missing.values()];

    expect(missing[0].details.envId).toBe(1);
    expect(missing[1].details.envId).toBe(2);

    const mc1 = <MissingData[]>missing[0].missing;
    expect(mc1).toHaveLength(3);

    expect(mc1[0].commitId).toEqual('b');
    expect(mc1[0].criterion.name).toEqual('total');
    expect(mc1[1].criterion.name).toEqual('alloc');
    expect(mc1[2].criterion.name).toEqual('trace');

    const mc2 = <MissingData[]>missing[1].missing;
    expect(mc2).toHaveLength(1);
    expect(mc2[0].criterion.name).toEqual('total');
  });

  it('should consider different runIds as incompatible', () => {
    const data: Measurements[] = [
      makeM('total', 'ms', 1, 'a'),
      makeM('total', 'ms', 1, 'a')
    ];
    data[0].runId = 2;

    const result = countVariantsAndDropMissing(makeProRes(data), 'a', 'b');

    expect(data).toHaveLength(0);
    expect(result.missing).toBeDefined();
    expect(result.missing.size).toEqual(1);
    expect([...result.missing.values()][0].missing).toHaveLength(2);
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
    const perCriteria = new Map<string, ComparisonStatsWithUnit>();

    const result: ResultsByExeSuiteBenchmark = collateMeasurements(
      dataJsSOM.results
    );
    const som = <ResultsBySuiteBenchmark>result.get('som');
    const macro = <ResultsByBenchmark>som.get('macro');
    const nbody = <ProcessedResult>macro.benchmarks.get('NBody');

    const changeOffset = 1;
    let stats: StatsForBenchmark;

    it('should run without exception', async () => {
      stats = await calculateChangeStatsForBenchmark(
        nbody,
        null,
        '4dff7e',
        'bc1105',
        0,
        changeOffset,
        perCriteria,
        0
      );
      expect(stats.numRunConfigs).toEqual(1);
    });

    it('should not have dropped any data', () => {
      expect(nbody.measurements).toHaveLength(2);
      expect(stats.stats).toHaveLength(1);

      for (const propName of ['b', 'e', 's', 'v', 'c', 'i', 'ea']) {
        expect(stats.stats[0].benchId).toHaveProperty(propName);
      }

      expect(stats.stats[0].details.numV).toBe(0);
      expect(stats.stats[0].details.numC).toBe(1);
      expect(stats.stats[0].details.numI).toBe(0);
      expect(stats.stats[0].details.numEa).toBe(1);
      expect(stats.stats[0].details.numEnv).toBe(1);
    });

    it('should have added the expected statistics', () => {
      const versionStats = stats.stats[0].versionStats;
      expect(versionStats).toBeDefined();
      if (versionStats === undefined)
        throw new Error('versionStats is undefined');

      expect(versionStats.total).toBeDefined();

      expect(versionStats.total?.change_m).toBeCloseTo(-0.096325, 5);
      expect(versionStats.total?.median).toBeCloseTo(81.384, 5);
      expect(versionStats.total?.samples).toBe(10);
      expect(perCriteria.size).toEqual(1);
      expect(perCriteria.has('total')).toBe(true);

      const total = <ComparisonStatsWithUnit>perCriteria.get('total');
      expect(total.data).toHaveLength(1);
      expect(total.unit).toBe('ms');

      expect(total.data[0]).toBe(versionStats.total);
    });
  });
});

const resultJsSOM: ResultsByExeSuiteBenchmark = collateMeasurements(
  dataJsSOM.results
);
const resultTSOM: ResultsByExeSuiteBenchmark = collateMeasurements(
  dataTSOM.results
);

const outputFolder = isRequestedToUpdateExpectedData()
  ? robustPath('../tests/data/expected-results/stats-data-prep')
  : robustPath('../tests/data/actual-results/stats-data-prep');

describe('calculateAllChangeStatisticsAndInlinePlots()', () => {
  let jsComparisonData: ByExeSuiteComparison;
  let tsComparisonData: ByExeSuiteComparison;

  it('should get the version stats for all JsSOM runs', async () => {
    const { numRunConfigs, comparisonData } =
      await calculateAllChangeStatisticsAndInlinePlots(
        resultJsSOM,
        null,
        revDataJs.baseCommitId,
        revDataJs.changeCommitId,
        0,
        1
      );
    expect(numRunConfigs).toBe(26);

    for (const bySuite of comparisonData.values()) {
      for (const byBench of bySuite.values()) {
        for (const bench of byBench.benchmarks.values()) {
          expect(bench.versionStats?.total).toBeDefined();
        }
      }
    }

    jsComparisonData = comparisonData;
  });

  it('should get the version stats for all TruffleSOM runs', async () => {
    const { numRunConfigs, comparisonData } =
      await calculateAllChangeStatisticsAndInlinePlots(
        resultTSOM,
        null,
        revDataT.baseCommitId,
        revDataT.changeCommitId,
        0,
        1
      );
    expect(numRunConfigs).toBe(166);

    for (const bySuite of comparisonData.values()) {
      for (const byBench of bySuite.values()) {
        for (const bench of byBench.benchmarks.values()) {
          expect(bench.versionStats?.total).toBeDefined();
        }
      }
    }

    tsComparisonData = comparisonData;
  });

  describe('allExesAreTheSame()', () => {
    it('should return true for the JsSOM data', () => {
      const result = getChangeDataBySuiteAndExe(jsComparisonData, 'total');
      expect(allExesAreTheSame(result)).toEqual([true, 'som']);
    });

    it('should return false for the TruffleSOM data', () => {
      const result = getChangeDataBySuiteAndExe(tsComparisonData, 'total');
      expect(allExesAreTheSame(result)).toEqual([false, null]);
    });
  });

  describe('arrangeChangeDataForChart()', () => {
    it(
      'should transpose the JsSOM data ' +
        'from grouping by suite to grouping by exe',
      () => {
        const changeData = getChangeDataBySuiteAndExe(
          jsComparisonData,
          'total'
        );
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
      const changeData = getChangeDataBySuiteAndExe(tsComparisonData, 'total');
      const result = arrangeChangeDataForChart(changeData);

      expect(result).toBe(changeData);
    });
  });
});

describe('getChangeDataBySuiteAndExe()', () => {
  const resultJsSOM: ResultsByExeSuiteBenchmark = collateMeasurements(
    dataJsSOM.results
  );
  const resultTSOM: ResultsByExeSuiteBenchmark = collateMeasurements(
    dataTSOM.results
  );
  let jsResults: {
    numRunConfigs: number;
    comparisonData: ByExeSuiteComparison;
  };
  let tsResults: {
    numRunConfigs: number;
    comparisonData: ByExeSuiteComparison;
  };

  it('should calculate statistics and get results', async () => {
    jsResults = await calculateAllChangeStatisticsAndInlinePlots(
      resultJsSOM,
      null,
      revDataJs.baseCommitId,
      revDataJs.changeCommitId,
      0,
      1
    );
    tsResults = await calculateAllChangeStatisticsAndInlinePlots(
      resultTSOM,
      null,
      revDataT.baseCommitId,
      revDataT.changeCommitId,
      0,
      1
    );

    expect(jsResults.numRunConfigs).toBe(26);
    expect(tsResults.numRunConfigs).toBe(166);
  });

  it('should return the expected data for JsSOM', () => {
    const result = getChangeDataBySuiteAndExe(
      jsResults.comparisonData,
      'total'
    );
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

    expect(jsResults.numRunConfigs).toBe(20 + 6);
  });

  it('should return the expected data for TruffleSOM', () => {
    const result = getChangeDataBySuiteAndExe(
      tsResults.comparisonData,
      'total'
    );
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
      'TruffleSOM-graal-bc',
      'TruffleSOM-interp',
      'TruffleSOM-native-interp-ast',
      'TruffleSOM-native-interp-bc'
    ]);
    expect(microSomSom?.labels).toEqual([
      'SomSom-native-interp-ast',
      'SomSom-native-interp-bc'
    ]);

    expect(macroStartup?.data).toHaveLength(5);
    expect(microSomSom?.data).toHaveLength(2);

    expect(macroStartup?.data[0]).toHaveLength(5);
    expect(microSomSom?.data[0]).toHaveLength(5);

    expect(tsResults.numRunConfigs).toBe(166);
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

function getResultPath(fileName: string): string {
  return robustPath(
    `../tests/data/expected-results/stats-data-prep/${fileName}`
  );
}

// TODO: does this belong into compare-view.test.ts?
describe('prepareCompareView()', () => {
  const compareTpl = prepareTemplate(
    robustPath('backend/compare/html/index.html'),
    false,
    robustPath('backend/compare/html')
  );

  describe('based on data for JsSOM', () => {
    let result: CompareViewWithData | null = null;

    it('should execute without exception', async () => {
      mkdirSync(`${outputFolder}/jssom`, { recursive: true });
      result = await prepareCompareView(
        dataJsSOM.results,
        [],
        null,
        'jssom',
        'jssom',
        revDataJs,
        outputFolder
      );
      expect(result).toBeDefined();
    });

    it('should produce 26 inline plots', () => {
      for (let i = 1; i <= 26; i += 1) {
        expect(existsSync(`${outputFolder}/jssom/inline-${i}.svg`)).toBe(true);
      }
    });

    it('should produce the same svg for plot 4', () => {
      expect('jssom/inline-4.svg').toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('jssom/inline-4.svg')
      );
    });

    it('should produce the same svg for plot 24', () => {
      expect('jssom/inline-24.svg').toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('jssom/inline-24.svg')
      );
    });

    it('should produce 1 overview svg and 1 png', () => {
      expect(`jssom/overview-som.svg`).toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('jssom/overview-som.svg')
      );

      expect('jssom/overview.png').toBeMostlyIdenticalImage(
        outputFolder,
        getResultPath('jssom/overview.png'),
        2546
      );
    });

    it('should render to the expected html', () => {
      const r = <CompareViewWithData>result;
      const html = compareTpl({ ...r, dataFormatters, viewHelpers });
      expect(html).toEqualHtmlFragment('stats-data-prep/compare-view-jssom');
    });
  });

  describe('based on data for TruffleSOM', () => {
    let result: CompareViewWithData | null = null;
    it('should execute without exception', async () => {
      mkdirSync(`${outputFolder}/tsom`, { recursive: true });
      result = await prepareCompareView(
        dataTSOM.results,
        [],
        null,
        'tsom',
        'tsom',
        revDataT,
        outputFolder
      );
      expect(result).toBeDefined();
    });

    it('should produce 166 inline plots', () => {
      for (let i = 1; i <= 166; i += 1) {
        expect(existsSync(`${outputFolder}/tsom/inline-${i}.svg`)).toBe(true);
      }
    });

    it('should produce the same svg for plot 111', () => {
      expect('tsom/inline-111.svg').toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('tsom/inline-111.svg')
      );
    });

    it('should produce the same svg for plot 156', () => {
      expect('tsom/inline-156.svg').toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('tsom/inline-156.svg')
      );
    });

    it('should produce 5 overview SVGs and 1 png', () => {
      for (const name of [
        'tsom/overview-macro-steady.svg',
        'tsom/overview-micro-steady.svg',
        'tsom/overview-macro-startup.svg',
        'tsom/overview-micro-startup.svg',
        'tsom/overview-micro-somsom.svg'
      ]) {
        expect(name).toBeIdenticalSvgFiles(
          outputFolder,
          getResultPath(name),
          2
        );
      }

      expect('tsom/overview.png').toBeMostlyIdenticalImage(
        outputFolder,
        getResultPath('tsom/overview.png'),
        40416
      );
    });

    it('should render to the expected html', () => {
      const r = <CompareViewWithData>result;
      const html = compareTpl({ ...r, dataFormatters, viewHelpers });
      expect(html).toEqualHtmlFragment('stats-data-prep/compare-view-tsom');
    });

    if (!isSupportingSvgTests()) {
      // eslint-disable-next-line jest/no-disabled-tests
      it.skip(
        'SVG tests are currently disabled, ' +
          'because they render differently on different systems',
        () => {
          expect(true).toBe(false);
        }
      );
    }

    it('should produce the same svg for plot 6 across exes', () => {
      expect('tsom/inline-exe-6.svg').toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('tsom/inline-exe-6.svg')
      );
    });

    it('should produce the same svg for plot 57 across exes', () => {
      expect('tsom/inline-exe-57.svg').toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('tsom/inline-exe-57.svg')
      );
    });

    it('should produce same svg for exe macro-startup overview plot', () => {
      expect('tsom/inline-exe-macro-startup.svg').toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('tsom/inline-exe-macro-startup.svg')
      );
    });
  });
});

describe('groupDataBySuiteAndBenchmark()', () => {
  const navT = getNavigation(resultTSOM);
  const suitesWithMultipleExecutors = navT.navExeComparison.suites;

  it('should group the data by suite and benchmark', () => {
    const { bySuite, executors } = groupDataBySuiteAndBenchmark(
      resultTSOM,
      suitesWithMultipleExecutors
    );

    const arr = [...bySuite.keys()];
    arr.sort((a, b) => a.localeCompare(b));

    expect(suitesWithMultipleExecutors).toEqual(arr);

    for (const suite of bySuite.values()) {
      expect(suite.benchmarks.size).toBeGreaterThan(0);
    }

    expect([...executors]).toEqual([
      'SomSom-native-interp-ast',
      'SomSom-native-interp-bc',
      'TruffleSOM-graal',
      'TruffleSOM-graal-bc',
      'TruffleSOM-interp',
      'TruffleSOM-native-interp-ast',
      'TruffleSOM-native-interp-bc'
    ]);
  });
});
