import type { AllResults } from '../shared/api.js';
import type { ChangesResponse, ChangesRow } from '../shared/view-types.js';
import { renderResultsPlots } from './plots.js';

export function filterCommitMessage(msg: string): string {
  const result = msg.replace(/Signed-off-by:.*?\n/g, '');
  return result;
}

function shortCommitId(commitId) {
  return commitId.substring(0, 6);
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
    const firstLine = messages.substring(0, newLineIdx);
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
  const pSlug = projectSlug;

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
        <td class="num-col">${row.measurements}
          <a rel="nofollow" href="/${pSlug}/data/${row.expid}.json.gz">JSON</a>,
          <a rel="nofollow" href="/${pSlug}/data/${row.expid}.csv.gz">CSV</a>
        </td>
      </tr>`);
  }

  if (!hasDesc) {
    $('.desc').css('display', 'none');
  }
}

export function renderChanges(projectId: string): void {
  const changesP = fetch(`/rebenchdb/dash/${projectId}/changes`);
  changesP.then(
    async (changesDetailsResponse: Response) =>
      await renderChangeDetails(changesDetailsResponse, projectId)
  );
}

function addChangesToList(
  $list: JQuery<HTMLElement>,
  changes: ChangesRow[],
  projectId: string,
  isBaseline: boolean
) {
  for (const change of changes) {
    // strip out some metadata to be nicer to view.
    const msg = filterCommitMessage(change.commitmessage);
    const date = formatDateWithTime(change.experimenttime);

    const option = `<a class="list-group-item list-group-item-action
      list-min-padding"
      data-toggle="list" data-hash="${change.commitid}" href="">
        <div class="exp-date" title="Experiment Start Date">${date}</div>
        ${change.commitid.substring(0, 6)} ${change.branchortag}<br>
        <div class="change-msg">${msg}</div>
      </a>`;

    $list.append(option);
  }

  // set a event for each list group item which calls setHref
  $list.find('a').on('click', (event) => setHref(event, projectId, isBaseline));
}

function setHref(event, projectId: string, isBaseline: boolean) {
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

async function renderChangeDetails(
  changesDetailsResponse: Response,
  projId: string
) {
  const details: ChangesResponse = await changesDetailsResponse.json();
  const changes = details.changes;

  const p1baseline = $(`#p${projId}-baseline`);
  const p1change = $(`#p${projId}-change`);

  addChangesToList(p1baseline, changes, projId, true);
  addChangesToList(p1change, changes, projId, false);

  const branches = getBranchDetails(changes);

  renderSidebar($('.branch-sidebar.left'), true, branches, changes, projId);
  renderSidebar($('.branch-sidebar.right'), false, branches, changes, projId);

  // trigger initial rendering and sorting
  $('.left .sort-option:contains("Most Used")').trigger('click');
  $('.right .sort-option:contains("Most Recent")').trigger('click');
}

interface BranchDetails {
  count: number;
  mostRecent: Date;
}

function getBranchDetails(changes: ChangesRow[]) {
  const branches = new Map<string, BranchDetails>();

  for (const change of changes) {
    const branch = change.branchortag;
    const date = new Date(change.experimenttime);

    const branchDetails = branches.get(branch);
    if (branchDetails !== undefined) {
      branchDetails.count += 1;
      if (date.getTime() > branchDetails.mostRecent.getTime()) {
        branchDetails.mostRecent = date;
      }
    } else {
      branches.set(branch, { count: 1, mostRecent: date });
    }
  }
  return branches;
}

function renderSidebar(
  $container: JQuery<HTMLElement>,
  isBaseline: boolean,
  branchDetails: Map<string, BranchDetails>,
  allChanges: ChangesRow[],
  projectId: string
) {
  const branches = Array.from(branchDetails.keys());

  $container.find('.filter-header input').on('input', () => {
    renderBranchList($container, branches, allChanges, projectId, isBaseline);
  });

  $container.find('.sort-option').on('click', function (event) {
    event.preventDefault();

    $container.find('.sort-option').removeClass('selected-text');
    $(this).toggleClass('selected-text');

    const selectedOrder = $(this).text();
    switch (selectedOrder) {
      case 'Most Used': {
        branches.sort(
          (a, b) => branchDetails.get(a)!.count - branchDetails.get(b)!.count
        );
        break;
      }
      case 'Alphabetical': {
        branches.sort((a, b) => a.localeCompare(b));
        break;
      }
      case 'Most Recent': {
        branches.sort(
          (a, b) =>
            branchDetails.get(b)!.mostRecent.getTime() -
            branchDetails.get(a)!.mostRecent.getTime()
        );
        break;
      }
    }

    renderBranchList($container, branches, allChanges, projectId, isBaseline);
  });
}

function renderBranchList(
  $container: JQuery<HTMLElement>,
  allBranches: string[],
  allChanges: ChangesRow[],
  projectId: string,
  isBaseline: boolean
) {
  let branches: string[];

  const filter = <string>$container.find('.filter-header input').val();
  if (filter) {
    branches = allBranches.filter((b) =>
      b.toLowerCase().includes(filter.toLowerCase())
    );
  } else {
    branches = allBranches;
  }

  const $branchList = $container.find('.branch-list');
  $branchList.empty();

  for (const b of branches) {
    const $link = $(`<a
          class="list-group-item list-group-item-action list-min-padding"
          data-toggle="list" data-branch="${b}" href>${b}</a>`);
    $branchList.append($link);
  }

  $branchList.find('a').on('click', function (event) {
    event.preventDefault();

    $container.find('.list-group-item').removeClass('active');
    $(this).toggleClass('active');

    const branch = $(this).data('branch');
    updateChangesList(branch, allChanges, projectId, isBaseline);
  });
}

function updateChangesList(
  branch: string,
  allChanges: ChangesRow[],
  projId: string,
  isBaseline: boolean
) {
  const selectedChanges = allChanges.filter((c) => c.branchortag === branch);
  const $list = $(isBaseline ? `#p${projId}-baseline` : `#p${projId}-change`);
  $list.empty();

  addChangesToList($list, selectedChanges, projId, isBaseline);
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
    `<tr class="table-info text-secondary">
      <td>Version</td><td>${stats.version}</td></tr>`
  );

  $('#stats-table-container').show();
}
