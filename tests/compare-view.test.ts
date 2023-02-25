/* eslint-disable max-len */
import { prepareTemplate } from '../src/templates.js';
import * as numFormat from '../src/data-format.js';
import * as viewHelpers from '../src/views/helpers.js';
import {
  ButtonsAdditionalInfo,
  CompareStatsRowAcrossExes,
  CompareStatsRowAcrossVersions,
  StatsSummary
} from 'views/view-types.js';

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
      expect(result).toEqual(`<td class="stats-samples">43</td>
<td><span class="stats-median" title="median">0.33</span></td>
<td><span class="stats-change" title="change over median run time"></span></td>
<td><span class="stats-median" title="median">0</span></td>
<td><span class="stats-gc-change" title="change over median GC time">54600</span></td>
<td><span class="stats-median" title="median">222b</span></td>
<td><span class="stats-alloc-change" title="change over median allocated memory">64600</span></td>
`);
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
      expect(result).toEqual(`
<td class="stats-samples">


ast 43

<br>
bc 12

</td>
<td><span class="stats-median" title="median">


0.33

<br>
0.45

</span></td>
<td>


0.33
<span class="stats-change" title="change over median run time">54600</span>

<br>
0.45
<span class="stats-change" title="change over median run time">3400</span>

</td>
<td><span class="stats-median" title="median">


0

<br>
0

</span></td>
<td>


<span class="stats-change" title="change over median GC time">54600</span>

<br>
<span class="stats-change" title="change over median GC time">232300</span>

</td>
<td><span class="stats-median" title="median">


222b

<br>
675b

</span></td>
<td>


<span class="stats-change" title="change over median allocated">64600</span>

<br>
<span class="stats-change" title="change over median allocated">604600</span>

</td>`);
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
      expect(result)
        .toEqual(`<button type="button" class="btn btn-sm btn-cmdline btn-popover"
data-content="<code>som/some-command with args</code>"></button>

<button type="button" class="btn btn-sm btn-environment btn-popover"
data-content="MyHost | Linux | 121kb | Intel(R) Core(TM) i7-7700HQ CPU @ 2.80GHz | 3GHz"></button>



<button type="button" class="btn btn-sm btn-profile" data-content="123456/1/2,123457/3/4"></button>

<button type="button" class="btn btn-sm btn-timeline" data-content='{"b":"my-benchmark","e":"exe1","s":"suite2"}'></button>`);
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
      expect(result).toEqual(`<h2 id="overview">Result Overview</h2>
<img src="some-url.svg">
<dl class="row">
<dt class="col-sm-3">Number of Run Configurations</dt>
<dd class="col-sm-8">232</dd>
<dt class="col-sm-3">Run time (geomean)</dt>
<dd class="col-sm-8">0.5 (min. 0.1, max. 1.1)</dd>
<dt class="col-sm-3">GC time (geomean)</dt>
<dd class="col-sm-8">2.5 (min. 2.1, max. 3.1)</dd>
<dt class="col-sm-3">Allocated bytes (geomean)</dt>
<dd class="col-sm-8">4.5 (min. 4.1, max. 5.1)</dd>
</dl>`);
    });
  });
});
