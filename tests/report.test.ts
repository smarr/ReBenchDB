import { readFileSync, unlinkSync } from 'fs';
import { startReportGeneration } from '../src/dashboard';

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
        startReportGeneration(baseHash, changeHash, outputFile, {},
          async (error, _stdout, _stderr) => {
            if (error) { reject(error); return; }
            resolve();
          }, extraCmd);
      });

      await reportP;
    }, 60000);

    it('Should indicate differences in the benchmark sets', () => {
      const content: string = readFileSync(`${__dirname}/../resources/reports/${outputFile}`, 'utf8');
      expect(content).toEqual(expect.stringContaining('Changes in Benchmark Set'));
    });

    afterAll(async () => {
      unlinkSync(`${__dirname}/../resources/reports/${outputFile}`);
    });
  });
});
