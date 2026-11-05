import { describe, expect, it } from '@jest/globals';

import { robustPath } from '../../../src/backend/util.js';
import {
  initJestMatchers,
  isRequestedToUpdateExpectedData
} from '../../helpers.js';
import { loadBoxPlotFixtures, renderChart } from './boxplot-fixtures.js';

initJestMatchers();

const expectedFolder = robustPath('../tests/data/expected-results/boxplots');
const outputFolder = isRequestedToUpdateExpectedData()
  ? expectedFolder
  : robustPath('../tests/data/actual-results/boxplots');

const fixtures = loadBoxPlotFixtures();

describe('Box plot fixture properties', () => {
  it('should include all kinds of box plots', () => {
    const kinds = new Set(fixtures.map((f) => f.fixture.kind));
    expect([...kinds].sort()).toEqual([
      'inline-exe',
      'inline-version',
      'overview-exe',
      'overview-version'
    ]);
  });

  it.each(fixtures)('$name has one data series per label', ({ fixture }) => {
    expect(fixture.data).toHaveLength(fixture.labels.length);
    if (fixture.exeColors) {
      expect(fixture.exeColors).toHaveLength(fixture.labels.length);
    }
  });
});

describe('Rendering box plots', () => {
  describe.each(fixtures)('$name', ({ name, fixture }) => {
    let svgFile: string;

    it('should render to the expected file name', async () => {
      svgFile = await renderChart(outputFolder, name, fixture);
      expect(svgFile).toEqual(`${name}.svg`);
    });

    it('should produce the expected SVG', () => {
      expect(svgFile).toBeIdenticalSvgFiles(
        outputFolder,
        `${expectedFolder}/${name}.svg`
      );
    });

    it('should rasterize to the expected PNG', async () => {
      await expect(svgFile).toRasterizeSimilarTo(
        outputFolder,
        `${expectedFolder}/${name}.png`
      );
    });
  });
});
