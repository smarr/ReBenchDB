import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { robustPath } from '../../../src/backend/util.js';
import {
  calculateInlinePlotHeight,
  createCanvas,
  renderInlinePlot,
  renderOverviewComparison,
  renderOverviewPlot
} from '../../../src/backend/compare/charts.js';
import { siteAesthetics } from '../../../src/shared/aesthetics.js';
import type { ChangeData } from '../../../src/backend/compare/prep-data.js';

export type BoxPlotKind =
  'inline-version' | 'inline-exe' | 'overview-exe' | 'overview-version';

export interface BoxPlotFixture {
  kind: BoxPlotKind;

  /** Plot title */
  title?: string;

  /** plot size, some plots have computed size */
  width?: number;
  height?: number;

  /** Label for data series */
  labels: string[];

  /** Colors for data series */
  exeColors?: string[];

  /** Data series of normalized values */
  data: number[][];
}

export interface NamedFixture {
  name: string;
  fixture: BoxPlotFixture;
}

const fixtureFolder = robustPath('../tests/data/boxplots');

export function loadBoxPlotFixtures(): NamedFixture[] {
  const result: NamedFixture[] = [];
  for (const report of readdirSync(fixtureFolder).sort()) {
    if (report.endsWith('.md')) {
      continue;
    }
    const files = readdirSync(`${fixtureFolder}/${report}`)
      .filter((f) => f.endsWith('.json'))
      .sort();
    for (const file of files) {
      const fixture = <BoxPlotFixture>(
        JSON.parse(readFileSync(`${fixtureFolder}/${report}/${file}`, 'utf8'))
      );
      result.push({ name: `${report}/${file.replace('.json', '')}`, fixture });
    }
  }
  return result;
}

/**
 * Split the plot name from  `renderInlinePlot()`,
 * which produces `${plotName}-${plotId}`.
 */
function splitPlotId(name: string): { plotName: string; plotId: number } {
  const match = name.match(/^(.*)-(\d+)$/);
  if (!match) {
    throw new Error(`Inline plot fixture ${name} does not end in a number`);
  }
  return { plotName: match[1], plotId: Number(match[2]) };
}

/**
 * @returns the path of the SVG file relative to `outputFolder`,
 *          which is `${name}.svg`
 */
export async function renderChart(
  outputFolder: string,
  name: string,
  fixture: BoxPlotFixture
): Promise<string> {
  mkdirSync(dirname(`${outputFolder}/${name}`), { recursive: true });
  const data: ChangeData = { labels: fixture.labels, data: fixture.data };

  switch (fixture.kind) {
    case 'inline-version': {
      const { plotName, plotId } = splitPlotId(name);
      const canvas = createCanvas(siteAesthetics.inlinePlot);
      return renderInlinePlot(
        canvas,
        data,
        outputFolder,
        plotName,
        plotId,
        true
      );
    }
    case 'inline-exe': {
      const { plotName, plotId } = splitPlotId(name);
      const canvas = createCanvas({
        ...siteAesthetics.inlinePlot,
        height: calculateInlinePlotHeight(fixture.labels.length)
      });
      return renderInlinePlot(
        canvas,
        data,
        outputFolder,
        plotName,
        plotId,
        false,
        fixture.exeColors
      );
    }
    case 'overview-exe': {
      const plotName = name.replace(`-${fixture.title}`, '');
      return renderOverviewPlot(
        outputFolder,
        plotName,
        <string>fixture.title,
        data,
        <string[]>fixture.exeColors
      );
    }
    case 'overview-version': {
      const svg = await renderOverviewComparison(
        <string>fixture.title,
        data,
        'svg'
      );
      writeFileSync(`${outputFolder}/${name}.svg`, svg);
      return `${name}.svg`;
    }
  }
}
