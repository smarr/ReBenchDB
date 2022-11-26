import { Database } from './db.js';
import { SummaryStatistics } from './stats.js';
import { robustPath } from './util.js';
import { Worker } from 'node:worker_threads';
import { completeRequest, startRequest } from './perf-tracker.js';

export interface ComputeRequest {
  runId: number;
  trialId: number;
  criterion: number;
  dataForCriterion: number[];
}

export interface ComputeResult {
  runId: number;
  trialId: number;
  criterion: number;
  stats: SummaryStatistics;
}

export abstract class AbstractTimelineUpdater {
  public abstract update(
    runId: number,
    trialId: number,
    criterion: number,
    dataForCriterion: number[]
  ): void;
}

export class TimelineUpdater extends AbstractTimelineUpdater {
  protected readonly db: Database;
  protected readonly worker: Worker;

  protected activeRequests: number;

  private shutdownResolve: ((value: void) => void) | null;

  constructor(db: Database, numBootstrapSamples: number) {
    super();
    this.db = db;
    this.activeRequests = 0;
    this.shutdownResolve = null;

    this.worker = new Worker(robustPath('timeline-calc-worker.js'), {
      workerData: { numBootstrapSamples }
    });

    this.worker.on('message', (message) => this.processResponse(message));
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
  }

  public update(
    runId: number,
    trialId: number,
    criterion: number,
    dataForCriterion: number[]
  ): void {
    const req: ComputeRequest = {
      runId,
      trialId,
      criterion,
      dataForCriterion
    };
    this.worker.postMessage(req);
    this.activeRequests += 1;
  }
}

export class BatchingTimelineUpdater extends TimelineUpdater {
  private readonly requests: Map<string, ComputeRequest>;

  private requestsAtStart: number | null;
  private promise: Promise<number> | null;
  private resolve: ((value: number) => void) | null;

  private requestStart: number | null;

  constructor(db: Database, numBootstrapSamples: number) {
    super(db, numBootstrapSamples);

    this.requests = new Map();
    this.resolve = null;
    this.requestsAtStart = null;
    this.promise = null;
    this.requestStart = null;
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

  protected async processResponse(message: any): Promise<void> {
    await super.processResponse(message);

    if (this.activeRequests === 0) {
      if (this.resolve && this.requestsAtStart) {
        this.resolve(this.requestsAtStart);
        completeRequest(<number>this.requestStart, this.db, 'generate-timeline')
          .then((val) => val)
          .catch((e) => e);
      }
    }
  }

  public getUpdateJobs(): ComputeRequest[] {
    const requests = Array.from(this.requests.values());
    this.requests.clear();
    return requests;
  }

  public submitUpdateJobs(): Promise<number> {
    this.requestStart = startRequest();

    const requests = this.getUpdateJobs();

    return this.processUpdateJobs(requests);
  }

  public processUpdateJobs(jobs: ComputeRequest[]): Promise<number> {
    this.activeRequests = jobs.length;
    this.requestsAtStart = jobs.length;

    for (const r of jobs) {
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
