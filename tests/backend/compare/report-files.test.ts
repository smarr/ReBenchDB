import { describe, expect, it } from '@jest/globals';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  deleteReport,
  getReportFilename,
  getReportId
} from '../../../src/backend/compare/report.js';

describe('deleteReport()', () => {
  const project = 'DeleteReportTest';
  const base = 'aaaaaa1';
  const change = 'bbbbbb2';
  const reportId = getReportId(project, base, change);
  const reportFile = getReportFilename(reportId);

  // plots are written to a folder named after the report id,
  // see calculateAllStatisticsAndRenderPlots()
  const plotFolder = `${dirname(reportFile)}/${reportId}`;

  it('should delete the report and the folder with its plots', () => {
    mkdirSync(plotFolder, { recursive: true });
    writeFileSync(reportFile, '<html></html>');
    writeFileSync(`${plotFolder}/overview.png`, '');

    deleteReport(project, base, change);

    expect(existsSync(reportFile)).toBe(false);
    expect(existsSync(plotFolder)).toBe(false);
  });
});
