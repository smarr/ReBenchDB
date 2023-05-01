import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { prepareTemplate } from '../../src/templates.js';
import * as numFormat from '../../src/data-format.js';
import * as viewHelpers from '../../src/views/helpers.js';
import {
  ButtonsAdditionalInfo,
  CompareStatsRowAcrossExes,
  CompareStatsRowAcrossVersions,
  StatsSummary
} from 'views/view-types.js';
import { robustPath } from '../../src/util.js';
import {
  calculateAllStatisticsAndRenderPlots,
  getNavigation
} from '../../src/dashboard.js';
import { collateMeasurements } from '../../src/stats-data-prep.js';

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

describe('Compare View Parts', () => {
  describe('Statistics in Row for Comparison Across Versions', () => {
    const tpl = prepareTemplate('compare/stats-row-across-versions.html');

    it('should render <td> elements with the statistics', () => {
      const data: CompareStatsRowAcrossVersions = {
        total: { median: 0.333, samples: 43, change_m: 546 },
        gcTime: { median: 0.111, samples: 2, change_m: 546 },
        allocated: { median: 222, samples: 2, change_m: 646 },
        ...numFormat,
        ...viewHelpers
      };
      const result = tpl(data);
      expect(result).toEqual(loadResult('version-stats'));
    });
  });

  describe('Statistics in Row for Comparison Across Executors', () => {
    const tpl = prepareTemplate('compare/stats-row-across-exes.html', true);

    it('should render <td> elements with the statistics', () => {
      const data: CompareStatsRowAcrossExes = {
        exes: [
          {
            name: 'TruffleSOM-ast',
            total: { median: 0.333, samples: 43, change_m: 546 },
            gcTime: { median: 0.111, samples: 1, change_m: 546 },
            allocated: { median: 222, samples: 1, change_m: 646 }
          },
          {
            name: 'TruffleSOM-bc',
            total: { median: 0.4534, samples: 12, change_m: 34 },
            gcTime: { median: 0.256, samples: 1, change_m: 2323 },
            allocated: { median: 675, samples: 1, change_m: 6046 }
          }
        ],
        ...numFormat,
        ...viewHelpers
      };
      const result = tpl(data);
      expect(result).toEqual(loadResult('exec-stats'));
    });
  });

  describe('Buttons for Additional Information', () => {
    const tpl = prepareTemplate('compare/buttons-additional-info.html', true);

    it('with full data, it should render all buttons', () => {
      const data: ButtonsAdditionalInfo = {
        cmdline: 'som/some-command with args',
        environments: [
          {
            id: 1,
            hostname: 'MyHost',
            ostype: 'Linux',
            memory: 123456,
            cpu: 'Intel(R) Core(TM) i7-7700HQ CPU @ 2.80GHz',
            clockspeed: 2800000000,
            note: 'Some notes'
          }
        ],
        envId: 1,
        hasProfileData: true,
        base: {
          commitId: '123456',
          runId: 1,
          trialId: 2
        },
        change: {
          commitId: '123457',
          runId: 3,
          trialId: 4
        },
        numV: 0,
        numC: 0,
        numI: 0,
        numEa: 0,
        b: 'my-benchmark',
        e: 'exe1',
        s: 'suite2',
        ...numFormat,
        ...viewHelpers
      };

      const result = tpl(data);
      expect(result).toEqual(loadResult('button-info'));
    });
  });

  describe('Summary Statistics for Whole Comparison', () => {
    const tpl = prepareTemplate('compare/stats-summary.html', true);

    it('should render the data as expected', () => {
      const data: StatsSummary = {
        overviewPngUrl: 'some-url.svg',
        overviewSvgUrls: ['some-url1.svg', 'some-url2.svg'],
        numRunConfigs: 232,
        total: { min: 0.1, max: 1.1, median: 0.5 },
        gcTime: { min: 2.1, max: 3.1, median: 2.5 },
        allocated: { min: 4.1, max: 5.1, median: 4.5 }
      };

      const result = tpl(data);
      expect(result).toEqual(loadResult('stats-summary'));
    });
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
});

describe('Compare View Statistics', () => {
  const resultsJ = collateMeasurements(dataJsSOM.results);
  const resultsT = collateMeasurements(dataTruffleSOM.results);
  let statsJ: { all: StatsSummary };
  let statsT: { all: StatsSummary };

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
    const stats: StatsSummary = statsJ.all;
    expect(stats).toEqual({
      numRunConfigs: 26,
      overviewPngUrl: `${robustPath(
        '../resources/reports/'
      )}/testJ/overview.png`,
      overviewSvgUrls: [
        `${robustPath('../resources/reports/')}/testJ/overview-som.svg`
      ],
      total: {
        min: -0.08187505715653631,
        max: 0.1445205479452054,
        median: -0.007853258247567385
      }
    });
  });

  it('should get the summary statistics for TruffleSOM', () => {
    const stats = statsT.all;
    expect(stats).toEqual({
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
      total: {
        min: -0.14266018907563016,
        max: 0.41233051093656736,
        median: -0.0009242240366887366
      }
    });
  });
});
