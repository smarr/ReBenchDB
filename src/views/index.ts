import { populateStatistics, renderProject } from './render.js';

const projectsP = fetch(`/rebenchdb/dash/projects`);
const statsP = fetch(`/rebenchdb/stats`);

$(async () => {
  const projectsResponse = await projectsP;
  const projects = (await projectsResponse.json()).projects;

  for (const project of projects) {
    $('#projects').append(renderProject(project));
  }

  await populateStatistics(statsP);
});
