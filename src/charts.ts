import { writeFileSync } from 'fs';
import { joinImages } from 'join-images';

import {
  ChartJSNodeCanvas,
  ChartJSNodeCanvasOptions
} from 'chartjs-node-canvas';
import { ByGroupChangeData, ChangeData } from '../src/stats-data-prep.js';
import {
  ViolinController,
  Violin,
  BoxPlotController,
  BoxAndWiskers
} from '@sgratzl/chartjs-chart-boxplot';
import { medianUnsorted } from '../src/stats.js';
import { siteAesthetics } from './util.js';

const fullyTransparent = 'rgba(0, 0, 0, 0)';

const marginTop = 12;
const marginTopWithTitle = 34;
const marginBottom = 28;
const perEntryHeight = 34;

function calculatePlotHeight(title: string | null, data: ChangeData): number {
  const result = marginBottom + data.labels.length * perEntryHeight;
  if (title) {
    return result + marginTopWithTitle;
  }
  return result + marginTop;
}

function getFivePercentLineAnnotations() {
  return {
    annotations: {
      line1: {
        type: 'line' as const,
        xMin: 1,
        xMax: 1,
        borderColor: '#000',
        borderWidth: 1,
        drawTime: 'beforeDatasetsDraw'
      },
      line095: {
        type: 'line' as const,
        xMin: 0.95,
        xMax: 0.95,
        borderDash: [5, 5],
        borderColor: '#ccc',
        borderWidth: 1,
        drawTime: 'beforeDatasetsDraw'
      },
      line105: {
        type: 'line' as const,
        xMin: 1.05,
        xMax: 1.05,
        borderDash: [5, 5],
        borderColor: '#ccc',
        borderWidth: 1,
        drawTime: 'beforeDatasetsDraw'
      }
    }
  };
}

function getDataset(data: ChangeData) {
  const medianPerLabel = data.data.map((d) => medianUnsorted(d));

  const backgroundColors = medianPerLabel.map((d) => {
    if (d < 0.95) {
      return siteAesthetics.fastColor;
    } else if (d > 1.05) {
      return siteAesthetics.slowColor;
    }
    return fullyTransparent;
  });

  return [
    {
      backgroundColor: backgroundColors,
      borderColor: siteAesthetics.changeColor,
      borderWidth: 1.5,
      itemRadius: 2,
      data: <number[]>(<unknown>data.data)
    }
  ];
}

export function createCanvas(
  height: number,
  width: number,
  outputType: 'svg' | 'png' = 'png',
  plotType: 'boxplot' | 'violin' = 'boxplot'
): ChartJSNodeCanvas {
  const plugins: any[] = ['chartjs-plugin-annotation'];

  const canvasOptions: ChartJSNodeCanvasOptions = {
    width,
    height,
    backgroundColour: siteAesthetics.backgroundColor,
    plugins: { modern: plugins },
    chartCallback: (ChartJS) => {
      ChartJS.register({
        id: 'my_background_color',
        beforeDraw: (chart, _options) => {
          const ctx = chart.ctx;
          ctx.save();
          ctx.fillStyle = siteAesthetics.backgroundColor;
          ctx.fillRect(0, 0, siteAesthetics.overviewPlotWidth, chart.height);
          ctx.restore();
        }
      });

      if (plotType === 'boxplot') {
        ChartJS.register(BoxPlotController, BoxAndWiskers);
        ChartJS.registry.addControllers(BoxPlotController, BoxAndWiskers);
        ChartJS.registry.addElements(BoxAndWiskers);
      } else {
        ChartJS.register(ViolinController, Violin);
        ChartJS.registry.addControllers(ViolinController, Violin);
        ChartJS.registry.addElements(Violin);
      }
    }
  };

  if (outputType === 'svg') {
    (<any>canvasOptions).type = 'svg'; // work around the readonly property
  }
  return new ChartJSNodeCanvas(canvasOptions);
}

export async function renderDataOnCanvas(
  canvas: ChartJSNodeCanvas,
  title: string | null,
  data: ChangeData,
  outputType: 'svg' | 'png' = 'png',
  plotType: 'boxplot' | 'violin' = 'boxplot'
): Promise<Buffer> {
  const plotTypeConst =
    plotType === 'boxplot' ? ('boxplot' as const) : ('violin' as const);

  const configuration = {
    type: plotTypeConst,
    data: {
      labels: data.labels,
      datasets: getDataset(data)
    },
    options: {
      devicePixelRatio: 2,
      indexAxis: 'y' as const,
      plugins: {
        legend: { display: false },
        annotation: getFivePercentLineAnnotations()
      },
      scales: {
        x: {
          suggestedMin: 0,
          suggestedMax: 2,
          grid: {
            drawOnChartArea: false,
            drawTicks: true
          }
        },
        y: {
          grid: {
            display: false
          }
        }
      }
    }
  };

  if (title) {
    (<any>configuration.options.plugins).title = {
      text: title,
      display: true
    };
  }

  if (outputType === 'svg') {
    return canvas.renderToBufferSync(configuration, 'image/svg+xml');
  }
  return canvas.renderToBuffer(configuration);
}

export async function renderOverviewComparison(
  title: string | null,
  data: ChangeData,
  outputType: 'svg' | 'png' = 'png',
  plotType: 'boxplot' | 'violin' = 'boxplot'
): Promise<Buffer> {
  const chartJSNodeCanvas = createCanvas(
    calculatePlotHeight(title, data),
    siteAesthetics.overviewPlotWidth,
    outputType,
    plotType
  );

  return renderDataOnCanvas(
    chartJSNodeCanvas,
    title,
    data,
    outputType,
    plotType
  );
}

export async function renderOverviewPlots(
  outputFolder: string,
  plotName: string,
  plotData: ByGroupChangeData
): Promise<{ png: string; svg: string[] }> {
  const images: Buffer[] = [];
  const svgUrls: string[] = [];

  for (const [group, data] of plotData.entries()) {
    const image = await renderOverviewComparison(group, data, 'png');
    images.push(image);
    writeFileSync(`${outputFolder}/${plotName}-${group}.png`, image);

    const absolutePath = `${outputFolder}/${plotName}-${group}.svg`;
    svgUrls.push(`${plotName}-${group}.svg`);
    const svg = await renderOverviewComparison(group, data, 'svg');
    writeFileSync(absolutePath, svg);
  }

  const result = await joinImages(images, { direction: 'vertical' });
  const pngAbsolutePath = `${outputFolder}/${plotName}.png`;
  await result.toFile(pngAbsolutePath);

  return { png: `${plotName}.png`, svg: svgUrls };
}
