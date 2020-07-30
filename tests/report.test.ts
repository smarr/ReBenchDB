import { readFileSync, unlinkSync } from 'fs';
import { startReportGeneration } from '../src/dashboard';
import { DatabaseConfig } from '../src/db';

describe('Knitr Report Generation', () => {
  describe('Report with varying set of benchmarks', () => {
    const outputFile = `report.test.ts.html`;

    it('Should successful execute generation', async () => {
      const baseHash = '5964b7';
      const changeHash = '253fc1';
      const baseFile = `${__dirname}/data/bench-set-base.qs`;
      const changeFile = `${__dirname}/data/bench-set-change.qs`;

      const extraCmd = `from-file;${baseFile};${changeFile}`;

      const reportP = new Promise((resolve, reject) => {
        startReportGeneration(baseHash, changeHash, outputFile,
          {} as DatabaseConfig,
          async (error, _stdout, _stderr) => {
            if (error) { reject(error); return; }
            resolve(true);
          }, extraCmd);
      });

      const aTrue = await reportP;
      expect(aTrue).toBe(true);
    }, 60000);

    it('Should indicate differences in the benchmark sets', () => {
      const content: string = readFileSync(
        `${__dirname}/../resources/reports/${outputFile}`, 'utf8');
      expect(content).toEqual(
        expect.stringContaining('Changes in Benchmark Set'));
    });

    it('Should not have any output that indicates warnings', () => {
      const content: string = readFileSync(
        `${__dirname}/../resources/reports/${outputFile}`, 'utf8');
      // warning output is inside <code> blocks
      expect(content).toEqual(expect.not.stringContaining('<code>'));
    })

    afterAll(async () => {
      unlinkSync(`${__dirname}/../resources/reports/${outputFile}`);
    });
  });
});
