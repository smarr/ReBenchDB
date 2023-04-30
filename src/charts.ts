import {
  ChartJSNodeCanvas,
  ChartJSNodeCanvasOptions
} from 'chartjs-node-canvas';
import { ChangeData } from '../src/stats-data-prep';
import {
  ViolinController,
  Violin,
  BoxPlotController,
  BoxAndWiskers
} from '@sgratzl/chartjs-chart-boxplot';
import { medianUnsorted } from '../src/stats';

const changeColor = '#e9b96e';
const baseColor = '#729fcf';

const changeColorLight = '#efd0a7';
const baseColorLight = '#97c4f0';

const fastColor = '#e4ffc7';
const slowColor = '#ffcccc';

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
      return fastColor;
    } else if (d > 1.05) {
      return slowColor;
    }
    return fullyTransparent;
  });

  return [
    {
      backgroundColor: backgroundColors,
      borderColor: changeColor,
      borderWidth: 1.5,
      itemRadius: 2,
      data: <number[]>(<unknown>data.data)
    }
  ];
}

export async function renderOverviewComparison(
  title: string | null,
  data: ChangeData,
  type: 'svg' | 'png' = 'png',
  plotType: 'boxplot' | 'violin' = 'boxplot'
): Promise<Buffer> {
  const width = 432;
  const height = calculatePlotHeight(title, data);
  const backgroundColour = 'white'; // Uses https://www.w3schools.com/tags/canvas_fillstyle.asp
  const canvasOptions: ChartJSNodeCanvasOptions = {
    width,
    height,
    backgroundColour,
    plugins: {
      modern: [
        'chartjs-plugin-annotation',
        BoxPlotController,
        BoxAndWiskers,
        ViolinController,
        Violin
      ]
    }
  };
  if (type === 'svg') {
    (<any>canvasOptions).type = 'svg'; // work around the readonly property
  }
  const chartJSNodeCanvas = new ChartJSNodeCanvas(canvasOptions);

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

  if (type === 'svg') {
    return chartJSNodeCanvas.renderToBufferSync(configuration, 'image/svg+xml');
  }
  return chartJSNodeCanvas.renderToBuffer(configuration);
}

// TODO:
//  - [x] render SVG version
//  - [x] combine charts into single image
//  - [x] set background color if the median is below 0.95 or above 1.05
//  - [x] add plot title, i.e., the suite name
//  - [ ] add logic to swap suite and exe if there's only a single exe in every suite so that
//        that the suites are on the y-axis instead of the facets
//  - [x] try the violin plot
