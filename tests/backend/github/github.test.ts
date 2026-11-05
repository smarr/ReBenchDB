import { describe, expect, it } from '@jest/globals';

import { getSummaryPlotPath } from '../../../src/backend/compare/report.js';

describe('getSummaryPlotUrl()', () => {
  it('should point to the overview plot of the report', () => {
    expect(getSummaryPlotPath('/reports', 'SOMpp-3e2dbf-1ef1ba')).toEqual(
      '/reports/SOMpp-3e2dbf-1ef1ba/overview.png'
    );
  });

  it('should not contain a double slash in the path', () => {
    expect(getSummaryPlotPath('/reports', 'SOMpp-3e2dbf-1ef1ba')).not.toContain(
      '//'
    );
  });
});
