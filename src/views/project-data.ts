import { renderProjectDataOverview } from './render.js';

const projectId = $('#project-id').attr('value');
const dataOverviewP = fetch(`/rebenchdb/dash/${projectId}/data-overview`);

$(async () => {
  const dataOverviewResponse = await dataOverviewP;
  const data = (await dataOverviewResponse.json()).data;
  renderProjectDataOverview(data);
});
