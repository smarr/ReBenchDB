//@ts-check
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-undef */
'use strict';

function simpleSlug(str) {
  return str.replace(/[\W_]+/g,"");
}

function renderResultsPlots(timeSeries, projectId, $) {
  let plotDivs = '';
  for (const series in timeSeries) {
    const slug = simpleSlug(series);
    plotDivs += `<h6>${series}</h6><div id="p${projectId}-results-${slug}"></div>`
  }

  $(`#p${projectId}-results`).append(plotDivs);

  for (const series in timeSeries) {
    const slug = simpleSlug(series);
    const id = `p${projectId}-results-${slug}`;
    renderResultsPlot(timeSeries[series], id, $);
  }
}


function renderResultsPlot(timeSeries, divId, $) {
  const index = [];

  const trace1 = {
    x: [],
    y: [],
    type: 'scatter',
    mode: 'lines',
    name: 'PUT /results',
    line: {
      color: '#97c4f0',
      width: 3
    }
  };

  trace1.y = timeSeries;
  const data = [trace1];

  const layout = {
    height: 200,
    margin: {
      t: 0, l: 60, b: 40
    },
    yaxis: {
      title: 'Time in ms'
    },
  }

  for (let i = 1; i <= timeSeries.length; i += 1) {
    index.push(i);
  }
  trace1.x = index;

  Plotly.newPlot(divId, data, layout);
}

function renderTimelinePlot(key, results) {
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
      data.typeLower = 'BCI 95%'
      data.typeUpper = 'BCI 95%'
      data.typeMiddle = 'median'
    } else {
      // no confidence interval, simply min/max/mean
      data.lower.push(r.minval);
      data.middle.push(r.mean);
      data.upper.push(r.maxval);
      data.typeLower = 'minimum'
      data.typeUpper = 'maximum'
      data.typeMiddle = 'mean'
    }
    data.x.push(r.trial.start);
    data.result.push(r);
  }

  // for each branch, we have three traces, the lower, middle, and upper one
  // lower/upper are thrown as bands around the middle trace
  const traces = [];

  for (const [branch, data] of branches.entries()) {
    traces.push({
      x: data.x,
      y: data.lower,
      line: {width: 0},
      marker: {color: '444'},
      mode: 'lines',
      name: `${branch} ${data.typeLower}`,
      type: 'scatter'
    });

    traces.push({
      x: data.x,
      y: data.middle,
      fill: 'tonexty',
      fillcolor: 'rgba(68, 68, 68, 0.3)',
      line: {color: 'rgb(31, 119, 180)'},
      mode: 'lines',
      name: `${branch} ${data.typeMiddle}`,
      type: 'scatter'
    });

    traces.push({
      x: data.x,
      y: data.upper,
      fill: 'tonexty',
      fillcolor: 'rgba(68, 68, 68, 0.3)',
      line: {width: 0},
      marker: {color: '444'},
      mode: 'lines',
      name: `${branch} ${data.typeUpper}`,
      type: 'scatter'
    });
  }

  const layout = {
    showlegend: false,
    height: 350,
    width: 350,
    yaxis: {title: 'Run Time (ms)'}
  };

  Plotly.newPlot(key, traces, layout);
}
