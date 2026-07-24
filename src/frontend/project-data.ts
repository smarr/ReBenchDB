import { apiFetch } from './api-client.js';
import { renderProjectDataOverview } from './render.js';

const projectId = <string>$('#project-id').attr('value');
const projectSlug = <string>$('#project-slug').attr('value');
const dataOverviewP = apiFetch('/rebenchdb/dash/:projectId/data-overview', {
  projectId
});

$(async () => {
  const dataOverviewResponse = await dataOverviewP;
  const data = dataOverviewResponse.data;
  renderProjectDataOverview(data, projectSlug);
});
