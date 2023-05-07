import { initializeFilters } from './filter.js';
import { renderComparisonTimelinePlot } from './plots.js';

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

function insertWarmupPlot(e) {
  alert(
    'TODO: need to change this to use uPlot to render the plot' +
      ' based on data retrieved from the backend'
  );
  const jqButton = $(e.target);
  const url = jqButton.data('img');
  const insert = `<tr><td class="warmup-plot" colspan="6">
      <img src="${url}"></td></tr>`;
  jqButton.parent().parent().after(insert);
  jqButton.remove();
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

function fetchProfile(projectName: string, change, runId, trialId, jqInsert) {
  const profileP = fetch(
    `/rebenchdb/dash/${projectName}/profiles/${runId}/${trialId}`
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

function insertProfiles(e): void {
  const projectName = <string>$('#project-name').attr('value');
  const jqButton = $(e.target);
  let profileInsertTarget = jqButton.parent().parent();
  jqButton.remove();

  // format is serialized in data-format.ts:dataSeriesIds()
  const profilesIds = jqButton.data('content').split(',');
  for (const ids of profilesIds) {
    const [change, runId, trialId] = ids.split('/');

    const jqInsert = $(
      `<tr><td class="profile-container" colspan="6"></td></tr>`
    );
    profileInsertTarget.after(jqInsert);
    profileInsertTarget = jqInsert;
    fetchProfile(projectName, change, runId, trialId, jqInsert);
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
  const projectName = <string>$('#project-name').attr('value');
  const jqButton = $(e.target);

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
    projectName,
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
    expandButtons.each((i, elm) => insertWarmupPlot(elm));
  });

  initializeFilters('.benchmark-details tbody th:nth-child(1)');
});
