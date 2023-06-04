import { initializeFilters } from './filter.js';
import { renderComparisonTimelinePlot, renderWarmupPlot } from './plots.js';
import { WarmupData } from './view-types.js';

function determineAndDisplaySignificance() {
  const val = $('#significance').val();
  displaySignificance(val);
}

function displaySignificance(sig) {
  $('#significance-val').val(`${sig}%`);
  $('.stats-change').each((i, e) => {
    const change = parseFloat(<string>e.textContent);
    const parent = $(e).parent();
    const target = parent.find('.stats-change').length > 1 ? $(e) : parent;
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
  dataIds: DataSeriesIds,
  targetElement: JQuery<HTMLElement>
) {
  const warmupR = await fetch(
    `/rebenchdb/dash/${projectSlug}/measurements/` +
      `${dataIds.runId}/${dataIds.ids[0].trialId}/${dataIds.ids[1].trialId}`
  );

  const warmupData: WarmupData = await warmupR.json();
  renderWarmupPlot(
    warmupData,
    dataIds.ids[0].commitId,
    dataIds.ids[1].commitId,
    targetElement
  );
}

async function insertWarmupPlot(e) {
  const jqButton = $(e.target);
  const projectSlug = <string>$('#project-slug').attr('value');
  const dataIds = parseDataSeriesIds(jqButton.data('content'));

  const insert = `<tr><td class="warmup-plot show-legend" colspan="6">
  <div class="plot-container"></div></td></tr>`;

  const jqInsert = $(insert);
  jqInsert.insertAfter(jqButton.parent().parent());
  jqButton.remove();

  await fetchWarmupData(projectSlug, dataIds, jqInsert.find('.plot-container'));
}

function createEntry(e, profId, counter) {
  let entryHtml = '';
  const justStr = typeof e === 'string';

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

  if (hasTrace) {
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

function fetchProfile(projectSlug: string, change, runId, trialId, jqInsert) {
  const profileP = fetch(
    `/rebenchdb/dash/${projectSlug}/profiles/${runId}/${trialId}`
  );
  profileP.then(async (profileResponse) => {
    const profileData = await profileResponse.json();
    const profId = `prof-${change}-${runId}-${trialId}`;

    const container = jqInsert.children();
    let mainContent = `<div class="list-group list-group-root">`;

    const counter = { cnt: 0 };
    for (const e of profileData.profile) {
      counter.cnt += 1;
      if (e.p <= 0.1) {
        break;
      }
      mainContent += createEntry(e, profId, counter);
    }

    mainContent += `</div>`;
    container.append(mainContent);

    $('.list-group-item').on('click', function () {
      $('.glyph', container)
        .toggleClass('glyph-plus')
        .toggleClass('glyph-minus');
    });
  });
}

interface DataSeriesIds {
  runId: number;
  ids: { commitId: string; trialId: number }[];
}

/**
 * Parse the format serialized in data-format.ts:dataSeriesIds().
 */
function parseDataSeriesIds(serialized: string): DataSeriesIds {
  const idPairs = serialized.split(',');
  const runId = <string>idPairs.shift();

  const data: { commitId: string; trialId: number }[] = [];
  for (const id of idPairs) {
    const [commitId, trialId] = id.split('/');
    data.push({ commitId, trialId: parseInt(trialId) });
  }

  return { runId: parseInt(runId), ids: data };
}

function insertProfiles(e): void {
  const projectSlug = <string>$('#project-slug').attr('value');
  const jqButton = $(e.target);
  let profileInsertTarget = jqButton.parent().parent();
  jqButton.remove();

  const { runId, ids } = parseDataSeriesIds(jqButton.data('content'));

  for (const { commitId, trialId } of ids) {
    const jqInsert = $(
      `<tr><td class="profile-container" colspan="6"></td></tr>`
    );
    profileInsertTarget.after(jqInsert);
    profileInsertTarget = jqInsert;
    fetchProfile(projectSlug, commitId, runId, trialId, jqInsert);
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
