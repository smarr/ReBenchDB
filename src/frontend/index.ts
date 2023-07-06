import {
  populateStatistics,
  renderAllResults,
  renderChanges
} from './render.js';

async function showStatistics(): Promise<void> {
  const statsP = fetch(`/rebenchdb/stats`);
  await populateStatistics(statsP);
  $('#stats-table-button').hide();
}

$(async () => {
  $('#stats-table-button').on('click', showStatistics);
  $('.project-data').each((_i, elem) => {
    const elemJq = $(elem);
    const showChanges = elemJq.data('showchanges');
    const allResults = elemJq.data('allresults');
    const projectId = elemJq.data('id');

    if (showChanges) {
      renderChanges(projectId);
    }

    if (allResults) {
      renderAllResults(projectId);
    }
  });
});
