import type { TimelineResponse } from 'api.js';
import { initializeFilters } from './filter.js';
import { renderTimelinePlot } from './plots.js';

const projectId = $('#project-id').attr('value');

async function loadPlotOnce(this: any) {
  const thisJq = $(this);
  if (thisJq.data('requested')) {
    return;
  }

  thisJq.data('requested', true);

  const runId = thisJq.data('runid');
  const timelineP = await fetch(
    `/rebenchdb/dash/${projectId}/timeline/${runId}`
  );
  const response = <TimelineResponse>await timelineP.json();
  renderTimelinePlot(response, thisJq);
  thisJq.off('appear', onPlotAppearing);
}

function onPlotAppearing(_event, allAppearedElements) {
  allAppearedElements.each(loadPlotOnce);
}

$(async () => {
  const timelineJq = $('.timeline-plot');
  // activate the appear event
  (<any>timelineJq).appear();
  timelineJq.on('appear', onPlotAppearing);

  timelineJq.each((i, e) => {
    if (i < 10) {
      loadPlotOnce.call(e);
    }
  });

  initializeFilters('.benchmark > h4');
});
