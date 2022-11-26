import { parentPort, workerData } from 'node:worker_threads';
import { calculateSummaryStatistics } from './stats.js';
import { ComputeRequest, ComputeResult } from './timeline-calc.js';

parentPort?.on('message', (message) => {
  if (message === 'exit') {
    parentPort?.postMessage('exiting');
    parentPort?.close();
    return;
  }

  const req: ComputeRequest = message;
  const stats = calculateSummaryStatistics(
    req.dataForCriterion,
    workerData.numBootstrapSamples
  );

  const result: ComputeResult = {
    runId: req.runId,
    trialId: req.trialId,
    criterion: req.criterion,
    stats
  };
  parentPort?.postMessage(result);
});
