import { Database } from './backend/db/db.js';
import { SummaryStatistics } from './stats.js';
import { robustSrcPath } from './util.js';
import { Worker } from 'node:worker_threads';
import { completeRequest, startRequest } from './perf-tracker.js';
import { log } from './backend/logging.js';

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

export class BatchingTimelineUpdater {
  private readonly db: Database;
  private readonly worker: Worker;
  private readonly requests: Map<string, ComputeRequest>;

  private activeRequests: number;

  private requestsAtStart: number;
  private promise: Promise<number> | null;
  private resolve: ((value: number) => void) | null;

  private shutdownResolve: ((value: void) => void) | null;

  constructor(db: Database, numBootstrapSamples: number) {
    this.db = db;
    this.activeRequests = 0;
    this.shutdownResolve = null;

    this.requests = new Map();
    this.resolve = null;
    this.requestsAtStart = 0;
    this.promise = null;

    this.worker = new Worker(robustSrcPath('timeline-calc-worker.js'), {
      workerData: { numBootstrapSamples }
    });

    this.worker.on('message', (message) => this.processResponse(message));
    this.worker.on('error', (e) => {
      log.error('Error on timeline worker', e);
    });
    this.worker.on('exit', (exitCode) => {
      log.info(`Timeline worker exited with code: ${exitCode}`);
    });
  }

  public shutdown(): Promise<void> {
    const promise: Promise<void> = new Promise((resolve) => {
      this.shutdownResolve = resolve;
    });
    this.worker.postMessage('exit');
    return promise;
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
    await this.db.recordTimeline(
      result.runId,
      result.trialId,
      result.criterion,
      result.stats
    );

    this.activeRequests -= 1;

    if (this.activeRequests === 0) {
      if (this.resolve && message.requestStart) {
        this.resolve(this.requestsAtStart);
        this.resolve = null;
        completeRequest(
          <number>message.requestStart,
          this.db,
          'generate-timeline'
        )
          .then((val) => val)
          .catch((e) => e);
      }
    }
  }

  public addValue(
    runId: number,
    trialId: number,
    criterionId: number,
    value: number
  ): void {
    const id = `${trialId}-${runId}-${criterionId}`;
    if (!this.requests.has(id)) {
      const req: ComputeRequest = {
        runId,
        trialId,
        criterion: criterionId,
        dataForCriterion: [value]
      };

      this.requests.set(id, req);
    } else {
      this.requests.get(id)?.dataForCriterion.push(value);
    }
  }

  public getUpdateJobs(): ComputeRequest[] {
    const requests = Array.from(this.requests.values());
    this.requests.clear();
    return requests;
  }

  public submitUpdateJobs(): Promise<number> {
    const requestStart = startRequest();

    const requests = this.getUpdateJobs();
    return this.processUpdateJobs(requests, requestStart);
  }

  public processUpdateJobs(
    jobs: ComputeRequest[],
    requestStart: number
  ): Promise<number> {
    this.activeRequests += jobs.length;
    this.requestsAtStart = this.activeRequests;

    for (const r of jobs) {
      r.requestStart = requestStart;
      this.worker.postMessage(r);
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
