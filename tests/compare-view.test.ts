/* eslint-disable max-len */
import { prepareTemplate } from '../src/templates.js';
import * as numFormat from '../src/num-format.js';

describe('Compare View Parts', () => {
  describe('Statistics in Row for Comparison Across Versions', () => {
    const tpl = prepareTemplate('compare/stats-row-across-versions.html');

    it('should render <td> elements with the statistics', () => {
      const result = tpl({
        total: { median: 0.333, samples: 43, change_m: 546 },
        gcTime: { median: 0.111, change_m: 546 },
        allocated: { median: 222, change_m: 646 },
        ...numFormat
      });
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
});
