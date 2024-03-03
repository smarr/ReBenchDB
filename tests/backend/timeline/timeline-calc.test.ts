import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  BatchingTimelineUpdater,
  ComputeRequest,
  ComputeResults,
  TimelineWorker
} from '../../../src/backend/timeline/timeline-calc.js';
import type { Database } from '../../../src/backend/db/db.js';

describe('TimelineWorker', () => {
  const request: ComputeRequest = {
    jobs: [
      {
        runId: 1,
        trialId: 1,
        criterion: 1,
        dataForCriterion: [1, 2, 3]
      }
    ],
    requestStart: 0,
    requestId: 0
  };

  it('should succeed to execute a basic interaction', async () => {
    const results: ComputeResults[] = [];

    const worker = new TimelineWorker(0, {
      receiveResults: async (r: ComputeResults) => {
        results.push(r);
      }
    });

    worker.sendRequest(request);

    await worker.shutdown();

    expect(results).toHaveLength(1);
    expect(results[0].results).toHaveLength(1);
    expect(results[0].results[0].stats).toEqual({
      bci95low: undefined,
      bci95up: undefined,
      mean: 2,
      median: 2,
      min: 1,
      max: 3,
      numberOfSamples: 3,
      standardDeviation: 1
    });
  });

  it(
    'should be possible to await the shutdown, ' +
      ' without error and deadlock, when no request was sent',
    async () => {
      const worker = new TimelineWorker(0, {
        receiveResults: async () => {
          throw new Error('This should not be called');
        }
      });

      await worker.shutdown();
      expect(true).toBe(true);
    }
  );

  it('should be possible to await the shutdown multiple times', async () => {
    const results: ComputeResults[] = [];

    const worker = new TimelineWorker(0, {
      receiveResults: async (r: ComputeResults) => {
        results.push(r);
      }
    });

    worker.sendRequest(request);
    await worker.shutdown();
    await worker.shutdown();
    await worker.shutdown();
    expect(results).toHaveLength(1);
  });
});

describe('BatchingTimelineUpdater', () => {
  const recordTimeline = jest.fn();
  const db = <Database>(<any>{ recordTimeline });

  beforeEach(() => {
    recordTimeline.mockClear();
  });

  describe('addValues()', () => {
    it('should not record missing values to for the timeline', async () => {
      const updater = new BatchingTimelineUpdater(db, 0);

      updater.addValues(1, 1, 1, [1, null, 2, null, 3]);

      await updater.shutdown();
      expect(recordTimeline).not.toHaveBeenCalled();

      const requests = updater.consumeUpdateJobsForBenchmarking();
      expect(requests).toHaveLength(1);
      expect(requests[0].dataForCriterion).toEqual([1, 2, 3]);
    });

    it('should not add job without values (empty array)', async () => {
      const updater = new BatchingTimelineUpdater(db, 0);

      updater.addValues(1, 1, 1, []);

      await updater.shutdown();
      expect(recordTimeline).not.toHaveBeenCalled();

      const requests = updater.consumeUpdateJobsForBenchmarking();
      expect(requests).toHaveLength(0);
    });

    it('should not add job without values (array with nulls)', async () => {
      const updater = new BatchingTimelineUpdater(db, 0);

      updater.addValues(1, 1, 1, [null, null]);

      await updater.shutdown();
      expect(recordTimeline).not.toHaveBeenCalled();

      const requests = updater.consumeUpdateJobsForBenchmarking();
      expect(requests).toHaveLength(0);
    });

    it('should combine values with the same ids', async () => {
      const updater = new BatchingTimelineUpdater(db, 0);
      updater.addValues(1, 1, 1, [1, 2]);
      updater.addValues(1, 1, 1, [3, 4]);
      await updater.shutdown();

      const requests = updater.consumeUpdateJobsForBenchmarking();
      expect(requests).toHaveLength(1);
      expect(requests[0].dataForCriterion).toEqual([1, 2, 3, 4]);
    });

    it('should not combine values with different ids', async () => {
      const updater = new BatchingTimelineUpdater(db, 0);
      updater.addValues(1, 1, 1, [1, 2]);
      updater.addValues(1, 1, 2, [3, 4]);
      updater.addValues(1, 2, 1, [5, 6]);
      updater.addValues(2, 1, 1, [7, 8]);
      await updater.shutdown();

      const requests = updater.consumeUpdateJobsForBenchmarking();
      expect(requests).toHaveLength(4);
      expect(requests[0].dataForCriterion).toEqual([1, 2]);
      expect(requests[1].dataForCriterion).toEqual([3, 4]);
      expect(requests[2].dataForCriterion).toEqual([5, 6]);
      expect(requests[3].dataForCriterion).toEqual([7, 8]);
    });
  });

  it('should await quiescence without any requests', async () => {
    const updater = new BatchingTimelineUpdater(db, 0);
    await updater.awaitQuiescence();
    await updater.shutdown();

    expect(recordTimeline).not.toHaveBeenCalled();
  });

  it('should have stored results in db when job promise resolved', async () => {
    const updater = new BatchingTimelineUpdater(db, 0);

    updater.addValues(1, 1, 1, [1, 2, 3]);
    const numJobsProcessed = await updater.submitUpdateJobs();

    await updater.shutdown();
    expect(numJobsProcessed).toBe(1);
    expect(recordTimeline).toHaveBeenCalledTimes(1);
  });

  it('should be possible to await quiescence after a request', async () => {
    const updater = new BatchingTimelineUpdater(db, 0);

    updater.addValues(1, 1, 1, [1, 2, 3]);
    await updater.submitUpdateJobs();

    await updater.awaitQuiescence();
    await updater.shutdown();
    expect(recordTimeline).toHaveBeenCalledTimes(1);
  });

  it('should be possible to await quiescence multiple times', async () => {
    const updater = new BatchingTimelineUpdater(db, 0);

    updater.addValues(1, 1, 1, [1, 2, 3]);
    updater.submitUpdateJobs();

    await updater.awaitQuiescence();
    await updater.awaitQuiescence();
    await updater.awaitQuiescence();
    await updater.shutdown();
    expect(recordTimeline).toHaveBeenCalledTimes(1);
  });
});
