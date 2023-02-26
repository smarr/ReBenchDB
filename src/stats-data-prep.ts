import { Measurements } from './db.js';

export function compareStringOrNull(
  a: string | null,
  b: string | null
): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  return a.localeCompare(b);
}

/**
 * Comparator function to sort measurements so that we can calculate
 * change statistics doing a single pass over the measurements array
 * by pairing up measurements so that always the first the baseline
 * and then the change comes in the list.
 */
export function compareToSortForSinglePassChangeStats(
  a: Measurements,
  b: Measurements
): number {
  const r = compareToSortForSinglePassChangeStatsWithoutCommitId(a, b);
  if (r !== 0) {
    return r;
  }

  return a.commitId.localeCompare(b.commitId);
}

export function compareToSortForSinglePassChangeStatsWithoutCommitId(
  a: Measurements,
  b: Measurements
): number {
  let r = a.envId - b.envId;
  if (r !== 0) {
    return r;
  }

  r = compareStringOrNull(a.runSettings.varValue, b.runSettings.varValue);
  if (r !== 0) {
    return r;
  }

  r = compareStringOrNull(a.runSettings.cores, b.runSettings.cores);
  if (r !== 0) {
    return r;
  }

  r = compareStringOrNull(a.runSettings.inputSize, b.runSettings.inputSize);
  if (r !== 0) {
    return r;
  }

  r = compareStringOrNull(a.runSettings.extraArgs, b.runSettings.extraArgs);
  if (r !== 0) {
    return r;
  }

  return a.criterion.name.localeCompare(b.criterion.name);
}

  }

  return a.commitId.localeCompare(b.commitId);

export function dropMeasurementsWhereBaseOrChangeIsMissing(
  measurements: Measurements[]
): Measurements[] | undefined {
  const dropped: Measurements[] = [];

  function drop(i: number) {
    dropped.push(measurements[i]);
    measurements.splice(i, 1);
  }

  let i = 0;
  while (i < measurements.length) {
    if (i + 1 >= measurements.length) {
      drop(i);
      return dropped;
    }

    const base = measurements[i];
    const change = measurements[i + 1];
    if (
      compareToSortForSinglePassChangeStatsWithoutCommitId(base, change) !== 0
    ) {
      drop(i);
    } else {
      i += 2;
    }
  }

  if (dropped.length === 0) {
    return undefined;
  }
  return dropped;
}

}
