import { Database } from '../db/db.js';
import type { SummaryStatistics } from '../../shared/stats.js';
import { robustSrcPath } from '../util.js';
import { Worker } from 'node:worker_threads';
import {
  completeRequestAndHandlePromise,
  startRequest
} from '../perf-tracker.js';
import { log, assert } from '../logging.js';
import type { ValuesPossiblyMissing } from '../../shared/api.js';

export interface ComputeJob {
  runId: number;
  trialId: number;
  criterion: number;
  dataForCriterion: number[];
}

export interface ComputeRequest {
  jobs: ComputeJob[];
  requestStart: number;
  requestId: number;
}

export interface ActiveRequest {
  request: ComputeRequest;
  resolveWithNumberOfJobs: (value: number) => void;
}

export interface ComputeResult {
  runId: number;
  trialId: number;
  criterion: number;
  stats: SummaryStatistics;
}

export interface ComputeResults {
  results: ComputeResult[];
  requestStart: number;
  requestId: number;
}

export interface ResultReceiver {
  receiveResults(result: ComputeResults): Promise<void>;
}

/**
 * This class is responsible for managing the web worker that calculates
 * summary statistics for the timeline.
 * It provides the interface for the interaction.
 */
export class TimelineWorker {
  private readonly worker: Worker;
  private shutdownResolve: ((value: void) => void) | null;
  private shutdownPromise: Promise<void> | null;
  private updater: ResultReceiver;

  constructor(numBootstrapSamples: number, updater: ResultReceiver) {
    this.worker = new Worker(
      robustSrcPath('backend/timeline/timeline-calc-worker.js'),
      {
        workerData: { numBootstrapSamples }
      }
    );

    this.worker.on('message', (message) => this.processResponse(message));
    this.worker.on('error', (e) => {
      log.error('Error on timeline worker', e);
    });
    this.worker.on('exit', (exitCode) => {
      log.info(`Timeline worker exited with code: ${exitCode}`);
    });

    this.shutdownResolve = null;
    this.shutdownPromise = null;
    this.updater = updater;
  }

  public sendRequest(requests: ComputeRequest): void {
    this.worker.postMessage(requests);
  }

  protected async processResponse(message: any): Promise<void> {
    if (message === 'exiting') {
      this.worker.terminate();
      if (this.shutdownResolve) {
        this.shutdownResolve();
      }
      return;
    }

    const results = <ComputeResults>message;
    this.updater.receiveResults(results);
  }

  public async shutdown(): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = new Promise((resolve) => {
      this.shutdownResolve = resolve;
    });

    this.worker.postMessage('exit');
    return this.shutdownPromise;
  }
}

/**
 * This class is responsible for batching up requests to the timeline worker
 * and managing the promises for the requests.
 */
export class BatchingTimelineUpdater implements ResultReceiver {
  private readonly db: Database;
  private readonly worker: TimelineWorker;
  private readonly requests: Map<string, ComputeJob>;
  private readonly activeRequests: Map<number, ActiveRequest>;

  private nextRequestId: number;
  private pendingPromises: Promise<number>[];

  constructor(db: Database, numBootstrapSamples: number) {
    this.db = db;
    this.nextRequestId = 0;

    this.requests = new Map();
    this.activeRequests = new Map();
    this.pendingPromises = [];

    this.worker = new TimelineWorker(numBootstrapSamples, this);
  }

  public async shutdown(): Promise<void> {
    return this.worker.shutdown();
  }

  public async receiveResults(r: ComputeResults): Promise<void> {
    for (const result of r.results) {
      await this.db.recordTimeline(
        result.runId,
        result.trialId,
        result.criterion,
        result.stats
      );
    }

    const req = this.activeRequests.get(r.requestId);
    if (!req) {
      log.error('Received results for unknown request', r);
      return;
    }

    this.activeRequests.delete(r.requestId);
    req.resolveWithNumberOfJobs(r.results.length);

    completeRequestAndHandlePromise(
      r.requestStart,
      this.db,
      'generate-timeline'
    );
  }

  public addValues(
    runId: number,
    trialId: number,
    criterionId: number,
    values: ValuesPossiblyMissing
  ): void {
    const id = `${trialId}-${runId}-${criterionId}`;
    if (!this.requests.has(id)) {
      const withoutMissing: number[] = <number[]>(
        values.filter((v) => v !== null)
      );
      if (withoutMissing.length === 0) {
        return;
      }

      const req: ComputeJob = {
        runId,
        trialId,
        criterion: criterionId,
        dataForCriterion: withoutMissing
      };

      this.requests.set(id, req);
    } else {
      const withoutMissing = this.requests.get(id)!.dataForCriterion;
      for (const v of values) {
        if (v !== null) {
          withoutMissing.push(v);
        }
      }
    }
  }

  /**
   * Trigger processing of timeline jobs.
   * Typically triggered once all data from the client was recorded.
   */
  public submitUpdateJobs(): Promise<number> {
    const requestStart = startRequest();

    const requests = this.consumeUpdateJobsForBenchmarking();
    return this.processUpdateJobs(requests, requestStart);
  }

  /**
   * This method is only used for benchmarking purposes.
   */
  public consumeUpdateJobsForBenchmarking(): ComputeJob[] {
    const requests = Array.from(this.requests.values());
    this.requests.clear();
    return requests;
  }

  /**
   * This method is only used for benchmarking purposes.
   */
  public async processUpdateJobsForBenchmarking(
    jobs: ComputeJob[],
    requestStart: number
  ): Promise<number> {
    return this.processUpdateJobs(jobs, requestStart);
  }

  /**
   * @returns promise with the number of jobs processed
   */
  private processUpdateJobs(
    jobs: ComputeJob[],
    requestStart: number
  ): Promise<number> {
    if (jobs.length === 0) {
      return Promise.resolve(0);
    }

    const requestId = this.nextRequestId;
    this.nextRequestId += 1;

    const request: ComputeRequest = {
      jobs,
      requestStart,
      requestId
    };

    this.worker.sendRequest(request);

    let resolveWithNumberOfJobs;
    const promise: Promise<number> = new Promise((resolve) => {
      resolveWithNumberOfJobs = resolve;
    });

    assert(
      this.activeRequests.has(requestId) === false,
      'Request id already exists'
    );

    this.activeRequests.set(requestId, {
      request,
      resolveWithNumberOfJobs
    });

    this.pendingPromises.push(promise);

    return promise;
  }

  public async awaitQuiescence(): Promise<number[]> {
    if (this.pendingPromises.length === 0) {
      return [];
    }

    const results: number[] = [];

    while (this.pendingPromises.length > 0) {
      const currentlyPending = this.pendingPromises;
      this.pendingPromises = [];
      const result = await Promise.all(currentlyPending);
      results.push(...result);
    }

    return results;
  }
}
