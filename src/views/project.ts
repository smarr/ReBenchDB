import { renderProject } from './render.js';

$(async () => {
  const project = {
    name: $('#project-name').attr('value'),
    id: $('#project-id').attr('value'),
    showchanges: $('#project-showchanges').attr('value'),
    allresults: $('#project-allresults').attr('value')
  };

  $('#project').html(renderProject(project));
});
