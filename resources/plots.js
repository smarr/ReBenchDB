//@ts-check
'use strict';

function renderResultsPlot(timeSeries, projectId, $) {

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

  Plotly.newPlot(`p${projectId}-results`, data, layout);
}
