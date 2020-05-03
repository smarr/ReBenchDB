//@ts-check
'use strict';

function renderChanges(project, $) {
  if (!project.showchanges) {
    return '';
  }

  const changesP = fetch(`/rebenchdb/dash/${project.id}/changes`);
  changesP.then(
    async (changesDetailsResponse) => await renderChangeDetails
        (changesDetailsResponse, project.id, $));

  const changes = `
    <h5>Changes</h5>
    <div class="container min-padding"><div class="row">
      <div class="col-sm min-padding scroll-list">
        <div class="list-group baseline" id="p${project.id}-baseline"></div>
      </div>
      <div class="col-sm min-padding scroll-list">
        <div class="list-group change" id="p${project.id}-change"></div>
      </div>
    </div></div>

    <button type="button" class="btn btn-primary" id="p${project.id}-compare">Compare</button>`;
  return changes;
}

async function renderChangeDetails(changesDetailsResponse, projectId, $) {
  const details = await changesDetailsResponse.json();

  const p1baseline = $(`#p${projectId}-baseline`);
  const p1change = $(`#p${projectId}-change`);
  for (const change of details.changes) {
    // strip out some metadata to be nicer to view.
    const msg = change.commitmessage.replace(/Signed-off-by:.*?\n/, '');

    const option = `<a class="list-group-item list-group-item-action list-min-padding"
      data-toggle="list" data-hash="${change.commitid}" href="">
        ${change.commitid.substr(0,  6)} ${change.branchortag}<br>
        <div style="font-size: 80%; line-height: 1">${msg}</div>
      </a>`;

    p1baseline.append(option);
    p1change.append(option);
  }
  $(`#p${projectId}-compare`).click(() => openCompare(projectId, $));
}

function openCompare(projectId, $) {
  const baseline = $(`#p${projectId}-baseline`).find('.active').data('hash');
  const change = $(`#p${projectId}-change`).find('.active').data('hash');
  window.location.href = `/compare/SOMns/${baseline}/${change}`;
}

function renderAllResults(project, $) {
  if (!project.allresults) {
    return '';
  }

  const resultsP = fetch(`/rebenchdb/dash/${project.id}/results`);
  resultsP.then(
    async (resultsResponse) => {
      const results = await resultsResponse.json();
      renderResultsPlot(results.timeSeries, project.id, $);
    });

  return `<div id="p${project.id}-results"></div>`;
}

function renderProject(project, $) {
  const changes = renderChanges(project, $);
  const allResults = renderAllResults(project, $);

  const result = `<div class="card">
    <h5 class="card-header"><a href="/project/${project.id}">${project.name}</a></h5>
    <div class="card-body">
      ${changes}
      ${allResults}
      <a href="/timeline/${project.id}">Timeline</a>
    </div></div>`;
  return result;
}

async function populateStatistics(statsP, $) {
  const statsResponse = await statsP;
  const stats = await statsResponse.json();

  const table = $('#stats-table');
  for (const t of stats.stats) {
    table.append(`<tr><td>${t.table}</td><td>${t.cnt}</td></tr>`);
  }
  table.append(`<tr class="table-info"><td>Version</td><td>${stats.version}</td></tr>`);
}

function renderBenchmarks(benchmarks, $) {
  let suiteName = null;
  let content = '';
  for (const benchmark of benchmarks) {
    if (suiteName !== benchmark.suitename) {
      if (content !== '') {
        content += '</div>'; // closing card-columns
        $('#benchmarks').append(content);
        content = '';
      }

      content += `<h3>${benchmark.suitename}</h3>`;
      suiteName = benchmark.suitename;
      content += `<div class="card-columns">`;
    }

    content += renderBenchmark(benchmark);
  }

  // handling the last benchmark suite
  if (content !== '') {
    content += '</div>'; // closing card-columns
    $('#benchmarks').append(content);
  }
}

function renderBenchmark(benchmark) {
  // capture the beginning of the path but leave the last element of it
  const pathRegex = /^(.*?)((?:\/\w+)\s.*$)/;
  const cmdline = benchmark.cmdline.replace(pathRegex, '.$2');

  const result = `
    <div class="card">
      <div class="card-body">
        <h5 class="card-title">${benchmark.benchmark}</h5>
        <p class="card-text"><small class="text-muted">
        ${benchmark.execname}, ${benchmark.hostname}<br/>
        <code>${cmdline}</code></small></p>
        <div class="timeline-plot" id="plot-${benchmark.benchid}-${benchmark.suiteid}-${benchmark.execid}-${benchmark.hostname}" class="card-img-top"></div>
      </div>
    </div>`;

  return result;
}

function renderTimelinePlots(data, $) {
  // prepare data
  const benchmarks = new Map();
  const trials = new Map();

  for (const trial of data.details) {
    trial.start = new Date(trial.starttime);
    trials.set(trial.trialid, trial);
  }

  for (const result of data.timeline) {
    const key = `plot-${result.benchmarkid}-${result.suiteid}-${result.execid}-${result.hostname}`;
    if (!benchmarks.has(key)) {
      benchmarks.set(key, []);
    }

    const results = benchmarks.get(key);
    result.trial = trials.get(result.trialid);
    results.push(result);
  }

  $.appear('.timeline-plot');
  $('.timeline-plot').on('appear', function (_event, allAppearedElements) {
    let delay = 0;
    allAppearedElements.each(function () {
      triggerRendering($(this), benchmarks, delay);
      delay += 1;
    });
  });

  // and force render first 6
  let delay = 0;
  $('.timeline-plot').slice(0, 5).each(function () {
    triggerRendering($(this), benchmarks, delay);
    delay += 1;
  });
}

function triggerRendering(elem, benchmarks, delay) {
  const id = elem.prop('id');
  const results = benchmarks.get(id);
  setTimeout(() => {renderTimelinePlot(id, results);}, 130 * delay);
}
