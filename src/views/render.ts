import { renderResultsPlots, renderTimelinePlot } from './plots.js';

function filterCommitMessage(msg) {
  const result = msg.replace(/Signed-off-by:.*?\n/g, '');
  return result;
}

function shortCommitId(commitId) {
  return commitId.substr(0, 6);
}

function shortenCommitIds(commitIds) {
  const ids = commitIds.split(' ');
  const shortIds = ids.map(shortCommitId);
  return shortIds.join(' ');
}

function formatDateWithTime(dateStr) {
  const date = new Date(dateStr);
  const month = new String(date.getMonth() + 1).padStart(2, '0');
  const day = new String(date.getDate()).padStart(2, '0');
  const hours = new String(date.getHours()).padStart(2, '0');
  const minutes = new String(date.getMinutes()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day} ${hours}:${minutes}`;
}

export function expandMessage(event: any): void {
  const elem = event.target;
  elem.parentElement.innerText = elem.dataset.fulltext;
  event.preventDefault();
}

function formatCommitMessages(messages) {
  messages = filterCommitMessage(messages);
  const newLineIdx = messages.indexOf('\n');
  if (newLineIdx > -1) {
    const firstLine = messages.substr(0, newLineIdx);
    return (
      `${firstLine} <a href="#" onclick="expandMessage(event)"` +
      ` data-fulltext="${messages.replace('"', '\x22')}">&hellip;</a>`
    );
  } else {
    return messages;
  }
}

export function renderProjectDataOverview(data: any[]): void {
  const tBody = $('#data-overview');

  let hasDesc = false;

  for (const row of data) {
    if (row.description) {
      hasDesc = true;
    }

    tBody.append(`
      <tr>
        <td>${row.name}</td>
        <td class="desc">${row.description == null ? '' : row.description}</td>
        <td>${
          row.minstarttime == null ? '' : formatDateWithTime(row.minstarttime)
        } ${
      row.maxendtime == null ? '' : formatDateWithTime(row.maxendtime)
    }</td>
        <td>${row.users}</td>
        <td>${shortenCommitIds(row.commitids)} <p>${formatCommitMessages(
      row.commitmsgs
    )}</p></td>
        <td>${row.hostnames}</td>
        <td class="num-col">${row.runs}</td>
        <td class="num-col"><a href="/rebenchdb/get-exp-data/${row.expid}">${
      row.measurements
    }</a></td>
      </tr>`);
  }

  if (!hasDesc) {
    $('.desc').css('display', 'none');
  }
}

function renderChanges(project) {
  if (!project.showchanges) {
    return '';
  }

  const changesP = fetch(`/rebenchdb/dash/${project.id}/changes`);
  changesP.then(
    async (changesDetailsResponse) =>
      await renderChangeDetails(changesDetailsResponse, project.id)
  );

  const changes = `
    <h5>Changes</h5>
    <div class="container min-padding"><div class="row">
      <div class="col-sm min-padding scroll-list">
        <div class="list-group baseline" id="p${project.id}-baseline"
          data-project="${project.name}"></div>
      </div>
      <div class="col-sm min-padding scroll-list">
        <div class="list-group change" id="p${project.id}-change"></div>
      </div>
    </div></div>

    <a class="btn btn-primary" id="p${project.id}-compare">Compare</a>`;
  return changes;
}

async function renderChangeDetails(changesDetailsResponse, projectId) {
  const details = await changesDetailsResponse.json();

  const p1baseline = $(`#p${projectId}-baseline`);
  const p1change = $(`#p${projectId}-change`);

  for (const change of details.changes) {
    // strip out some metadata to be nicer to view.
    const msg = filterCommitMessage(change.commitmessage);
    const date = formatDateWithTime(change.experimenttime);

    const option = `<a class="list-group-item list-group-item-action
      list-min-padding"
      data-toggle="list" data-hash="${change.commitid}" href="">
        <div class="exp-date" title="Experiment Start Date">${date}</div>
        ${change.commitid.substr(0, 6)} ${change.branchortag}<br>
        <div class="change-msg">${msg}</div>
      </a>`;

    p1baseline.append(option);
    p1change.append(option);
  }

  // set a event for each list group item which calls setHref
  $(`#p${projectId}-baseline a`).on('click', (event) =>
    setHref(event, projectId, true)
  );
  $(`#p${projectId}-change a`).on('click', (event) =>
    setHref(event, projectId, false)
  );
}

function setHref(event, projectId, isBaseline) {
  // every time a commit is clicked, check to see if both left and right
  // commit are defined. set link if that is true
  const baseJQ = $(`#p${projectId}-baseline`);
  const projectName = baseJQ.data('project');

  const clicked = $(event.currentTarget).data('hash');
  let baseline;
  let change;

  if (isBaseline) {
    baseline = clicked;
    change = $(`#p${projectId}-change`).find('.active').data('hash');
  }
  if (!isBaseline) {
    change = clicked;
    baseline = baseJQ.find('.active').data('hash');
  }
  if (baseline === undefined || change === undefined) {
    return;
  }

  $(`#p${projectId}-compare`).attr(
    'href',
    `/compare/${projectName}/${baseline}/${change}`
  );
}

function renderAllResults(project) {
  if (!project.allresults) {
    return '';
  }

  const resultsP = fetch(`/rebenchdb/dash/${project.id}/results`);
  resultsP.then(async (resultsResponse) => {
    const results = await resultsResponse.json();
    renderResultsPlots(results.timeSeries, project.id);
  });

  return `<div id="p${project.id}-results"></div>`;
}

export function renderProject(project: any): string {
  const changes = renderChanges(project);
  const allResults = renderAllResults(project);

  const result = `<div class="card">
    <h5 class="card-header" id="${project.name}"><a
      href="/project/${project.id}">${project.name}</a></h5>
    <div class="card-body">
      ${changes}
      ${allResults}
      <a href="/timeline/${project.id}">Timeline</a>
    </div></div>`;
  return result;
}

export function renderWelcomeAndSetupSuggestions(): string {
  const result = `<div class="card">
  <h5 class="card-header" id="setup-info">
    Welcome to your ReBenchDB Instance</h5>
  <div class="card-body">
    <p>Currently, there are no projects available.</p>

    <p>To get started, run your benchmarks with
    <a href="https://rebench.readthedocs.io/">ReBench</a>
    and add the following to your project's ReBench configuration file:</p>
    <code><pre>reporting:
  rebenchdb:
    db_url: ${window.location.href}rebenchdb
    repo_url: https://url-to-your-project-repository
    record_all: true # make sure everything is recorded
    project_name: Your-Project-Name</pre></code>
  </div></div>`;
  return result;
}

export async function populateStatistics(statsP: any): Promise<void> {
  const statsResponse = await statsP;
  const stats = await statsResponse.json();

  const table = $('#stats-table');
  for (const t of stats.stats) {
    table.append(`<tr><td>${t.table}</td><td>${t.cnt}</td></tr>`);
  }
  table.append(
    `<tr class="table-info"><td>Version</td><td>${stats.version}</td></tr>`
  );
}

export function renderBenchmarks(benchmarks: any): void {
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

export function simplifyCmdline(cmdline: string): string {
  // remove the beginning of the path, leaving only the last element of it
  // this regex is also used in somns.Rmd, the suites part, for creating a table
  const pathRegex = /^([^\s]*)\/([^\s]+\s.*$)/;
  return cmdline.replace(pathRegex, '$2');
}

function renderBenchmark(benchmark) {
  const cmdline = simplifyCmdline(benchmark.cmdline);

  const plotId =
    `${benchmark.benchid}-${benchmark.suiteid}` +
    `-${benchmark.execid}-${benchmark.hostname}`;
  const result = `
    <div class="card">
      <div class="card-body">
        <h5 class="card-title">${benchmark.benchmark}</h5>
        <p class="card-text"><small class="text-muted">
        ${benchmark.execname}, ${benchmark.hostname}<br/>
        <code>${cmdline}</code></small></p>
        <div class="timeline-plot"
          id="plot-${plotId}"
          class="card-img-top"></div>
      </div>
    </div>`;

  return result;
}

export function renderTimelinePlots(data: any): void {
  // prepare data
  const benchmarks = new Map();
  const trials = new Map();

  for (const trial of data.details) {
    trial.start = new Date(trial.starttime);
    trials.set(trial.trialid, trial);
  }

  for (const result of data.timeline) {
    const key =
      `plot-${result.benchmarkid}-${result.suiteid}` +
      `-${result.execid}-${result.hostname}`;
    if (!benchmarks.has(key)) {
      benchmarks.set(key, []);
    }

    const results = benchmarks.get(key);
    result.trial = trials.get(result.trialid);
    results.push(result);
  }

  (<any>$).appear('.timeline-plot');
  $('.timeline-plot').on('appear', function (_event, allAppearedElements) {
    let delay = 0;
    allAppearedElements.each(function (this: any) {
      triggerRendering($(this), benchmarks, delay);
      delay += 1;
    });
  });

  // and force render first 6
  let delay = 0;
  $('.timeline-plot')
    .slice(0, 5)
    .each(function () {
      triggerRendering($(this), benchmarks, delay);
      delay += 1;
    });
}

function triggerRendering(elem, benchmarks, delay) {
  const id = elem.prop('id');
  const results = benchmarks.get(id);
  setTimeout(() => {
    renderTimelinePlot(id, results);
  }, 130 * delay);
}
