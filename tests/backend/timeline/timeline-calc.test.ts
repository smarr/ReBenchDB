import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import {
  BatchingTimelineUpdater,
  ComputeRequest,
  ComputeResult,
  TimelineWorker
} from '../../../src/backend/timeline/timeline-calc.js';
import { Database } from '../../../src/backend/db/db.js';

describe('TimelineWorker', () => {
  const request: ComputeRequest = {
    runId: 1,
    trialId: 1,
    criterion: 1,
    dataForCriterion: [1, 2, 3],
    requestStart: 0
  };

  it('should succeed to execute a basic interaction', async () => {
    const results: ComputeResult[] = [];

    const worker = new TimelineWorker(0, {
      receiveResult: async (r: ComputeResult) => {
        results.push(r);
      }
    });

    worker.sendRequest(request);

    await worker.shutdown();

    expect(results).toHaveLength(1);
    expect(results[0].stats).toEqual({
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
        receiveResult: async () => {
          throw new Error('This should not be called');
        }
      });

      await worker.shutdown();
      expect(true).toBe(true);
    }
  );

  it('should be possible to await the shutdown multiple times', async () => {
    const results: ComputeResult[] = [];

    const worker = new TimelineWorker(0, {
      receiveResult: async (r: ComputeResult) => {
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
  const db = jest.spyOn(Database.prototype, 'recordTimeline');

  beforeEach(() => {
    db.mockClear();
  });

  it('should not record missing values to for the timeline', async () => {
    const updater = new BatchingTimelineUpdater(<any>db, 0);

    updater.addValues(1, 1, 1, [1, null, 2, null, 3]);

    await updater.shutdown();
    expect(db).not.toHaveBeenCalled();

    const requests = updater.getUpdateJobsForBenchmarking();
    expect(requests).toHaveLength(1);
    expect(requests[0].dataForCriterion).toEqual([1, 2, 3]);
  });

  it('should not add job without values (empty array)', async () => {
    const updater = new BatchingTimelineUpdater(<any>db, 0);

    updater.addValues(1, 1, 1, []);

    await updater.shutdown();
    expect(db).not.toHaveBeenCalled();

    const requests = updater.getUpdateJobsForBenchmarking();
    expect(requests).toHaveLength(0);
  });

  it('should not add job without values (array with nulls)', async () => {
    const updater = new BatchingTimelineUpdater(<any>db, 0);

    updater.addValues(1, 1, 1, [null, null]);

    await updater.shutdown();
    expect(db).not.toHaveBeenCalled();

    const requests = updater.getUpdateJobsForBenchmarking();
    expect(requests).toHaveLength(0);
  });

  it('should await quiescence without any requests', async () => {
    db.mockClear();

    const updater = new BatchingTimelineUpdater(<any>db, 0);
    await updater.getQuiescencePromise();
    await updater.shutdown();

    expect(db).not.toHaveBeenCalled();
  });
});
