import { describe, expect, it } from '@jest/globals';

import {
  getDataNormalizedToBaselineMedian,
  calculateAllChangeStatisticsAndInlinePlots,
  calculateDataForOverviewPlot,
  getMsFlattenedAndSorted
} from '../../../src/backend/compare/prep-data.js';
import { robustPath } from '../../../src/backend/util.js';
import {
  createCanvas,
  renderInlinePlot,
  renderOverviewPlots
} from '../../../src/backend/compare/charts.js';
import type { Measurements } from '../../../src/backend/db/types.js';
import { collateMeasurements } from '../../../src/backend/compare/db-data.js';
import { ByExeSuiteComparison } from '../../../src/shared/view-types.js';
import {
  initJestMatchers,
  isRequestedToUpdateExpectedData
} from '../../helpers.js';
import {
  loadCompareViewJsSomPayload,
  loadCompareViewTSomPayload
} from '../../payload.js';

initJestMatchers();

const outputFolder = isRequestedToUpdateExpectedData()
  ? robustPath('../tests/data/expected-results/charts')
  : robustPath('../tests/data/actual-results/charts');

function getResultPath(fileName: string): string {
  return robustPath(`../tests/data/expected-results/charts/${fileName}`);
}

const dataJsSOM = loadCompareViewJsSomPayload();

const dataTruffleSOM = loadCompareViewTSomPayload();

const resultsJsSOM = collateMeasurements(dataJsSOM);
const resultsTSOM = collateMeasurements(dataTruffleSOM);

describe('renderOverviewPlots()', () => {
  let jsSomStats: {
    numRunConfigs: number;
    comparisonData: ByExeSuiteComparison;
  };
  let tSomStats: {
    numRunConfigs: number;
    comparisonData: ByExeSuiteComparison;
  };
  let plotDataJsSOM;
  let plotDataTSOM;

  it('should calculate the statistics without error', async () => {
    jsSomStats = await calculateAllChangeStatisticsAndInlinePlots(
      resultsJsSOM,
      null,
      '4dff7e',
      'bc1105',
      0,
      1
    );
    tSomStats = await calculateAllChangeStatisticsAndInlinePlots(
      resultsTSOM,
      null,
      '4dff7e',
      'bc1105',
      0,
      1
    );

    expect(jsSomStats).toBeDefined();
    expect(tSomStats).toBeDefined();

    plotDataJsSOM = calculateDataForOverviewPlot(
      jsSomStats.comparisonData,
      'total'
    );
    plotDataTSOM = calculateDataForOverviewPlot(
      tSomStats.comparisonData,
      'total'
    );

    expect(plotDataJsSOM).toBeDefined();
    expect(plotDataTSOM).toBeDefined();
  });

  it('should have the correct number of run configurations', () => {
    expect(jsSomStats.numRunConfigs).toEqual(26);
    expect(tSomStats.numRunConfigs).toEqual(166);
  });

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
        getResultPath('jssom.png'),
        2546
      );
    });

    it('should match the svg expected', () => {
      expect(result.svg[0]).toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('jssom-som.svg'),
        2
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
        getResultPath('trufflesom.png'),
        40416
      );
    });

    it('should return five SVGs', () => {
      expect(result.svg).toBeDefined();
      expect(result.svg).toHaveLength(5);
      expect(result.svg).toEqual([
        `trufflesom-micro-somsom.svg`,
        `trufflesom-macro-startup.svg`,
        `trufflesom-macro-steady.svg`,
        `trufflesom-micro-startup.svg`,
        `trufflesom-micro-steady.svg`
      ]);
    });

    it('should match the svg expected', () => {
      expect(result.svg[0]).toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('trufflesom-micro-somsom.svg'),
        2
      );

      expect(result.svg[1]).toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('trufflesom-macro-startup.svg'),
        2
      );

      expect(result.svg[2]).toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('trufflesom-macro-steady.svg'),
        2
      );

      expect(result.svg[3]).toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('trufflesom-micro-startup.svg'),
        2
      );

      expect(result.svg[4]).toBeIdenticalSvgFiles(
        outputFolder,
        getResultPath('trufflesom-micro-steady.svg'),
        2
      );
    });
  });
});

describe('renderInlinePlot()', () => {
  const inlinePlotCanvas = createCanvas({
    height: 38,
    width: 336,
    outputType: 'svg',
    plotType: 'boxplot'
  });
  const measurements = <Measurements[]>(
    resultsJsSOM.get('som')?.get('macro')?.benchmarks.get('DeltaBlue')
      ?.measurements
  );

  const { sortedBase, sortedChange } = getMsFlattenedAndSorted(
    measurements[0],
    measurements[1]
  );
  const data = getDataNormalizedToBaselineMedian(
    'a',
    'b',
    sortedBase,
    sortedChange
  );

  it('should render the expected plot', async () => {
    const name = await renderInlinePlot(
      inlinePlotCanvas,
      data,
      outputFolder,
      'inline',
      1,
      true
    );

    expect(name).toEqual('inline-1.svg');

    expect(name).toBeIdenticalSvgFiles(outputFolder, getResultPath(name), 2);
  });
});
