import { renderChanges, renderAllResults } from './render.js';

$(async () => {
  const projectId = <string>$('#project-id').attr('value');
  const showChanges = $('#project-showchanges').attr('value') === 'true';
  const allResults = $('#project-allresults').attr('value') === 'true';

  if (showChanges) {
    renderChanges(projectId);
  }

  if (allResults) {
    renderAllResults(projectId);
  }
});
