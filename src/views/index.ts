import {
  populateStatistics,
  renderAllResults,
  renderChanges
} from './render.js';

const statsP = fetch(`/rebenchdb/stats`);

$(async () => {
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

  await populateStatistics(statsP);
});
