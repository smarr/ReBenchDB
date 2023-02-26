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

function loadResult(name: string): string {
  return readFileSync(
    robustPath(`../tests/views/expected-results/${name}.html`)
  ).toString();
}

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
        overviewUrl: 'some-url.svg',
        numRunConfigs: 232,
        total: { min: 0.1, max: 1.1, geomean: 0.5 },
        gcTime: { min: 2.1, max: 3.1, geomean: 2.5 },
        allocated: { min: 4.1, max: 5.1, geomean: 4.5 }
      };

      const result = tpl(data);
      expect(result).toEqual(loadResult('stats-summary'));
    });
  });
});
