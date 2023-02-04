/* eslint-disable max-len */
import { prepareTemplate } from '../src/templates.js';
import * as numFormat from '../src/data-format.js';
import * as viewHelpers from '../src/views/helpers.js';

describe('Compare View Parts', () => {
  describe('Statistics in Row for Comparison Across Versions', () => {
    const tpl = prepareTemplate('compare/stats-row-across-versions.html');

    it('should render <td> elements with the statistics', () => {
      const data = {
        total: { median: 0.333, samples: 43, change_m: 546 },
        gcTime: { median: 0.111, change_m: 546 },
        allocated: { median: 222, change_m: 646 },
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
      const data = {
        exes: [
          {
            name: 'TruffleSOM-ast',
            total: { median: 0.333, samples: 43, change_m: 546 },
            gcTime: { median: 0.111, change_m: 546 },
            allocated: { median: 222, change_m: 646 }
          },
          {
            name: 'TruffleSOM-bc',
            total: { median: 0.4534, samples: 12, change_m: 34 },
            gcTime: { median: 0.256, change_m: 2323 },
            allocated: { median: 675, change_m: 6046 }
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
});
