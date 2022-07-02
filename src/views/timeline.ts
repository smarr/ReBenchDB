import { renderBenchmarks, renderTimelinePlots } from './render.js';

const projectId = $('#project-id').attr('value');
const benchmarksP = fetch(`/rebenchdb/dash/${projectId}/benchmarks`);
const timelineP = fetch(`/rebenchdb/dash/${projectId}/timeline`);

$(async () => {
  const benchmarksResponse = await benchmarksP;
  const benchmarks = (await benchmarksResponse.json()).benchmarks;
  renderBenchmarks(benchmarks);

  const timelineResponse = await timelineP;
  renderTimelinePlots(await timelineResponse.json());
});
