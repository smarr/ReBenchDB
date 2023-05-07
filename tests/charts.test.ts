import { describe, expect, afterAll, it } from '@jest/globals';
import { readFileSync } from 'node:fs';

import {
  getDataNormalizedToBaselineMedian,
  calculateAllChangeStatisticsAndInlinePlots,
  calculateDataForOverviewPlot
} from '../src/stats-data-prep.js';
import { robustPath } from '../src/util.js';
import {
  createCanvas,
  renderInlinePlot,
  renderOverviewPlots
} from '../src/charts.js';
import { Measurements } from '../src/db.js';
import { collateMeasurements } from '../src/db-data-processing.js';
import { createTmpDirectory, deleteTmpDirectory } from './helpers.js';

const outputFolder = createTmpDirectory();

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

const resultsJsSOM = collateMeasurements(dataJsSOM.results);
const resultsTSOM = collateMeasurements(dataTruffleSOM.results);

describe('setup', () => {
  it('should calculate the statistics without error', async () => {
    await calculateAllChangeStatisticsAndInlinePlots(
      resultsJsSOM,
      0,
      1,
      null,
      outputFolder,
      'charts-1'
    );
    await calculateAllChangeStatisticsAndInlinePlots(
      resultsTSOM,
      0,
      1,
      null,
      outputFolder,
      'charts-2'
    );

    expect(true).toBe(true);
  });
});

describe('renderOverviewPlots()', () => {
  const plotDataJsSOM = calculateDataForOverviewPlot(resultsJsSOM, 'total');
  const plotDataTSOM = calculateDataForOverviewPlot(resultsTSOM, 'total');

  describe('with JsSOM data', () => {
    let result: { png: string; svg: string[] };
    it('should not error when rendering the plots', async () => {
      result = await renderOverviewPlots(outputFolder, 'jssom', plotDataJsSOM);
      expect(result).toBeDefined();
    });

    it('should return a png', () => {
      expect(result.png).toBeDefined();
      expect(result.png).toEqual(`jssom.png`);
    });

    it('should return a one svg', () => {
      expect(result.svg).toBeDefined();
      expect(result.svg).toHaveLength(1);
      expect(result.svg[0]).toEqual(`jssom-som.svg`);
    });

    it('should match the png expected', () => {
      expect(result.png).toBeMostlyIdenticalImage(
        outputFolder,
        robustPath('../tests/data/charts/jssom.png')
      );
    });

    it('should match the svg expected', () => {
      expect(result.svg[0]).toBeIdenticalSvgFiles(
        outputFolder,
        robustPath('../tests/data/charts/jssom-som.svg')
      );
    });
  });

  describe('with TruffleSOM data', () => {
    let result: { png: string; svg: string[] };
    it('should not error when rendering the plots', async () => {
      result = await renderOverviewPlots(
        outputFolder,
        'trufflesom',
        plotDataTSOM
      );
      expect(result).toBeDefined();
    });

    it('should return a png', () => {
      expect(result.png).toBeDefined();
      expect(result.png).toEqual(`trufflesom.png`);
    });

    it('should match the png expected', () => {
      expect(result.png).toBeMostlyIdenticalImage(
        outputFolder,
        robustPath('../tests/data/charts/trufflesom.png')
      );
    });

    it('should return five svgs', () => {
      expect(result.svg).toBeDefined();
      expect(result.svg).toHaveLength(5);
      expect(result.svg).toEqual([
        `trufflesom-macro-steady.svg`,
        `trufflesom-micro-steady.svg`,
        `trufflesom-macro-startup.svg`,
        `trufflesom-micro-startup.svg`,
        `trufflesom-micro-somsom.svg`
      ]);
    });

    it('should match the svg expected', () => {
      expect(result.svg[0]).toBeIdenticalSvgFiles(
        outputFolder,
        robustPath('../tests/data/charts/trufflesom-macro-steady.svg')
      );

      expect(result.svg[1]).toBeIdenticalSvgFiles(
        outputFolder,
        robustPath('../tests/data/charts/trufflesom-micro-steady.svg')
      );

      expect(result.svg[2]).toBeIdenticalSvgFiles(
        outputFolder,
        robustPath('../tests/data/charts/trufflesom-macro-startup.svg')
      );

      expect(result.svg[3]).toBeIdenticalSvgFiles(
        outputFolder,
        robustPath('../tests/data/charts/trufflesom-micro-startup.svg')
      );

      expect(result.svg[4]).toBeIdenticalSvgFiles(
        outputFolder,
        robustPath('../tests/data/charts/trufflesom-micro-somsom.svg')
      );
    });
  });
});

describe('renderInlinePlot()', () => {
  const inlinePlotCanvas = createCanvas(38, 336, 'svg', 'boxplot');
  const measurements = <Measurements[]>(
    resultsJsSOM.get('som')?.get('macro')?.benchmarks.get('DeltaBlue')
      ?.measurements
  );

  const data = getDataNormalizedToBaselineMedian(
    measurements[0],
    measurements[1]
  );

  it('should render the expected plot', async () => {
    const name = await renderInlinePlot(
      inlinePlotCanvas,
      data,
      outputFolder,
      'inline',
      1
    );

    expect(name).toEqual('inline-1.svg');

    expect(name).toBeIdenticalSvgFiles(
      outputFolder,
      robustPath(`../tests/data/charts/${name}`)
    );
  });
});

afterAll(() => {
  deleteTmpDirectory(outputFolder, false);
});
