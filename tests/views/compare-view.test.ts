import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { prepareTemplate } from '../../src/templates.js';
import * as dataFormatters from '../../src/data-format.js';
import * as viewHelpers from '../../src/views/helpers.js';
import {
  ButtonsAdditionalInfoPartial,
  CompareStatsRowAccrossExesPartial,
  CompareStatsRowAcrossVersionsPartial,
  CompareStatsTableHeaderPartial,
  CompareStatsRowPartial,
  StatsSummary,
  CompareStatsTablePartial,
  CompareVersionsPartial,
  CompareStatsTable,
  BySuiteComparison,
  DetailedInfo
} from 'views/view-types.js';
import { robustPath } from '../../src/util.js';
import {
  calculateAllStatisticsAndRenderPlots,
  getNavigation
} from '../../src/dashboard.js';
import { collateMeasurements } from '../../src/stats-data-prep.js';
import { Environment } from 'db.js';

function loadResult(name: string): string {
  return readFileSync(
    robustPath(`../tests/views/expected-results/${name}.html`)
  ).toString();
}

const dataJsSOM = JSON.parse(
  readFileSync(
    robustPath(`../tests/data/compare-view-data-jssom.json`)
  ).toString()
);

const dataTruffleSOM = JSON.parse(
  readFileSync(
    robustPath(`../tests/data/compare-view-data-trufflesom.json`)
  ).toString()
);

const criteria = {
  total: { name: 'total', unit: 'ms' },
  'GC time': { name: 'GC time', unit: 'ms' },
  Allocated: { name: 'Allocated', unit: 'bytes' }
};

const benchId = {
  b: 'my-benchmark',
  e: 'exe1',
  s: 'suite2'
};

const environments: Environment[] = [
  {
    id: 1,
    hostname: 'MyHost',
    ostype: 'Linux',
    memory: 123456,
    cpu: 'Intel(R) Core(TM) i7-7700HQ CPU @ 2.80GHz',
    clockspeed: 2800000000,
    note: 'Some notes'
  }
];

const details: DetailedInfo = {
  cmdline: 'som/some-command with args',
  envId: 1,
  profileIds: {
    base: {
      commitId: '123456',
      runId: 1,
      trialId: 2
    },
    change: {
      commitId: '123457',
      runId: 3,
      trialId: 4
    }
  },
  numV: 0,
  numC: 0,
  numI: 0,
  numEa: 0
};

const versionStats = {
  total: { median: 0.333, samples: 43, change_m: 546 },
  gcTime: { median: 0.111, samples: 2, change_m: 146 },
  allocated: { median: 222, samples: 2, change_m: 646 }
};

const exeStats = [
  {
    name: 'TruffleSOM-ast',
    total: { median: 0.333, samples: 43, change_m: 546 },
    gcTime: { median: 0.111, samples: 1, change_m: 146 },
    allocated: { median: 222, samples: 1, change_m: 646 }
  },
  {
    name: 'TruffleSOM-bc',
    total: { median: 0.4534, samples: 12, change_m: 34 },
    gcTime: { median: 0.256, samples: 1, change_m: 2323 },
    allocated: { median: 675, samples: 1, change_m: 6046 }
  }
];

describe('Compare View Parts', () => {
  describe('Statistics in Row for Comparison Across Versions', () => {
    const tpl = prepareTemplate('compare/stats-row-across-versions.html');

    it('should render <td> elements with the statistics', () => {
      const data: CompareStatsRowAcrossVersionsPartial = {
        stats: versionStats,
        dataFormatters
      };
      const result = tpl(data);
      expect(result).toEqual(loadResult('stats-row-across-version'));
    });
  });

  describe('Statistics in Row for Comparison Across Executors', () => {
    const tpl = prepareTemplate('compare/stats-row-across-exes.html', true);

    it('should render <td> elements with the statistics', () => {
      const data: CompareStatsRowAccrossExesPartial = {
        exes: exeStats,
        dataFormatters,
        viewHelpers
      };
      const result = tpl(data);
      expect(result).toEqual(loadResult('stats-row-across-exes'));
    });
  });

  describe('Buttons for Additional Information', () => {
    const tpl = prepareTemplate('compare/stats-row-buttons-info.html', true);

    it('with full data, it should render all buttons', () => {
      const data: ButtonsAdditionalInfoPartial = {
        benchId,
        details,
        environments,
        dataFormatters
      };

      const result = tpl(data);
      expect(result).toEqual(loadResult('stats-row-button-info'));
    });
  });

  describe('Summary Statistics for Whole Comparison', () => {
    const tpl = prepareTemplate('compare/stats-summary.html', true);

    it('should render the data as expected', () => {
      const data: StatsSummary = {
        overviewPngUrl: 'some-url.svg',
        overviewSvgUrls: ['some-url1.svg', 'some-url2.svg'],
        numRunConfigs: 232,
        stats: {
          total: { min: 0.1, max: 1.1, median: 0.5 },
          gcTime: { min: 2.1, max: 3.1, median: 2.5 },
          allocated: { min: 4.1, max: 5.1, median: 4.5 }
        }
      };

      const result = tpl(data);
      expect(result).toEqual(loadResult('stats-summary'));
    });
  });

  describe('Header for Statistics Table', () => {
    const tpl = prepareTemplate('compare/stats-tbl-header.html', true);

    it('should render the data as expected', () => {
      const data: CompareStatsTableHeaderPartial = {
        criteria
      };

      const result = tpl(data);
      expect(result).toEqual(loadResult('stats-tbl-header'));
    });
  });

  describe('Row in Statistics Table', () => {
    const tpl = prepareTemplate('compare/stats-row.html', true);

    it('should render the version comparison as expected', () => {
      const data: CompareStatsRowPartial = {
        stats: {
          benchId,
          details,
          inlinePlot: 'todo.png',
          versionStats
        },
        environments,
        dataFormatters,
        viewHelpers
      };

      const result = tpl(data);
      expect(result).toEqual(loadResult('stats-row-version'));
    });

    it('should render the exe comparison as expected', () => {
      const data: CompareStatsRowPartial = {
        stats: {
          benchId,
          details,
          inlinePlot: 'todo.png',
          exeStats
        },
        environments,
        dataFormatters,
        viewHelpers
      };

      const result = tpl(data);
      expect(result).toEqual(loadResult('stats-row-exe'));
    });

    it.todo('should create the inline plot');
  });

  describe('Statistics Table', () => {
    const tpl = prepareTemplate('compare/stats-tbl.html', true);

    it('should render the data as expected', () => {
      const data: CompareStatsTablePartial = {
        criteria,
        benchmarks: [
          {
            benchId,
            details,
            inlinePlot: 'todo.png',
            versionStats
          }
        ],
        environments,
        dataFormatters,
        viewHelpers
      };

      const result = tpl(data);
      expect(result).toEqual(loadResult('stats-tbl'));
    });
  });

  describe('Compare View Navigation', () => {
    const resultJ = getNavigation(dataJsSOM.results);
    const resultT = getNavigation(dataTruffleSOM.results);

    it('should produce the correct navigation', () => {
      expect(resultJ.nav).toEqual([
        {
          exeName: 'som',
          suites: ['macro', 'micro']
        }
      ]);

      expect(resultT.nav).toEqual([
        { exeName: 'SomSom-native-interp-ast', suites: ['micro-somsom'] },
        { exeName: 'SomSom-native-interp-bc', suites: ['micro-somsom'] },
        {
          exeName: 'TruffleSOM-graal',
          suites: [
            'macro-startup',
            'macro-steady',
            'micro-startup',
            'micro-steady'
          ]
        },
        {
          exeName: 'TruffleSOM-graal-bc',
          suites: [
            'macro-startup',
            'macro-steady',
            'micro-startup',
            'micro-steady'
          ]
        },
        {
          exeName: 'TruffleSOM-interp',
          suites: ['macro-startup', 'micro-startup']
        },
        {
          exeName: 'TruffleSOM-native-interp-ast',
          suites: ['macro-startup', 'micro-startup']
        },
        {
          exeName: 'TruffleSOM-native-interp-bc',
          suites: ['macro-startup', 'micro-startup']
        }
      ]);
    });

    it('should produce the correct navigation for executor comparison', () => {
      expect(resultJ.navExeComparison).toEqual({ suites: [] });

      expect(resultT.navExeComparison).toEqual({
        suites: [
          'macro-startup',
          'macro-steady',
          'micro-somsom',
          'micro-startup',
          'micro-steady'
        ]
      });
    });

    const tpl = prepareTemplate('compare/navigation.html', true);

    it('should render the JsSOM nav correctly to html', () => {
      const result = tpl(resultJ);
      expect(result).toEqual(loadResult('navigation-jssom'));
    });

    it('should render the TruffleSOM nav correctly to html', () => {
      const result = tpl(resultT);
      expect(result).toEqual(loadResult('navigation-tsom'));
    });
  });

  describe('Full Compare Across Versions', () => {
    const tpl = prepareTemplate('compare/compare-versions.html', true);

    it('should render the data as expected', () => {
      const benchmarks: CompareStatsTable = {
        criteria,
        benchmarks: [
          {
            benchId,
            details,
            inlinePlot: 'todo.png',
            versionStats
          }
        ]
      };

      const data: CompareVersionsPartial = {
        allMeasurements: new Map(),
        environments,
        dataFormatters,
        viewHelpers
      };

      const suites: BySuiteComparison = new Map();
      data.allMeasurements.set('exe1', suites);
      suites.set('suite1', benchmarks);

      const result = tpl(data);
      expect(result).toEqual(loadResult('compare-versions'));
    });
  });
});

describe('Compare View Statistics', () => {
  const resultsJ = collateMeasurements(dataJsSOM.results);
  const resultsT = collateMeasurements(dataTruffleSOM.results);
  let statsJ: StatsSummary;
  let statsT: StatsSummary;

  it('should calculate statistics without throwing exception', async () => {
    statsJ = await calculateAllStatisticsAndRenderPlots(
      resultsJ,
      'bc1105',
      '4dff7e',
      'testJ'
    );
    statsT = await calculateAllStatisticsAndRenderPlots(
      resultsT,
      '5fa4bd',
      '5820ec',
      'testT'
    );

    expect(statsJ).toBeDefined();
    expect(statsT).toBeDefined();
  });


  it('should get the summary statistics for JsSOM', () => {
    expect(statsJ).toEqual({
      numRunConfigs: 26,
      overviewPngUrl: `${robustPath(
        '../resources/reports/'
      )}/testJ/overview.png`,
      overviewSvgUrls: [
        `${robustPath('../resources/reports/')}/testJ/overview-som.svg`
      ],
      stats: {
        total: {
          min: -0.08187505715653631,
          max: 0.1445205479452054,
          median: -0.007853258247567385
        }
      }
    });
  });

  it('should get the summary statistics for TruffleSOM', () => {
    expect(statsT).toEqual({
      numRunConfigs: 166,
      overviewPngUrl: `${robustPath(
        '../resources/reports/'
      )}/testT/overview.png`,
      overviewSvgUrls: [
        `${robustPath(
          '../resources/reports/'
        )}/testT/overview-macro-steady.svg`,
        `${robustPath(
          '../resources/reports/'
        )}/testT/overview-micro-steady.svg`,
        `${robustPath(
          '../resources/reports/'
        )}/testT/overview-macro-startup.svg`,
        `${robustPath(
          '../resources/reports/'
        )}/testT/overview-micro-startup.svg`,
        `${robustPath('../resources/reports/')}/testT/overview-micro-somsom.svg`
      ],
      stats: {
        total: {
          min: -0.14266018907563016,
          max: 0.41233051093656736,
          median: -0.0009242240366887366
        }
      }
    });
  });
});
