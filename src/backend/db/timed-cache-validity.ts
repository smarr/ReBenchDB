export class TimedCacheValidity {
  private valid: boolean;
  private scheduledInvalidation: boolean;

  /** Delay in milliseconds. */
  private readonly invalidationDelay: number;

  constructor(invalidationDelay: number) {
    this.invalidationDelay = invalidationDelay;
    this.valid = true;
    this.scheduledInvalidation = false;
  }

  public invalidateAndNew(): TimedCacheValidity {
    if (!this.scheduledInvalidation) {
      this.scheduledInvalidation = true;
      if (this.invalidationDelay === 0) {
        this.valid = false;
      } else {
        setTimeout(() => {
          this.valid = false;
        }, this.invalidationDelay);
      }
    }

    if (this.valid) {
      return this;
    }
    return new TimedCacheValidity(this.invalidationDelay);
  }

  public isValid(): boolean {
    return this.valid;
  }
}
