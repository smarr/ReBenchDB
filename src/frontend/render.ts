import type { AllResults } from '../shared/api.js';
import { renderResultsPlots } from './plots.js';

export function filterCommitMessage(msg: string): string {
  const result = msg.replace(/Signed-off-by:.*?\n/g, '');
  return result;
}

function shortCommitId(commitId: string) {
  return commitId.substring(0, 6);
}

function shortenCommitIds(commitIds: string) {
  const ids = commitIds.split(' ');
  const shortIds = ids.map(shortCommitId);
  return shortIds.join(' ');
}

function formatDateWithTime(dateStr: string | number | Date) {
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

function formatCommitMessages(messages: string) {
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
  const changesDetailsResponse = await fetch(`/rebenchdb/dash/${projectId}/changes`);
  return changesDetailsResponse;
}

async function renderChangeDetails(changesDetailsResponse: Response, projectId: string) {
  const details = await changesDetailsResponse.json();

  const p1baseline = $(`#p${projectId}-baseline`);
  const p1change = $(`#p${projectId}-change`);

  console.log(details);

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

  const baselineFilterMenu = $('.links_card').first();
  const changeFilterMenu = $('.links_card').last();

  const baselineTable = $('.row').children().first();
  const changeTable = $('.row').children().last();
  
  generateFilterMenu(details, projectId, baselineTable, baselineFilterMenu);
  generateFilterMenu(details, projectId, changeTable, changeFilterMenu);
}

/**
 * @param tableId the table to which the filter menu should be added
 */
function generateFilterMenu(details, projectId, tableId, filterMenuContainer) {
  const filterMenu = `
    <div class="filter-header">
      <input type="text" id="branchSearch" placeholder="Search branches/tags...">
      <span class="settings-icon">&#9881;</span>
    </div>
    <div class="filter-options">
      <a href="#" class="filter-option selected-text">Most Used</a>
      <a href="#" class="filter-option">Alphabetical</a>
    </div>
  `;
  filterMenuContainer.append(filterMenu);



  filterMenuContainer.find(".filter-option").on('click', function(event) {
    event.preventDefault();

    filterMenuContainer.find(".filter-option").removeClass('selected-text');

    $(this).toggleClass('selected-text');

    const selectedOption = $(this).text();
    console.log('selectedOption', selectedOption);
  });

  // Event listener for search filter input
  $('#branchSearch').on('input', (event) => {
    const filter = $(event.target).val();
    console.log('filter', filter);
  });

  // Event listener for settings icon
  $('.settings-icon').on('click', function(event) {
    console.log('settings clicked');
  });

  console.log('generateFilterMenu');
  populateFilterMenu(details, projectId, tableId, filterMenuContainer);
}


function populateFilterMenu(details, projectId, tableId, filterMenuContainer) {
  // details.branchortag : string
  // details.commitid : string
  // details.commitmessage : string
  // details.experimenttime : string
  // details.projectid : string
  // details.repourl : string

  // Render all unique details.branchortag in the links_card
  filterMenuContainer.each(function(index) {
    const $card = $(this);
    const branchortag = details.changes.map(change => change.branchortag);
    const uniqueBranchOrTag = [...new Set(branchortag)];

    // Function to render the list of branches or tags
    const renderList = (filter = '') => {
      // Clear existing list
      $card.find('.branch-cards-container').remove();

      // Create a container div
      const container = $('<div class="branch-cards-container"></div>');

      // Append filtered items to the container
      uniqueBranchOrTag.filter(bot => bot.toLowerCase().includes(filter.toLowerCase())).forEach(bot => {
        const $link = $(`<a class="list-group-item list-group-item-action list-min-padding"
          data-toggle="list" data-hash="${bot}" href="">
            ${bot}
          </a>
        `);

        // Add click event listener to the link
        $link.on('click', function(event) {
          event.preventDefault();

          // Remove 'active' class from all other links
          $card.find('.list-group-item').removeClass('active');

          // Toggle 'active' class on the clicked link
          $(this).toggleClass('active');

          console.log('clicked', bot);

          // Update the corresponding changes list
          updateChangesList(bot, projectId, tableId);
        });

        container.append($link);
      });

      // Append the container to the current links_card
      $card.append(container);

      console.log('renderList', filter);
    };

    // Initial render of the list
    renderList();

    // Event listener for search filter input scoped to this links_card
    $card.find('.filter-header input').on('input', (event) => {
      const filter = $(event.target).val();
      renderList(filter);
    });
  });
}

function updateChangesList(branchOrTag, projectId, tableId) {
  const target = tableId;
  target.empty();

  const changesP = getChangesDetails(projectId);
  changesP.then(async (changesDetailsResponse) => {
    const details = await changesDetailsResponse.json();

    for (const change of details.changes) {
      if (change.branchortag === branchOrTag) {
        const msg = filterCommitMessage(change.commitmessage);
        const date = formatDateWithTime(change.experimenttime);

        const option = `<a class="list-group-item list-group-item-action list-min-padding"
          data-toggle="list" data-hash="${change.commitid}" href="">
            <div class="exp-date" title="Experiment Start Date">${date}</div>
            ${change.commitid.substring(0, 6)} ${change.branchortag}<br>
            <div class="change-msg">${msg}</div>
          </a>`;

        target.append(option);
      }
    }

    // set a event for each list group item which calls setHref
    target.find('a').on('click', (event) =>
      setHref(event, projectId, tableId)
    );
  });
}

function setHref(event, projectId, tableId) {
  // every time a commit is clicked, check to see if both left and right
  // commit are defined. set link if that is true
  const projectSlug = tableId.data('project-slug');

  const clicked = $(event.currentTarget).data('hash');
  let baseline;
  let change;

  if (tableId.attr('id').endsWith('-baseline')) {
    baseline = clicked;
    change = $(`#p${projectId}-change`).find('.active').data('hash');
  } else {
    change = clicked;
    baseline = $(`#p${projectId}-baseline`).find('.active').data('hash');
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