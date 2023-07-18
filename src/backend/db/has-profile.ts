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
   * This is expected to be sorted by runid, commitid
   * as coming from the database.
   * This ensures that base and change profile availability is paired up.
   */
  private readonly availableProfiles: AvailableProfile[];

  constructor(availableProfiles: AvailableProfile[]) {
    this.availableProfiles = availableProfiles;
  }

  public has(benchId: BenchmarkId): boolean {
    const idx = this.availableProfiles.findIndex((id) =>
      sameBenchId(id, benchId)
    );
    return idx >= 0;
  }
}
