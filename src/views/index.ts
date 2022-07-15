import {
  populateStatistics,
  renderProject,
  renderWelcomeAndSetupSuggestions
} from './render.js';

const projectsP = fetch(`/rebenchdb/dash/projects`);
const statsP = fetch(`/rebenchdb/stats`);

$(async () => {
  const projectsResponse = await projectsP;
  const projects = (await projectsResponse.json()).projects;

  if (projects.length > 0) {
    for (const project of projects) {
      $('#projects').append(renderProject(project));
    }
  } else {
    $('#projects').append(renderWelcomeAndSetupSuggestions());
  }

  await populateStatistics(statsP);
});
