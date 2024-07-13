import type { AllResults } from '../shared/api.js';
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
  const changesP = getChangesDetails(projectId);
  changesP.then(
    async (changesDetailsResponse) =>
      await renderChangeDetails(changesDetailsResponse, projectId)
  );
}

async function getChangesDetails(projectId: string) {
  const changesDetailsResponse = await fetch(
    `/rebenchdb/dash/${projectId}/changes`
  );
  return changesDetailsResponse;
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
        ${change.commitid.substring(0, 6)} ${change.branchortag}<br>
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

  renderFilterMenu(details, projectId);
}

function renderFilterMenu(details, projectId) {
  // details.branchortag : string
  // details.commitid : string
  // details.commitmessage : string
  // details.experimenttime : string
  // details.projectid : number
  // details.repourl : string

  $('.branch-filter-sidebar').each(function (index) {
    const $card = $(this);
    const branchortag: string[] = details.changes.map(
      (change) => change.branchortag
    );
    const uniqueBranchOrTag = [...new Set(branchortag)];

    function renderList(filter = '') {
      $card.find('.branch-cards-container').remove();

      const container = $('<div class="branch-cards-container"></div>');

      uniqueBranchOrTag
        .filter((bot) => bot.toLowerCase().includes(filter.toLowerCase()))
        .forEach((bot) => {
          const $link = $(`<a
              class="list-group-item list-group-item-action list-min-padding"
              data-toggle="list" data-hash="${bot}" href>
            ${bot}
          </a>
        `);

          $link.on('click', function (event) {
            event.preventDefault();

            $card.find('.list-group-item').removeClass('active');
            $(this).toggleClass('active');

            if (index === 0) {
              updateChangesList(bot, projectId, true);
            } else {
              updateChangesList(bot, projectId, false);
            }
          });

          container.append($link);
        });

      $card.append(container);
    }

    renderList();

    $card.find('.filter-header input').on('input', (event) => {
      const filter = <string>$(event.target).val();
      renderList(filter);
    });

    $card.find('.filter-options .filter-option').on('click', function (event) {
      event.preventDefault();

      $card.find('.filter-option').removeClass('selected-text');

      $(this).toggleClass('selected-text');

      const filter = $(this).text();
      switch (filter) {
        case 'Most Used':
          uniqueBranchOrTag.sort((a, b) => {
            return (
              branchortag.filter((x) => x === b).length -
              branchortag.filter((x) => x === a).length
            );
          });
          break;
        case 'Alphabetical':
          uniqueBranchOrTag.sort((a, b) => a.localeCompare(b));
          break;
        case 'Most Recent':
          uniqueBranchOrTag.sort((a, b) => {
            const dateA = details.changes.find(
              (x) => x.branchortag === a
            ).experimenttime;
            const dateB = details.changes.find(
              (x) => x.branchortag === b
            ).experimenttime;
            return new Date(dateB).getTime() - new Date(dateA).getTime();
          });
          break;
        default:
          break;
      }

      renderList();
    });
  });

  $('.left .filter-options .filter-option:contains("Most Used")').trigger(
    'click'
  );
  $('.right .filter-options .filter-option:contains("Most Recent")').trigger(
    'click'
  );
}

function updateChangesList(branchOrTag, projectId, isBaseline) {
  const selector = isBaseline
    ? `#p${projectId}-baseline`
    : `#p${projectId}-change`;
  const target = $(selector);
  target.empty();

  const changesP = getChangesDetails(projectId);
  changesP.then(async (changesDetailsResponse) => {
    const details = await changesDetailsResponse.json();

    for (const change of details.changes) {
      if (change.branchortag === branchOrTag) {
        const msg = filterCommitMessage(change.commitmessage);
        const date = formatDateWithTime(change.experimenttime);

        const option = `<a class="list-group-item list-group-item-action
          list-min-padding"
          data-toggle="list" data-hash="${change.commitid}" href="">
            <div class="exp-date" title="Experiment Start Date">${date}</div>
            ${change.commitid.substring(0, 6)} ${change.branchortag}<br>
            <div class="change-msg">${msg}</div>
          </a>`;

        target.append(option);
      }
    }

    // set a event for each list group item which calls setHref
    target
      .find('a')
      .on('click', (event) => setHref(event, projectId, isBaseline));
  });
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
    `<tr class="table-info text-secondary">
      <td>Version</td><td>${stats.version}</td></tr>`
  );

  $('#stats-table-container').show();
}
