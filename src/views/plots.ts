import type { AllResults, PlotData, TimelineResponse } from 'api';
import uPlot from '/static/uPlot.esm.min.js';

function simpleSlug(str) {
  return str.replace(/[\W_]+/g, '');
}

export function renderResultsPlots(
  data: AllResults[],
  projectId: string
): void {
  let plotDivs = '';
  for (const e of data) {
    const slug = simpleSlug(e.benchmark);
    plotDivs +=
      `<h6>${e.benchmark}</h6>` +
      `<div id="p${projectId}-results-${slug}"></div>`;
  }

  $(`#p${projectId}-results`).append(plotDivs);

  for (const e of data) {
    const slug = simpleSlug(e.benchmark);
    const id = `p${projectId}-results-${slug}`;
    renderResultsPlot(e.values, document.getElementById(id));
  }
}

function renderResultsPlot(values: number[], targetElem: HTMLElement | null) {
  const indexes = new Array(values.length);
  for (let i = 1; i <= values.length; i += 1) {
    indexes[i - 1] = i;
  }

  const series = [{}, seriesConfig(null, 'Run time', baselineColor, 2)];

  const options = {
    width: 750,
    height: 240,
    title: 'Run time in ms',
    scales: { x: { time: false }, y: {} },
    series,
    axes: [
      {},
      {
        values: (_, vals) => vals.map((v) => v + 'ms'),
        size: computeAxisLabelSpace
      }
    ]
  };

  return new uPlot(options, [indexes, values], targetElem);
}

function formatMs(_, val) {
  if (val == null) {
    return '';
  }
  return val.toFixed(0) + 'ms';
}

function seriesConfig(
  branchName: string | null,
  metric: string,
  color: string,
  width: number,
  largerPoint = false,
  largerPointFill: string | undefined = undefined
) {
  let label;
  if (branchName === null && metric !== '') {
    label = metric;
  } else if (branchName !== '' && metric !== '') {
    label = `${branchName} ${metric}`;
  } else {
    label = '';
  }

  const cfg: any = {
    label,
    stroke: color,
    value: formatMs,
    width: width
  };

  if (largerPoint) {
    cfg.points = {
      size: 9,
      fill: largerPointFill
    };
  }

  return cfg;
}

const baselineColor = '#729fcf';
const baselineLight = '#97c4f0';

const changeColor = '#e9b96e';
const changeLight = '#efd0a7';

function computeAxisLabelSpace(self, axisTickLabels, axisIdx, cycleNum) {
  const axis = self.axes[axisIdx];

  // bail out, force convergence
  if (cycleNum > 1) {
    return axis._size;
  }

  let axisSize = axis.ticks.size + axis.gap;

  // find longest value
  const longest = (axisTickLabels ?? []).reduce(
    (acc, label) => (label.length > acc.length ? label : acc),
    ''
  );

  if (longest != '') {
    self.ctx.font = axis.font[0];
    axisSize += self.ctx.measureText(longest).width / devicePixelRatio;
  }

  const extraPadding = 3; // leave just a bit more space
  return Math.ceil(axisSize + extraPadding);
}

function addDataSeriesToHighlightResult(
  data: PlotData,
  timestampToHighlight: number,
  idxOfData: number
): void {
  const seriesForCurrentBase: (number | null)[] = [];
  data.push(seriesForCurrentBase);
  for (const i in data[0]) {
    const ts = data[0][i];
    if (ts == timestampToHighlight) {
      const currentValue = data[idxOfData][i];
      seriesForCurrentBase.push(currentValue);
    } else {
      seriesForCurrentBase.push(null);
    }
  }
}

export function renderTimelinePlot(
  response: TimelineResponse,
  jqInsert: any
): any {
  const series = [
    {},
    seriesConfig(null, 'BCI 95th, low', baselineLight, 1),
    seriesConfig(null, 'Median', baselineColor, 2),
    seriesConfig(null, 'BCI 95th, high', baselineLight, 1)
  ];

  const options = {
    width: 800,
    height: 240,
    title: 'Run time in ms',
    tzDate: (ts: number) => uPlot.tzDate(new Date(ts * 1000), 'UTC'),
    scales: { x: {}, y: {} },
    series,
    bands: [
      { series: [1, 2], fill: baselineLight, dir: 1 },
      { series: [2, 3], fill: baselineLight, dir: 1 }
    ],
    axes: [
      {},
      {
        values: (_, vals) => vals.map((v) => v + 'ms'),
        size: computeAxisLabelSpace
      }
    ]
  };

  return new uPlot(options, response.data, jqInsert[0]);
}

export function renderComparisonTimelinePlot(
  response: TimelineResponse,
  jqInsert: any
): any {
  const series = [
    {},
    seriesConfig(response.baseBranchName, 'BCI 95th, low', baselineLight, 1),
    seriesConfig(response.baseBranchName, 'Median', baselineColor, 2),
    seriesConfig(response.baseBranchName, 'BCI 95th, high', baselineLight, 1),
    seriesConfig(response.changeBranchName, 'BCI 95th, low', changeLight, 1),
    seriesConfig(response.changeBranchName, 'Median', changeColor, 2),
    seriesConfig(response.changeBranchName, 'BCI 95th, high', changeLight, 1)
  ];

  if (response.baseTimestamp !== null && response.changeTimestamp !== null) {
    addDataSeriesToHighlightResult(response.data, response.baseTimestamp, 2);
    series.push(seriesConfig('', '', baselineColor, 1, true, baselineLight));
  }
  let noChangeDataSeries = false;
  if (response.changeTimestamp !== null || response.baseTimestamp !== null) {
    let ts;
    let dataIndex;
    if (response.changeTimestamp !== null) {
      ts = response.changeTimestamp;
      dataIndex = 5;
    } else {
      ts = response.baseTimestamp;
      dataIndex = 2;
      noChangeDataSeries = true;
    }
    addDataSeriesToHighlightResult(response.data, ts, dataIndex);
    series.push(seriesConfig('', '', changeColor, 1, true, changeLight));
  }

  const options = {
    width: 576,
    height: 240,
    title: 'Run time in ms',
    tzDate: (ts: number) => uPlot.tzDate(new Date(ts * 1000), 'UTC'),
    scales: { x: {}, y: {} },
    series,
    bands: [
      { series: [1, 2], fill: baselineLight, dir: 1 },
      { series: [2, 3], fill: baselineLight, dir: 1 },
      { series: [4, 5], fill: changeLight, dir: 1 },
      { series: [5, 6], fill: changeLight, dir: 1 }
    ],
    axes: [
      {},
      {
        values: (_, vals) => vals.map((v) => v + 'ms'),
        size: computeAxisLabelSpace
      }
    ]
  };

  const plot = new uPlot(options, response.data, jqInsert[0]);

  if (noChangeDataSeries) {
    jqInsert.find('.u-legend tr:nth-child(6)').addClass('hidden');
  }
  return plot;
}
