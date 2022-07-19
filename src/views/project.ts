import { renderProject } from './render.js';

$(async () => {
  const project = {
    name: $('#project-name').attr('value'),
    id: $('#project-id').attr('value'),
    showchanges: $('#project-showchanges').attr('value') === 'true',
    allresults: $('#project-allresults').attr('value') === 'true'
  };

  $('#project').html(renderProject(project));
});
