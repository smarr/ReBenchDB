import type { PlotData, TimelineResponse } from 'api';
import type { Data } from 'plotly.js';
declare const Plotly: any;
import uPlot from '/static/uPlot.esm.min.js';

function simpleSlug(str) {
  return str.replace(/[\W_]+/g, '');
}

export function renderResultsPlots(timeSeries: any, projectId: string): void {
  let plotDivs = '';
  for (const series in timeSeries) {
    const slug = simpleSlug(series);
    plotDivs +=
      `<h6>${series}</h6>` + `<div id="p${projectId}-results-${slug}"></div>`;
  }

  $(`#p${projectId}-results`).append(plotDivs);

  for (const series in timeSeries) {
    const slug = simpleSlug(series);
    const id = `p${projectId}-results-${slug}`;
    renderResultsPlot(timeSeries[series], id);
  }
}

function renderResultsPlot(timeSeries, divId) {
  const index: number[] = [];

  const trace1: Data = {
    x: <number[]>[],
    y: <number[]>[],
    type: 'scatter',
    mode: 'lines',
    name: 'PUT /results',
    line: {
      color: '#97c4f0',
      width: 3
    }
  };

  trace1.y = timeSeries;
  const data: Data[] = [trace1];

  const layout = {
    height: 200,
    margin: {
      t: 0,
      l: 60,
      b: 40
    },
    yaxis: {
      title: 'Time in ms'
    }
  };

  for (let i = 1; i <= timeSeries.length; i += 1) {
    index.push(i);
  }
  trace1.x = index;

  Plotly.newPlot(divId, data, layout);
}

export function renderTimelinePlot(key: any, results: any): void {
  // split results into branches
  const branches = new Map();

  for (const r of results) {
    const branch = r.trial.branchortag;
    if (!branches.has(branch)) {
      branches.set(branch, {
        lower: [],
        middle: [],
        upper: [],
        result: [],
        x: [],
        typeLower: '',
        typeUpper: '',
        typeMiddle: ''
      });
    }

    const data = branches.get(branch);
    if (r.bci95low !== null) {
      // we got a confidence interval
      data.lower.push(r.bci95low);
      data.middle.push(r.median);
      data.upper.push(r.bci95up);
      data.typeLower = 'BCI 95%';
      data.typeUpper = 'BCI 95%';
      data.typeMiddle = 'median';
    } else {
      // no confidence interval, simply min/max/mean
      data.lower.push(r.minval);
      data.middle.push(r.mean);
      data.upper.push(r.maxval);
      data.typeLower = 'minimum';
      data.typeUpper = 'maximum';
      data.typeMiddle = 'mean';
    }
    data.x.push(r.trial.start);
    data.result.push(r);
  }

  // for each branch, we have three traces, the lower, middle, and upper one
  // lower/upper are thrown as bands around the middle trace
  const traces: any[] = [];

  for (const [branch, data] of branches.entries()) {
    traces.push({
      x: data.x,
      y: data.lower,
      line: { width: 0 },
      marker: { color: '444' },
      mode: 'lines',
      name: `${branch} ${data.typeLower}`,
      type: 'scatter'
    });

    traces.push({
      x: data.x,
      y: data.middle,
      fill: 'tonexty',
      fillcolor: 'rgba(68, 68, 68, 0.3)',
      line: { color: 'rgb(31, 119, 180)' },
      mode: 'lines',
      name: `${branch} ${data.typeMiddle}`,
      type: 'scatter'
    });

    traces.push({
      x: data.x,
      y: data.upper,
      fill: 'tonexty',
      fillcolor: 'rgba(68, 68, 68, 0.3)',
      line: { width: 0 },
      marker: { color: '444' },
      mode: 'lines',
      name: `${branch} ${data.typeUpper}`,
      type: 'scatter'
    });
  }

  const layout = {
    showlegend: false,
    height: 350,
    width: 350,
    yaxis: { title: 'Run Time (ms)' }
  };

  Plotly.newPlot(key, traces, layout);
}

function formatMs(_, val) {
  if (val == null) {
    return '';
  }
  return val.toFixed(0) + 'ms';
}

function seriesConfig(
  branchName: string,
  metric: string,
  color: string,
  width: number,
  largerPoint = false,
  largerPointFill: string | undefined = undefined
) {
  let label;
  if (branchName !== '' && metric !== '') {
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

  return Math.ceil(axisSize);
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
    title: 'Runtime in ms',
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
