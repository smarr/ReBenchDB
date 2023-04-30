import { describe, expect, beforeAll, afterAll, it } from '@jest/globals';

import { ChartJSNodeCanvas } from 'chartjs-node-canvas';

import { ChartType } from 'chart.js';
import { writeFileSync, readFileSync } from 'fs';
import { PNG } from 'pngjs';
import { robustPath } from '../src/util';
import pixelmatch from 'pixelmatch';
import {
  calculateAllChangeStatistics,
  calculateRunTimeFactor,
  collateMeasurements,
  getChangeDataBySuiteAndExe
} from '../src/stats-data-prep.js';
import { renderOverviewComparison } from '../src/charts.js';
import { joinImages } from 'join-images';

describe('Rendering a bar chart with chart.js', () => {
  const width = 800; //px
  const height = 800; //px
  const backgroundColour = 'white'; // Uses https://www.w3schools.com/tags/canvas_fillstyle.asp
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width,
    height,
    backgroundColour
  });

  let image: Buffer;

  it('should render a chart', async () => {
    const configuration = {
      type: <ChartType>'bar',
      data: {
        labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
        datasets: [
          {
            label: '# of Votes',
            data: [12, 19, 3, 5, 2, 3]
          }
        ]
      }
    };
    image = await chartJSNodeCanvas.renderToBuffer(configuration);
    // writeFileSync('chart.png', image);
  });

  it('should match the chart written to file', async () => {
    const path = robustPath('../tests/data/chart.png');
    const expectedPng = PNG.sync.read(readFileSync(path));
    const actualPng = PNG.sync.read(image);

    const { width, height } = expectedPng;
    const diff = new PNG({ width, height });

    const numMismatchedPixel = pixelmatch(
      expectedPng.data,
      actualPng.data,
      diff.data,
      width,
      height,
      { threshold: 0.01 }
    );
    try {
      expect(numMismatchedPixel).toBe(0);
    } catch (exception) {
      writeFileSync('diff.png', PNG.sync.write(diff));
      throw exception;
    }
  });
});

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
const resultsTruffleSOM = collateMeasurements(dataTruffleSOM.results);

calculateAllChangeStatistics(resultsJsSOM, 0, 1, null);
calculateAllChangeStatistics(resultsTruffleSOM, 0, 1, null);

const changeDataJsSOM = getChangeDataBySuiteAndExe(resultsJsSOM, 'total');
const changeDataTruffleSOM = getChangeDataBySuiteAndExe(
  resultsTruffleSOM,
  'total'
);

const runTimeFactorJsSOM = calculateRunTimeFactor(changeDataJsSOM);
const runTimeFactorTruffleSOM = calculateRunTimeFactor(changeDataTruffleSOM);

describe('Render a boxplot and violin plot for the JsSOM dataset', () => {
  // The original report is accessible at https://rebench.dev/JsSOM/compare/4dff7ec575c7bfb7aebd246ef6e6e6e6c0cb9286..bc11056d762995407a0905ff5229cb7bd115f62d

  // get statistics for each benchmark, grouped by suite and exe
  const result = collateMeasurements(dataJsSOM.results);
  const changeOffset = 1;
  calculateAllChangeStatistics(result, 0, 1, null);

  it('a boxplot for the overview comparison', async () => {
    const images: Buffer[] = [];

    for (const [suite, data] of runTimeFactorJsSOM.entries()) {
      const image = await renderOverviewComparison(suite, data);
      images.push(image);
      // writeFileSync(`boxplot-jssom-${suite}.png`, image);

      const svg = await renderOverviewComparison(suite, data, 'svg');
      writeFileSync(`boxplot-jssom-${suite}.svg`, svg);
    }

    const result = await joinImages(images, { direction: 'vertical' });
    result.toFile('boxplot-jssom.png');
  });

  it('a violin plot for the overview comparison', async () => {
    const images: Buffer[] = [];

    for (const [suite, data] of runTimeFactorJsSOM.entries()) {
      const image = await renderOverviewComparison(
        suite,
        data,
        undefined,
        'violin'
      );
      images.push(image);

      const svg = await renderOverviewComparison(suite, data, 'svg', 'violin');
      writeFileSync(`violin-jssom-${suite}.svg`, svg);
    }

    const result = await joinImages(images, { direction: 'vertical' });
    result.toFile('violin-jssom.png');
  });
});
describe('Render a boxplot and violin plot for the TruffleSOM dataset', () => {
  // The original report is accessible at https://rebench.dev/TruffleSOM/compare/5820ec7d590013a9a47b06303cfff0cb7ccd9cea..5fa4bdb749d3b4a621362219420947e00e108580

  it('a boxplot for the overview comparison', async () => {
    const images: Buffer[] = [];

    for (const [suite, data] of runTimeFactorTruffleSOM.entries()) {
      const image = await renderOverviewComparison(suite, data);
      images.push(image);

      // writeFileSync(`boxplot-tsom-${suite}.png`, image);
    }

    const result = await joinImages(images, { direction: 'vertical' });
    result.toFile('boxplot-tsom.png');
  });

  it('a violin plot for the overview comparison', async () => {
    const images: Buffer[] = [];

    for (const [suite, data] of runTimeFactorTruffleSOM.entries()) {
      const image = await renderOverviewComparison(
        suite,
        data,
        undefined,
        'violin'
      );
      images.push(image);

      // writeFileSync(`boxplot-tsom-${suite}.png`, image);
    }

    const result = await joinImages(images, { direction: 'vertical' });
    result.toFile('violin-tsom.png');
  });
});
