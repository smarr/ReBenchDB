import { readFileSync, unlinkSync, rmdirSync, existsSync } from 'fs';
import {
  startReportGeneration,
  getSummaryPlotFileName,
  getOutputImageFolder
} from '../src/dashboard';
import { DatabaseConfig } from '../src/db';

describe('Knitr Report Generation', () => {
  describe('Report with varying set of benchmarks', () => {
    const outputFileWithoutExtension = `report.test.ts`;
    const outputFile = `${outputFileWithoutExtension}.html`;

    it('Should successful execute generation', async () => {
      const baseHash = '5964b7';
      const changeHash = '253fc1';
      const baseFile = `${__dirname}/data/bench-set-base.qs`;
      const changeFile = `${__dirname}/data/bench-set-change.qs`;

      const extraCmd = `from-file;${baseFile};${changeFile}`;

      const output = await startReportGeneration(
        baseHash,
        changeHash,
        outputFile,
        {} as DatabaseConfig,
        extraCmd
      );

      expect(output.code).toBe(0);
    }, 60000);

    it('Should indicate differences in the benchmark sets', () => {
      const content: string = readFileSync(
        `${__dirname}/../resources/reports/${outputFile}`,
        'utf8'
      );
      expect(content).toEqual(
        expect.stringContaining('Changes in Benchmark Set')
      );
    });

    it('Should not have any output that indicates warnings', () => {
      const content: string = readFileSync(
        `${__dirname}/../resources/reports/${outputFile}`,
        'utf8'
      );
      // warning output is inside <code> blocks
      expect(content).toEqual(expect.not.stringContaining('<code>'));
    });

    it('Should have generated a summare plot', () => {
      const plotFile = getSummaryPlotFileName(outputFile);
      const plotPath = `${__dirname}/../resources/reports/${plotFile}`;
      console.log(plotPath);
      expect(existsSync(plotPath)).toBeTruthy();
    });

    afterAll(async () => {
      const reportPath = `${__dirname}/../resources/reports`;
      unlinkSync(`${reportPath}/${outputFile}`);
      const imageFolder = `${reportPath}/${getOutputImageFolder(outputFile)}`;
      rmdirSync(imageFolder, { recursive: true });
    });
  });

  describe('Report after renaming executables', () => {
    const outputFileWithoutExtension = `report.test.ts`;
    const outputFile = `${outputFileWithoutExtension}.html`;

    it('Should successful execute generation', async () => {
      const baseHash = '2b04e9f74ca0bc3e95d3c50e04f67a17b9536e8e';
      const changeHash = '2ed3bac9e7de2bc0f7ebf70ad07066fb559f41d3';
      const baseFile = `${__dirname}/data/renamed-exec-base.qs`;
      const changeFile = `${__dirname}/data/renamed-exec-change.qs`;

      const extraCmd = `from-file;${baseFile};${changeFile}`;

      const output = await startReportGeneration(
        baseHash,
        changeHash,
        outputFile,
        {} as DatabaseConfig,
        extraCmd
      );

      expect(output.code).toBe(0);
    }, 60000);

    it('Should indicate problem with data', () => {
      const content: string = readFileSync(
        `${__dirname}/../resources/reports/${outputFile}`,
        'utf8'
      );
      expect(content).toEqual(
        expect.stringContaining('Issue with Unexpected Data')
      );

      // and we assume the rest afterwards is not executed
      expect(content).not.toEqual(
        expect.stringContaining('Summary Over All Benchmarks')
      );
    });

    afterAll(async () => {
      unlinkSync(`${__dirname}/../resources/reports/${outputFile}`);
      const imageFolder = `${__dirname}/../resources/reports/${getOutputImageFolder(
        outputFile
      )}`;
      rmdirSync(imageFolder, { recursive: true });
    });
  });
});
