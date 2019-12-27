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
    <h5 class="card-header">${project.name}</h5>
    <div class="card-body">
      ${changes}
      ${allResults}
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
