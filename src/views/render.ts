import type { AllResults } from 'api.js';
import { renderResultsPlots } from './plots.js';

export function filterCommitMessage(msg: string): string {
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

export function renderProjectDataOverview(
  data: any[],
  projectSlug: string
): void {
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
        <td class="num-col"><a href="/${projectSlug}/data/${row.expid}">${
      row.measurements
    }</a></td>
      </tr>`);
  }

  if (!hasDesc) {
    $('.desc').css('display', 'none');
  }
}

export function renderChanges(projectId: string): void {
  const changesP = fetch(`/rebenchdb/dash/${projectId}/changes`);
  changesP.then(
    async (changesDetailsResponse) =>
      await renderChangeDetails(changesDetailsResponse, projectId)
  );
}

async function renderChangeDetails(changesDetailsResponse, projectId: string) {
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
  const projectSlug = baseJQ.data('project-slug');

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
    `/${projectSlug}/compare/${baseline}..${change}`
  );
}

export function renderAllResults(projectId: string): void {
  const resultsP = fetch(`/rebenchdb/dash/${projectId}/results`);
  resultsP.then(async (resultsResponse) => {
    const results = <AllResults[]>await resultsResponse.json();
    renderResultsPlots(results, projectId);
  });
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
