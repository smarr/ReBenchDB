import type { ProfileElement } from '../shared/api.js';
import type { ProfileRow, WarmupDataForTrial } from '../shared/view-types.js';
import { initializeFilters } from './filter.js';
import { renderComparisonTimelinePlot, renderWarmupPlot } from './plots.js';

function determineAndDisplaySignificance() {
  const val = $('#significance').val();
  displaySignificance(val);
}

function displaySignificance(sig) {
  $('#significance-val').val(`${sig}%`);
  $('.stats-change.stats-total').each((i, e) => {
    const change = parseFloat(<string>e.textContent);
    const parent = $(e).parent();
    const target =
      parent.find('.stats-change.stats-total').length > 1 ? $(e) : parent;
    if (change < -sig) {
      target.css('background-color', '#e4ffc7');
    } else if (change > sig) {
      target.css('background-color', '#ffcccc');
    } else {
      target.css('background-color', '');
    }
  });
}

async function fetchWarmupData(
  projectSlug: string,
  runId: number,
  baseCommitId: string,
  changeCommitId: string,
  targetElement: JQuery<HTMLElement>
) {
  const warmupR = await fetch(
    `/rebenchdb/dash/${projectSlug}/measurements/` +
      `${runId}/${baseCommitId}/${changeCommitId}`
  );

  const warmupData: WarmupDataForTrial[] = await warmupR.json();
  renderWarmupPlot(warmupData, baseCommitId, changeCommitId, targetElement);
}

async function insertWarmupPlot(e) {
  const jqButton = $(e.target);
  const projectSlug = <string>$('#project-slug').attr('value');
  const baseHash = <string>$('#baseHash').attr('value');
  const changeHash = <string>$('#changeHash').attr('value');

  const runId = parseInt(jqButton.data('content'));

  const insert = `<tr><td class="warmup-plot show-legend" colspan="6">
  <div class="plot-container"></div></td></tr>`;

  const jqInsert = $(insert);
  jqInsert.insertAfter(jqButton.parent().parent());
  jqButton.remove();

  await fetchWarmupData(
    projectSlug,
    runId,
    baseHash,
    changeHash,
    jqInsert.find('.plot-container')
  );
}

function createEntry(e: string | ProfileElement, profId, counter) {
  counter.cnt += 1;

  let entryHtml = '';
  const justStr = typeof e === 'string';

  if (!justStr && e.p <= 0.1) {
    return '';
  }

  const hasTrace = !justStr && e.t !== undefined;

  if (hasTrace) {
    // eslint-disable-next-line max-len
    entryHtml += `<a href="#${profId}-item-${counter.cnt}" data-toggle="collapse">`;
  } else {
    entryHtml += `<span>`;
  }

  const percent = justStr ? '' : e.p.toFixed(2);
  entryHtml += `<span class="percent">${percent}</span> `;

  if (hasTrace) {
    entryHtml += `<span class="glyph glyph-plus"></span> `;
  }

  if (justStr) {
    entryHtml += e;
  } else {
    entryHtml += e.m;
  }

  if (hasTrace && e.t !== undefined) {
    entryHtml += `</a>`;

    // eslint-disable-next-line max-len
    entryHtml += `<div class="list-group collapse" id="${profId}-item-${counter.cnt}">`;

    for (const te of e.t) {
      counter.cnt += 1;
      entryHtml += createEntry(te, profId, counter);
    }

    entryHtml += `</div>`;
  } else {
    entryHtml += `</span>`;
  }

  return entryHtml;
}

function fetchProfile(
  projectSlug: string,
  commitId: string,
  isBase: boolean,
  runId: number,
  jqInsert: JQuery<HTMLElement>
) {
  const profileP = fetch(
    `/rebenchdb/dash/${projectSlug}/profiles/${runId}/${commitId}`
  );
  profileP.then(async (profileResponse) => {
    const profileData: ProfileRow[] = await profileResponse.json();
    const profId = `prof-${commitId}-${runId}`;

    const container = jqInsert.children();
    const labelClass = isBase ? 'baseline' : 'change';

    let mainContent = '';

    for (const row of profileData) {
      const label = `<span class="${labelClass}-badge">${commitId}</span>`;
      mainContent += `${label}<div class="list-group list-group-root">`;

      const counter = { cnt: 0 };
      for (const e of row.profile) {
        mainContent += createEntry(e, profId, counter);
      }
      mainContent += `</div>`;
    }

    container.append(mainContent);
    $('.list-group-item').on('click', function () {
      $('.glyph', container)
        .toggleClass('glyph-plus')
        .toggleClass('glyph-minus');
    });
  });
}

function insertProfiles(e): void {
  const projectSlug = <string>$('#project-slug').attr('value');
  const baseHash = <string>$('#baseHash').attr('value');
  const changeHash = <string>$('#changeHash').attr('value');

  const jqButton = $(e.target);
  let profileInsertTarget = jqButton.parent().parent();
  jqButton.remove();

  const runId = parseInt(jqButton.data('content'));

  for (const commitId of [baseHash, changeHash]) {
    const jqInsert = $(
      `<tr><td class="profile-container" colspan="6"></td></tr>`
    );
    profileInsertTarget.after(jqInsert);
    profileInsertTarget = jqInsert;

    fetchProfile(projectSlug, commitId, commitId === baseHash, runId, jqInsert);
  }
}

async function fetchPost(url: string, data: any): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    mode: 'same-origin',
    cache: 'no-cache',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    redirect: 'follow',
    referrerPolicy: 'no-referrer',
    body: JSON.stringify(data)
  });
  return response.json();
}

async function insertTimeline(e): Promise<void> {
  const jqButton = $(e.target);

  const projectSlug = <string>$('#project-slug').attr('value');
  const baseHash = $('#baseHash').attr('value');
  const changeHash = $('#changeHash').attr('value');

  const dataId = jqButton.data('content');
  dataId.baseline = baseHash;
  dataId.change = changeHash;

  const insert =
    '<tr><td colspan="6"><div class="plot-container"></div></td></tr>';
  const jqInsert = $(insert);
  jqInsert.insertAfter(jqButton.parent().parent());
  jqButton.remove();

  await fetchTimelineData(
    projectSlug,
    dataId,
    jqInsert.find('.plot-container')
  );
}

async function fetchTimelineData(
  projectName: string,
  dataId,
  jqInsert
): Promise<void> {
  const response = await fetchPost(
    `/rebenchdb/dash/${projectName}/timelines`,
    dataId
  );
  renderComparisonTimelinePlot(response, jqInsert);
}

$(() => {
  $('#significance').on('input', determineAndDisplaySignificance);
  determineAndDisplaySignificance();

  $('#show-refresh-form').on('click', () => $('input[name=password]').show());

  (<any>$)('.btn-popover').popover({ html: true, placement: 'top' });
  $('.btn-warmup').on('click', insertWarmupPlot);
  $('.btn-profile').on('click', insertProfiles);
  $('.btn-timeline').on('click', insertTimeline);
  $('.showMore').on('click', showAllResults);

  $('.collapsible').click(function () {
    $('.benchmark-row.hidden').toggleClass('hidden');

    $(this).toggleClass('active');

    const isActivated = $(this).hasClass('active');
    $(this).text(isActivated ? 'Show Less' : 'Show More');

    const table = document.getElementById('benchmarkTable');
    const rows = table?.querySelectorAll('tr.benchmark-row');
    const maxRows = 3;
    let i = 0;
    rows?.forEach((row) => {
      const tableRow = row as HTMLTableRowElement;
      if (isActivated || i < maxRows) {
        tableRow.style.display = 'table-row';
      } else {
        tableRow.style.display = 'none';
        window.scrollTo(0, 0);
      }
      i++;
    });
  });

  const table = document.getElementById('benchmarkTable');
  const rows = table?.querySelectorAll('tr.benchmark-row');
  const maxRows = 3;
  let i = 0;

  rows?.forEach((row) => {
    const tableRow = row as HTMLTableRowElement;
    if (i < maxRows) {
      tableRow.style.display = 'table-row';
    } else {
      tableRow.style.display = 'none';
    }
    i++;
  });

  const headlinesForTablesWithWarmupPlots = $('table:has(button.btn-warmup)')
    .prev()
    .prev();
  headlinesForTablesWithWarmupPlots.append(
    `<button type="button" class="btn btn-sm btn-light btn-warmup"></button>`
  );
  const buttons = headlinesForTablesWithWarmupPlots.find('.btn-warmup');
  buttons.on('click', (e) => {
    const expandButtons = $(e.target)
      .parent()
      .next()
      .next()
      .find('.btn-warmup');
    expandButtons.each((i, elm) => {
      insertWarmupPlot(elm);
    });
  });

  initializeFilters('.benchmark-details tbody th:nth-child(1)');
});

function showAllResults(event): void {
  event.preventDefault();

  const rows = document.querySelectorAll<HTMLTableRowElement>(
    '#benchmarkTableBody .benchmark-row'
  );
  rows.forEach((row) => {
    row.style.display = 'table-row';
  });

  const showMoreButton = document.getElementById('showMore');
  if (showMoreButton) {
    showMoreButton.style.display = 'none';
  }
}
