import { BenchmarkId } from '../../shared/api.js';
import { AvailableProfile } from './types.js';

function sameBenchId(a: BenchmarkId, b: BenchmarkId): boolean {
  // using here == instead of === is intentional
  // otherwise we don't equate null and undefined
  return (
    a.b == b.b &&
    a.e == b.e &&
    a.s == b.s &&
    a.v == b.v &&
    a.c == b.c &&
    a.i == b.i &&
    a.ea == b.ea
  );
}

export class HasProfile {
  /**
   * This is expected to be sorted by expid, runid, trialid
   * as coming from the database.
   */
  private readonly availableProfiles: AvailableProfile[];

  constructor(availableProfiles: AvailableProfile[]) {
    this.availableProfiles = availableProfiles;
  }

  public get(
    benchId: BenchmarkId
  ): [AvailableProfile, AvailableProfile?] | false {
    const idx = this.availableProfiles.findIndex((id) =>
      sameBenchId(id, benchId)
    );
    if (idx >= 0) {
      if (
        idx === this.availableProfiles.length - 1 ||
        !sameBenchId(this.availableProfiles[idx + 1], benchId)
      ) {
        return [this.availableProfiles[idx]];
      }

      return [this.availableProfiles[idx], this.availableProfiles[idx + 1]];
    }
    return false;
  }
}
