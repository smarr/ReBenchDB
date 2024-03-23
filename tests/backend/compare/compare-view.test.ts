import { describe, expect, it } from '@jest/globals';
import { prepareTemplate } from '../../../src/backend/templates.js';
import * as dataFormatters from '../../../src/shared/data-format.js';
import * as viewHelpers from '../../../src/shared/helpers.js';
import type {
  ButtonsAdditionalInfoPartial,
  CompareStatsRowAcrossExesPartial,
  CompareStatsRowAcrossVersionsPartial,
  CompareStatsTableHeaderPartial,
  CompareStatsRowPartial,
  StatsSummary,
  CompareStatsTablePartial,
  CompareVersionsPartial,
  CompareStatsTable,
  BySuiteComparison,
  RunDetails,
  StatsSummaryPartial,
  ReportConfig,
  CompareStatsRowAcrossExes
} from '../../../src/shared/view-types.js';
import { robustPath } from '../../../src/backend/util.js';
import {
  calculateAllStatisticsAndRenderPlots,
  getNavigation
} from '../../../src/backend/compare/prep-data.js';
import type { Environment } from '../../../src/backend/db/types.js';
import { collateMeasurements } from '../../../src/backend/compare/db-data.js';
import { initJestMatchers } from '../../helpers.js';
import {
  loadCompareViewJsSomPayload,
  loadCompareViewTSomPayload
} from '../../payload.js';
import { initChartJS } from '../../../src/backend/compare/charts.js';

initJestMatchers();
initChartJS();

const dataJsSOM = loadCompareViewJsSomPayload();
const dataTruffleSOM = loadCompareViewTSomPayload();

const criteria = {
  total: { name: 'total', unit: 'ms' },
  'GC time': { name: 'GC time', unit: 'ms' },
  Allocated: { name: 'Allocated', unit: 'bytes' }
};
const criteriaOrder = ['total', 'GC time', 'Allocated'];

const criteria2 = {
  total: { name: 'total', unit: 'ms' },
  gcTime: { name: 'gcTime', unit: 'ms' },
  allocated: { name: 'allocated', unit: 'bytes' }
};
const criteriaOrder2 = ['total', 'gcTime', 'allocated'];

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

const details: RunDetails = {
  cmdline: 'som/some-command with args',
  envId: 1,
  profiles: true,
  hasWarmup: true,
  runId: 1,
  numV: 0,
  numC: 0,
  numI: 0,
  numEa: 0,
  numEnv: 0
};

const versionStats = {
  total: { median: 0.333, samples: 43, change_m: 546 },
  gcTime: { median: 0.111, samples: 2, change_m: 146 },
  allocated: { median: 222, samples: 2, change_m: 646 }
};

const exeStats: CompareStatsRowAcrossExes[] = [
  {
    exeName: 'TruffleSOM-ast',
    criteria: {
      total: { median: 0.333, samples: 43, change_m: 546 },
      gcTime: { median: 0.111, samples: 1, change_m: 146 },
      allocated: { median: 222, samples: 1, change_m: 646 }
    }
  },
  {
    exeName: 'TruffleSOM-bc',
    criteria: {
      total: { median: 0.4534, samples: 12, change_m: 34 },
      gcTime: { median: 0.256, samples: 1, change_m: 2323 },
      allocated: { median: 675, samples: 1, change_m: 6046 }
    }
  }
];

const config: ReportConfig = {
  reportsUrl: 'base-url',
  overviewPlotWidth: 432
};

describe('Compare View Parts', () => {
  describe('Statistics in Row for Comparison Across Versions', () => {
    const tpl = prepareTemplate(
      robustPath('backend/compare/html/stats-row-across-versions.html')
    );

    it('should render <td> elements with the statistics', () => {
      const data: CompareStatsRowAcrossVersionsPartial = {
        stats: versionStats,
        dataFormatters,
        criteriaOrder: criteriaOrder2,
        criteria: criteria2
      };
      const result = tpl(data);
      expect(result).toEqualHtmlFragment(
        'compare-view/stats-row-across-version'
      );
    });
  });

  describe('Statistics in Row for Comparison Across Executors', () => {
    const tpl = prepareTemplate(
      robustPath('backend/compare/html/stats-row-across-exes.html'),
      true
    );

    it('should render <td> elements with the statistics', () => {
      const data: CompareStatsRowAcrossExesPartial = {
        exes: exeStats,
        dataFormatters,
        viewHelpers,
        criteria: criteria2,
        criteriaOrder: criteriaOrder2
      };
      const result = tpl(data);
      expect(result).toEqualHtmlFragment('compare-view/stats-row-across-exes');
    });
  });

  describe('Buttons for Additional Information', () => {
    const tpl = prepareTemplate(
      robustPath('backend/compare/html/stats-row-buttons-info.html'),
      true
    );

    it('with full data, it should render all buttons', () => {
      const data: ButtonsAdditionalInfoPartial = {
        benchId,
        details,
        environments,
        dataFormatters
      };

      const result = tpl(data);
      expect(result).toEqualHtmlFragment('compare-view/stats-row-button-info');
    });
  });

  describe('Summary Statistics for Whole Comparison', () => {
    const tpl = prepareTemplate(
      robustPath('backend/compare/html/stats-summary.html'),
      true
    );

    it('should render the data as expected', () => {
      const data: StatsSummaryPartial = {
        overviewPngUrl: 'some-url.svg',
        overviewSvgUrls: ['some-url1.svg', 'some-url2.svg'],
        numRunConfigs: 232,
        stats: {
          total: { min: 0.1, max: 1.1, median: 0.5, unit: 'ms' },
          gcTime: { min: 2.1, max: 3.1, median: 2.5, unit: 'ms' },
          allocated: { min: 4.1, max: 5.1, median: 4.5, unit: 'bytes' }
        },
        dataFormatters,
        config
      };

      const result = tpl(data);
      expect(result).toEqualHtmlFragment('compare-view/stats-summary');
    });
  });

  describe('Header for Statistics Table', () => {
    const tpl = prepareTemplate(
      robustPath('backend/compare/html/stats-tbl-header.html'),
      true
    );

    it('should render the data as expected', () => {
      const data: CompareStatsTableHeaderPartial = {
        criteria,
        criteriaOrder,
        dataFormatters,
        isAcrossExes: false
      };

      const result = tpl(data);
      expect(result).toEqualHtmlFragment('compare-view/stats-tbl-header');
    });
  });

  describe('Row in Statistics Table', () => {
    const tpl = prepareTemplate(
      robustPath('backend/compare/html/stats-row.html'),
      true
    );

    it('should render the version comparison as expected', () => {
      const data: CompareStatsRowPartial = {
        stats: {
          benchId,
          details,
          inlinePlot: 'inline.png',
          versionStats,
          argumentsForDisplay: ''
        },
        environments,
        dataFormatters,
        viewHelpers,
        config,
        criteriaOrder: criteriaOrder2,
        criteria: criteria2
      };

      const result = tpl(data);
      expect(result).toEqualHtmlFragment('compare-view/stats-row-version');
    });

    it('should render the exe comparison as expected', () => {
      const data: CompareStatsRowPartial = {
        stats: {
          benchId,
          details,
          inlinePlot: 'inline.png',
          exeStats,
          argumentsForDisplay: ''
        },
        environments,
        dataFormatters,
        viewHelpers,
        config,
        criteriaOrder: criteriaOrder2,
        criteria: criteria2
      };

      const result = tpl(data);
      expect(result).toEqualHtmlFragment('compare-view/stats-row-exe');
    });

    it('should render a row when all data is missing for one version', () => {
      const data: CompareStatsRowPartial = {
        stats: {
          benchId,
          details,
          inlinePlot: 'inline.png',
          missing: [
            { commitId: 'aaa', criterion: { name: 'total', unit: 'ms' } }
          ],
          argumentsForDisplay: ''
        },
        environments,
        dataFormatters,
        viewHelpers,
        config,
        criteriaOrder: ['total'],
        criteria: { total: { name: 'total', unit: 'ms' } }
      };

      const result = tpl(data);
      expect(result).toEqualHtmlFragment(
        'compare-view/stats-row-version-missing'
      );
    });

    it('should render the total if only some other data is missing', () => {
      const data: CompareStatsRowPartial = {
        stats: {
          benchId,
          details,
          inlinePlot: 'inline.png',
          missing: [
            {
              commitId: 'aaa',
              criterion: { name: 'some missing criterion', unit: 'ms' }
            }
          ],
          versionStats,
          argumentsForDisplay: ''
        },
        environments,
        dataFormatters,
        viewHelpers,
        config,
        criteriaOrder: ['total'],
        criteria: { total: { name: 'total', unit: 'ms' } }
      };

      const result = tpl(data);
      expect(result).toEqualHtmlFragment(
        'compare-view/stats-row-version-one-criteria-missing'
      );
    });
  });

  describe('Statistics Table', () => {
    const tpl = prepareTemplate(
      robustPath('backend/compare/html/stats-tbl.html'),
      true
    );

    it('should render the data as expected', () => {
      const data: CompareStatsTablePartial = {
        criteria: criteria2,
        benchmarks: [
          {
            benchId,
            details,
            inlinePlot: 'inline.png',
            versionStats,
            argumentsForDisplay: ''
          }
        ],
        environments,
        dataFormatters,
        viewHelpers,
        config,
        isAcrossExes: false
      };

      const result = tpl(data);
      expect(result).toEqualHtmlFragment('compare-view/stats-tbl');
    });
  });

  describe('Compare View Navigation', () => {
    const collatedJ = collateMeasurements(dataJsSOM);
    const collatedT = collateMeasurements(dataTruffleSOM);
    const resultJ = getNavigation(collatedJ);
    const resultT = getNavigation(collatedT);

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

    const tpl = prepareTemplate(
      robustPath('backend/compare/html/navigation.html'),
      true
    );

    it('should render the JsSOM nav correctly to html', () => {
      const result = tpl(resultJ);
      expect(result).toEqualHtmlFragment('compare-view/navigation-jssom');
    });

    it('should render the TruffleSOM nav correctly to html', () => {
      const result = tpl(resultT);
      expect(result).toEqualHtmlFragment('compare-view/navigation-tsom');
    });
  });

  describe('Full Compare Across Versions', () => {
    const tpl = prepareTemplate(
      robustPath('backend/compare/html/compare-versions.html'),
      true,
      robustPath('backend/compare/html')
    );

    it('should render the data as expected', () => {
      const benchmarks: CompareStatsTable = {
        criteria: criteria2,
        benchmarks: [
          {
            benchId,
            details,
            inlinePlot: 'inline.png',
            versionStats,
            argumentsForDisplay: ''
          }
        ]
      };

      const data: CompareVersionsPartial = {
        acrossVersions: {
          allMeasurements: new Map(),
          summary: <any>{},
          missing: []
        },
        acrossExes: new Map(),
        environments,
        dataFormatters,
        viewHelpers,
        config
      };

      const suites: BySuiteComparison = new Map();
      data.acrossVersions.allMeasurements.set('exe1', suites);
      suites.set('suite1', benchmarks);

      const result = tpl(data);
      expect(result).toEqualHtmlFragment('compare-view/compare-versions');
    });
  });
});

describe('Compare View Statistics', () => {
  const resultsJ = collateMeasurements(dataJsSOM);
  const resultsT = collateMeasurements(dataTruffleSOM);
  let statsJ: StatsSummary;
  let statsT: StatsSummary;

  const outputFolder = robustPath('../tests/data/actual-results/compare-view');

  it('should calculate statistics without throwing exception', async () => {
    statsJ = (
      await calculateAllStatisticsAndRenderPlots(
        resultsJ,
        [],
        null,
        'bc1105',
        '4dff7e',
        'testJ',
        outputFolder,
        'inline-cvs1'
      )
    ).acrossVersions.summary;
    statsT = (
      await calculateAllStatisticsAndRenderPlots(
        resultsT,
        [],
        null,
        '5fa4bd',
        '5820ec',
        'testT',
        outputFolder,
        'inline-cvs2'
      )
    ).acrossVersions.summary;

    expect(statsJ).toBeDefined();
    expect(statsT).toBeDefined();
  });

  it('should get the summary statistics for JsSOM', () => {
    expect(statsJ).toEqual({
      numRunConfigs: 26,
      overviewPngUrl: `testJ/overview.png`,
      overviewSvgUrls: [`testJ/overview-som.svg`],
      stats: {
        total: {
          min: -0.08187505715653631,
          max: 0.1445205479452054,
          median: -0.007853258247567385,
          unit: 'ms'
        }
      }
    });
  });

  it('should get the summary statistics for TruffleSOM', () => {
    expect(statsT).toEqual({
      numRunConfigs: 166,
      overviewPngUrl: `testT/overview.png`,
      overviewSvgUrls: [
        `testT/overview-micro-somsom.svg`,
        `testT/overview-macro-startup.svg`,
        `testT/overview-macro-steady.svg`,
        `testT/overview-micro-startup.svg`,
        `testT/overview-micro-steady.svg`
      ],
      stats: {
        total: {
          min: -0.14266018907563016,
          max: 0.41233051093656736,
          median: -0.0009242240366887366,
          unit: 'ms'
        }
      }
    });
  });
});
