import {
  ChartJSNodeCanvas,
  ChartJSNodeCanvasOptions
} from 'chartjs-node-canvas';
import { ChangeData } from '../src/stats-data-prep';
import {
  // ViolinController,
  // Violin,
  BoxPlotController,
  BoxAndWiskers
} from '@sgratzl/chartjs-chart-boxplot';

const changeColor = '#e9b96e';
const baseColor = '#729fcf';

const changeColorLight = '#efd0a7';
const baseColorLight = '#97c4f0';
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

export async function renderOverviewComparison(
  title: string | null,
  data: ChangeData,
  type: 'svg' | 'png' = 'png'
): Promise<Buffer> {
  const width = 432;
  const height = calculatePlotHeight(title, data);
  const backgroundColour = 'white'; // Uses https://www.w3schools.com/tags/canvas_fillstyle.asp
  const canvasOptions: ChartJSNodeCanvasOptions = {
    width,
    height,
    backgroundColour,
    plugins: {
      modern: ['chartjs-plugin-annotation', BoxPlotController, BoxAndWiskers]
    }
  };
  if (type === 'svg') {
    (<any>canvasOptions).type = 'svg'; // work around the readonly property
  }
  const chartJSNodeCanvas = new ChartJSNodeCanvas(canvasOptions);

  const configuration = {
    type: 'boxplot' as const,
    data: {
      labels: data.labels,
      datasets: [
        {
          backgroundColor: fullyTransparent,
          borderColor: changeColor,
          borderWidth: 1.5,
          itemRadius: 2,
          data: <number[]>(<unknown>data.data)
        }
      ]
    },
    options: {
      devicePixelRatio: 2,
      indexAxis: 'y' as const,
      plugins: {
        legend: { display: false },
        annotation: {
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
        }
      },
      // Not having any effect
      // layout: {
      //   padding: {
      //     top: -100,
      //     right: 1
      //   }
      // },
      scales: {
        x: {
          suggestedMin: 0,
          suggestedMax: 2
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
//  - [ ] combine charts into single image
//  - [ ] set background color if the median is below 0.95 or above 1.05
//  - [x] add plot title, i.e., the suite name
//  - [ ] add logic to swap suite and exe if there's only a single exe in every suite so that
//        that the suites are on the y-axis instead of the facets
//  - [ ] try the violin plot
