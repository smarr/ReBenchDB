import { parentPort, workerData } from 'node:worker_threads';
import { calculateSummaryStatistics } from '../../shared/stats.js';
import type {
  ComputeRequest,
  ComputeResult,
  ComputeResults
} from './timeline-calc.js';

parentPort?.on('message', (message) => {
  if (message === 'exit') {
    parentPort?.postMessage('exiting');
    parentPort?.close();
    return;
  }

  const request: ComputeRequest = message;
  const results: ComputeResult[] = [];

  for (const req of request.jobs) {
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
    results.push(result);
  }

  const result: ComputeResults = {
    results,
    requestStart: request.requestStart,
    requestId: request.requestId
  };
  parentPort?.postMessage(result);
});
