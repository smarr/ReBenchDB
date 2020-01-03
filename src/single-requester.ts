/**
 * At any given time, there should be only a single instance of the request
 * be running via this class.
 *
 * Triggering new runs are postponed until after the current run is completed.
 * It will only be triggered once after it is postponed this way.
 * Though, if the postponed run is active, it may be triggered again.
 */
export class SingleRequestOnly {
  private readonly request: () => Promise<any>;
  private requestInProgress: boolean;
  private rerunRequested: boolean;

  private quiescencePromise?: Promise<any>;
  private resolve?: () => void;
  private reject?: () => void;

  constructor(request: () => Promise<any>) {
    this.request = request;
    this.requestInProgress = false;
    this.rerunRequested = false;

    this.initializePromise();
  }

  private initializePromise() {
    this.quiescencePromise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  public trigger() {
    if (this.requestInProgress) {
      this.rerunRequested = true;
      return;
    }

    if (!this.quiescencePromise) {
      this.initializePromise();
    }
    this.perform();
  }

  private afterRequest(failed: boolean) {
    if (this.rerunRequested) {
      setTimeout(async () => {
        this.rerunRequested = false;
        this.prepareAfterRequest(this.request());
      }, 0);
    } else {
      this.quiescencePromise = undefined;
      if (this.resolve && this.reject) {
        if (failed) {
          this.reject();
        } else {
          this.resolve();
        }
      }
      this.resolve = undefined;
      this.reject = undefined;
      this.requestInProgress = false;
    }
  }

  private prepareAfterRequest(promise) {
    promise
      .then(() => {
        this.afterRequest(false);
      })
      .catch(() => {
        this.afterRequest(true);
      });
  }

  private perform() {
    this.requestInProgress = true;
    this.prepareAfterRequest(this.request());
  }

  public async awaitQuiescence() {
    await this.quiescencePromise;
  }
}
