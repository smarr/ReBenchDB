import { describe, expect, afterAll, it } from '@jest/globals';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { sep, basename } from 'node:path';

import {
  getDataNormalizedToBaselineMedian,
  calculateAllChangeStatistics,
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

declare module 'expect' {
  interface AsymmetricMatchers {
    toBeMostlyIdenticalImage(expectedFile: string): void;
    toBeIdenticalSvgFiles(expectedFile: string): void;
  }
  interface Matchers<R> {
    toBeMostlyIdenticalImage(expectedFile: string): R;
    toBeIdenticalSvgFiles(expectedFile: string): R;
  }
}

function createTmpDirectory(): string {
  const tmpDir = tmpdir();
  return mkdtempSync(`${tmpDir}${sep}rebenchdb-charts-tests`);
}

const outputFolder = createTmpDirectory();

function toBeMostlyIdenticalImage(actualFile: string, expectedFile: string) {
  if (typeof actualFile !== 'string' || typeof expectedFile !== 'string') {
    throw new Error(
      `toBeMostlyIdenticalImage() expects two strings,` +
        ` got ${typeof actualFile} and ${typeof expectedFile}`
    );
  }

  const actualPng = PNG.sync.read(
    readFileSync(`${outputFolder}/${actualFile}`)
  );
  const expectedPng = PNG.sync.read(readFileSync(expectedFile));

  const actualSize = { width: actualPng.width, height: actualPng.height };
  const expectedSize = {
    width: expectedPng.width,
    height: expectedPng.height
  };

  if (
    actualSize.width !== expectedSize.width ||
    actualSize.height !== expectedSize.height
  ) {
    return {
      message: () =>
        `expected ${actualFile} to have the same size as ${expectedFile}.
         Expected: ${actualSize.width}x${actualSize.height}
         Actual:   ${expectedSize.width}x${expectedSize.height}`,
      pass: false
    };
  }

  const diff = new PNG({
    width: actualSize.width,
    height: actualSize.height
  });

  const numMismatchedPixel = pixelmatch(
    expectedPng.data,
    actualPng.data,
    diff.data,
    actualSize.width,
    actualSize.height,
    { threshold: 0.01 }
  );

  if (numMismatchedPixel > 0) {
    const diffFileName = `diff-${basename(expectedFile)}-${basename(
      actualFile
    )}.png`;
    writeFileSync(diffFileName, PNG.sync.write(diff));

    return {
      message: () =>
        `expected ${actualFile} to be mostly identical to ${expectedFile},
         but ${numMismatchedPixel} pixels were different.
         See ${diffFileName} for a diff.`,
      pass: false
    };
  }

  return {
    pass: true,
    message: () =>
      `Expected ${actualFile} to be different ` +
      `from ${expectedFile}, but were mostly identical.`
  };
}

function toBeIdenticalSvgFiles(actualFile: string, expectedFile: string) {
  const actual: string = readFileSync(`${outputFolder}/${actualFile}`, 'utf8');
  const expected: string = readFileSync(expectedFile, 'utf8');

  if (actual !== expected) {
    writeFileSync(basename(actualFile), actual);

    return {
      message: () =>
        `expected ${actualFile} to be identical to ${expectedFile},
         but they were different.
         See ${basename(actualFile)}.`,
      pass: false
    };
  }
  return {
    pass: true,
    message: () =>
      `Expected ${actualFile} to be different ` +
      `from ${expectedFile}, but both were identical.`
  };
}

expect.extend({
  toBeMostlyIdenticalImage,
  toBeIdenticalSvgFiles
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
const resultsTSOM = collateMeasurements(dataTruffleSOM.results);

calculateAllChangeStatistics(resultsJsSOM, 0, 1, null);
calculateAllChangeStatistics(resultsTSOM, 0, 1, null);

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
        robustPath('../tests/data/charts/jssom.png')
      );
    });

    it('should match the svg expected', () => {
      expect(result.svg[0]).toBeIdenticalSvgFiles(
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
        robustPath('../tests/data/charts/trufflesom-macro-steady.svg')
      );

      expect(result.svg[1]).toBeIdenticalSvgFiles(
        robustPath('../tests/data/charts/trufflesom-micro-steady.svg')
      );

      expect(result.svg[2]).toBeIdenticalSvgFiles(
        robustPath('../tests/data/charts/trufflesom-macro-startup.svg')
      );

      expect(result.svg[3]).toBeIdenticalSvgFiles(
        robustPath('../tests/data/charts/trufflesom-micro-startup.svg')
      );

      expect(result.svg[4]).toBeIdenticalSvgFiles(
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
      robustPath(`../tests/data/charts/${name}`)
    );
  });
});

afterAll(() => {
  const keepCharts = false;
  if (keepCharts) {
    console.log(`outputFolder: ${outputFolder}`);
  } else {
    rmSync(outputFolder, { recursive: true, force: true });
  }
});
