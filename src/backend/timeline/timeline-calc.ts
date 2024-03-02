import { Database } from '../db/db.js';
import type { SummaryStatistics } from '../../shared/stats.js';
import { robustSrcPath } from '../util.js';
import { Worker } from 'node:worker_threads';
import {
  completeRequestAndHandlePromise,
  startRequest
} from '../perf-tracker.js';
import { log } from '../logging.js';
import type { ValuesPossiblyMissing } from '../../shared/api.js';

export interface ComputeRequest {
  runId: number;
  trialId: number;
  criterion: number;
  dataForCriterion: number[];
  requestStart?: number;
}

export interface ComputeResult {
  runId: number;
  trialId: number;
  criterion: number;
  stats: SummaryStatistics;
  requestStart: number;
}

export interface ResultReceiver {
  receiveResult(result: ComputeResult): Promise<void>;
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

  public sendRequest(request: ComputeRequest): void {
    this.worker.postMessage(request);
  }

  protected async processResponse(message: any): Promise<void> {
    if (message === 'exiting') {
      this.worker.terminate();
      if (this.shutdownResolve) {
        this.shutdownResolve();
      }
      return;
    }

    const result = <ComputeResult>message;
    this.updater.receiveResult(result);
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
  private readonly requests: Map<string, ComputeRequest>;

  private activeRequests: number;

  private requestsAtStart: number;
  private promise: Promise<number> | null;
  private resolve: ((value: number) => void) | null;

  constructor(db: Database, numBootstrapSamples: number) {
    this.db = db;
    this.activeRequests = 0;

    this.requests = new Map();
    this.resolve = null;
    this.requestsAtStart = 0;
    this.promise = null;

    this.worker = new TimelineWorker(numBootstrapSamples, this);
  }

  public async shutdown(): Promise<void> {
    return this.worker.shutdown();
  }

  public async receiveResult(result: ComputeResult): Promise<void> {
    await this.db.recordTimeline(
      result.runId,
      result.trialId,
      result.criterion,
      result.stats
    );

    this.activeRequests -= 1;

    if (this.activeRequests === 0) {
      if (this.resolve && result.requestStart) {
        this.resolve(this.requestsAtStart);
        this.resolve = null;
        completeRequestAndHandlePromise(
          result.requestStart,
          this.db,
          'generate-timeline'
        );
      }
    }
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

      const req: ComputeRequest = {
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

    const requests = this.getUpdateJobsForBenchmarking();
    return this.processUpdateJobs(requests, requestStart);
  }

  /**
   * This method is only used for benchmarking purposes.
   */
  public getUpdateJobsForBenchmarking(): ComputeRequest[] {
    const requests = Array.from(this.requests.values());
    this.requests.clear();
    return requests;
  }

  /**
   * This method is only used for benchmarking purposes.
   */
  public async processUpdateJobsForBenchmarking(
    jobs: ComputeRequest[],
    requestStart: number
  ): Promise<number> {
    return this.processUpdateJobs(jobs, requestStart);
  }

  private processUpdateJobs(
    jobs: ComputeRequest[],
    requestStart: number
  ): Promise<number> {
    this.activeRequests += jobs.length;
    this.requestsAtStart = this.activeRequests;

    for (const r of jobs) {
      r.requestStart = requestStart;
      this.worker.sendRequest(r);
    }

    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });

    if (this.activeRequests === 0 && this.resolve) {
      this.resolve(0);
    }
    return this.promise;
  }

  public getQuiescencePromise(): Promise<number> | null {
    return this.promise;
  }
}
