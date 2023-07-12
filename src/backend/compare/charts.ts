import { writeFileSync } from 'fs';
import { joinImages } from 'join-images';

import {
  ChartJSNodeCanvas,
  ChartJSNodeCanvasOptions
} from 'chartjs-node-canvas';
import { ByGroupChangeData, ChangeData } from './prep-data.js';
import {
  ViolinController,
  Violin,
  BoxPlotController,
  BoxAndWiskers
} from '@sgratzl/chartjs-chart-boxplot';
import { medianUnsorted } from '../../shared/stats.js';
import { robustPath } from '../util.js';
import { siteAesthetics } from '../../shared/aesthetics.js';

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

export function calculateInlinePlotHeight(numExes: number): number {
  const bottomMargin = 15;
  const topMargin = 1;
  const perExe = 14;
  return bottomMargin + numExes * perExe + topMargin;
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

function toDataSetWithBaseChangeBackground(data: ChangeData): any[] {
  if (data.labels.length !== 2) {
    throw new Error(
      'Expect data with a baseline and a change data series.' +
        ` But got one with ${data.labels.length} series, labeled: ` +
        data.labels.join(', ')
    );
  }

  const colors = [siteAesthetics.baseColor, siteAesthetics.changeColor];
  const lightColors = [
    siteAesthetics.baseColorLight,
    siteAesthetics.changeColorLight
  ];

  return [
    {
      backgroundColor: lightColors,
      borderColor: colors,

      outlierBackgroundColor: lightColors,
      outlierBorderColor: colors,
      outlierRadius: 1.5,

      borderWidth: 1,
      itemRadius: 2,

      meanBackgroundColor: '#000',
      meanBorderColor: '#000',
      meanBorderWidth: 1,
      meanRadius: 1.5,

      data: <number[]>(<unknown>data.data)
    }
  ];
}

function toDataSetWithExeColors(data: ChangeData, exeColors: string[]): any[] {
  if (data.labels.length < 2) {
    throw new Error(
      'Expect at least two data series, but only got ' + data.labels.length
    );
  }

  const lightColors = exeColors.map((c) => siteAesthetics.lighten(c));

  return [
    {
      backgroundColor: lightColors,
      borderColor: exeColors,

      outlierBackgroundColor: lightColors,
      outlierBorderColor: exeColors,
      outlierRadius: 1.5,

      borderWidth: 1,
      itemRadius: 2,

      meanBackgroundColor: '#000',
      meanBorderColor: '#000',
      meanBorderWidth: 1,
      meanRadius: 1.5,

      data: <number[]>(<unknown>data.data)
    }
  ];
}

function toDataSetWithFastSlowBackground(data: ChangeData): any[] {
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
      borderWidth: 1,
      itemRadius: 2,

      meanBackgroundColor: '#000',
      meanBorderColor: '#000',
      meanBorderWidth: 1,
      meanRadius: 1.5,

      data: <number[]>(<unknown>data.data)
    }
  ];
}

export interface CanvasSettings {
  height: number;
  width: number;
  outputType: 'svg' | 'png';
  plotType: 'boxplot' | 'violin';
}

export function createCanvas(settings: CanvasSettings): ChartJSNodeCanvas {
  const plugins: any[] = ['chartjs-plugin-annotation'];

  const canvasOptions: ChartJSNodeCanvasOptions = {
    width: settings.width,
    height: settings.height,
    backgroundColour: siteAesthetics.backgroundColor,
    plugins: { modern: plugins },
    chartCallback: (ChartJS) => {
      ChartJS.defaults.font.family = 'Roboto';

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

      if (settings.plotType === 'boxplot') {
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

  if (settings.outputType === 'svg') {
    (<any>canvasOptions).type = 'svg'; // work around the readonly property
  }

  const canvas = new ChartJSNodeCanvas(canvasOptions);

  canvas.registerFont(robustPath('../dist/roboto-hinted/Roboto-Regular.ttf'), {
    family: 'Roboto',
    weight: '400'
  });
  canvas.registerFont(robustPath('../dist/roboto-hinted/Roboto-Bold.ttf'), {
    family: 'Roboto',
    weight: '700'
  });
  return canvas;
}

async function renderDataOnCanvas(
  canvas: ChartJSNodeCanvas,
  title: string | null,
  data: ChangeData,
  outputType: 'svg' | 'png' = 'png',
  plotType: 'boxplot' | 'violin' = 'boxplot',
  showYAxisLabels = true,
  fontSize = 12,
  tickLength = 4,
  conversionFn = toDataSetWithFastSlowBackground
): Promise<Buffer> {
  const plotTypeConst =
    plotType === 'boxplot' ? ('boxplot' as const) : ('violin' as const);

  const configuration = {
    type: plotTypeConst,
    data: {
      labels: data.labels,
      datasets: conversionFn(data)
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
            drawTicks: true,
            tickLength,
            drawBorder: false,
            tickColor: '#000'
          },
          ticks: {
            font: {
              size: fontSize
            }
          }
        },
        y: {
          grid: {
            display: false,
            drawBorder: false
          }
        }
      }
    }
  };

  if (!showYAxisLabels) {
    (<any>configuration.options.scales.y).ticks = { display: false };
  }

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
  plotType: 'boxplot' | 'violin' = 'boxplot',
  conversionFn = toDataSetWithFastSlowBackground
): Promise<Buffer> {
  const chartJSNodeCanvas = createCanvas({
    height: calculatePlotHeight(title, data),
    width: siteAesthetics.overviewPlotWidth,
    outputType,
    plotType
  });

  return renderDataOnCanvas(
    chartJSNodeCanvas,
    title,
    data,
    outputType,
    plotType,
    undefined,
    undefined,
    undefined,
    conversionFn
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

export async function renderOverviewPlot(
  outputFolder: string,
  plotName: string,
  group: string,
  plotData: ChangeData,
  exeColors: string[]
): Promise<string> {
  const absolutePath = `${outputFolder}/${plotName}-${group}.svg`;

  const svg = await renderOverviewComparison(
    group,
    plotData,
    'svg',
    'boxplot',
    (data: ChangeData) => toDataSetWithExeColors(data, exeColors)
  );
  writeFileSync(absolutePath, svg);

  return `${plotName}-${group}.svg`;
}

export async function renderInlinePlot(
  canvas: ChartJSNodeCanvas,
  data: ChangeData,
  outputFolder: string,
  plotName: string,
  plotId: number,
  isAcrossVersions: boolean,
  exeColorsArray?: string[]
): Promise<string> {
  if (!isAcrossVersions && !exeColorsArray) {
    throw new Error(
      'Need exeColorsArray when plotting a comparison across executors'
    );
  }
  const buffer = await renderDataOnCanvas(
    canvas,
    null,
    data,
    'svg',
    'boxplot',
    false,
    6,
    2,
    isAcrossVersions
      ? toDataSetWithBaseChangeBackground
      : (data: ChangeData) =>
          toDataSetWithExeColors(data, <string[]>exeColorsArray)
  );
  const inlinePlotUrl = `${plotName}-${plotId}.svg`;
  writeFileSync(`${outputFolder}/${inlinePlotUrl}`, buffer);
  return inlinePlotUrl;
}
