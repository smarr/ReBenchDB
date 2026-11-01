import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from '../db/db-testing.js';
import { loadSmallPayload, loadSmallPayloadFor } from '../../payload.js';
import type { BenchmarkData } from '../../../src/shared/api.js';

const baseBranch = 'main';
const featureBranch = 'feature';

const baseCommit = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const mergedCommit = 'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm';
const otherCommit = 'oooooooooooooooooooooooooooooooooooooooo';

function payloadFor(
  commitId: string,
  branch: string,
  experimentName: string,
  startTime: string
): BenchmarkData {
  const data = loadSmallPayloadFor(commitId, experimentName, startTime);
  data.source.branchOrTag = branch;
  return data;
}

/**
 * Commits can be benchmarked on multiple branches.
 *
 * Trials on the base branch need to be recognized as such,
 * and not be reported for the branch the commit was first recorded with.
 */
describe('Commit benchmarked on multiple branches', () => {
  let db: TestDatabase;
  let projectName: string;

  beforeAll(async () => {
    db = await createAndInitializeDB('db_source_branches', 25, true, false);

    const base = payloadFor(baseCommit, baseBranch, 'Base', '2025-01-01T10:00');
    projectName = base.projectName;

    for (const data of [
      base,
      payloadFor(mergedCommit, featureBranch, 'PR', '2025-01-02T10:00'),
      payloadFor(mergedCommit, baseBranch, 'Merged', '2025-01-03T10:00')
    ]) {
      await db.recordAllData(data);
    }
    await db.setProjectBaseBranch(projectName, baseBranch);
    await db.awaitQuiescentTimelineUpdater();
  }, 30_000); // the timeline calculation can be slow with all suites running

  afterAll(async () => {
    if (db) {
      return db.close();
    }
  });

  it('should record a source per branch', async () => {
    const result = await db.query({
      text: `SELECT branchOrTag FROM Source
              WHERE commitId = $1 ORDER BY branchOrTag`,
      values: [mergedCommit]
    });
    expect(result.rows.map((r) => r.branchortag)).toEqual([
      featureBranch,
      baseBranch
    ]);
  });

  it('should use the merged commit as baseline', async () => {
    const baseline = await db.getBaselineCommit(projectName, otherCommit);
    expect(baseline?.commitid).toEqual(mergedCommit);
    expect(baseline?.branchortag).toEqual(baseBranch);
  });

  it('should include the merged commit in the base timeline', async () => {
    const run = await db.query({ text: 'SELECT id FROM Run LIMIT 1' });
    const project = await db.getProjectByName(projectName);

    const timeline = await db.getTimelineForRun(project!.id, run.rows[0].id);
    expect(timeline?.data[0]).toHaveLength(2);
  });

  it('should prefer the base branch for the baseline', async () => {
    const result = await db.getBranchNames(
      projectName,
      mergedCommit,
      mergedCommit
    );
    expect(result).toEqual({
      baseBranchName: baseBranch,
      changeBranchName: baseBranch
    });
  });

  it('should prefer a branch other than the base for the change', async () => {
    const result = await db.getBranchNames(
      projectName,
      baseCommit,
      mergedCommit
    );
    expect(result).toEqual({
      baseBranchName: baseBranch,
      changeBranchName: featureBranch
    });
  });

  it('should report the same branches for the revisions', async () => {
    const project = await db.getProjectByName(projectName);

    const sameCommit = await db.revisionsExistInProject(
      project!.slug,
      mergedCommit,
      mergedCommit
    );
    expect(sameCommit.base?.branchortag).toEqual(baseBranch);
    expect(sameCommit.change?.branchortag).toEqual(baseBranch);

    const change = await db.revisionsExistInProject(
      project!.slug,
      baseCommit,
      mergedCommit
    );
    expect(change.base?.branchortag).toEqual(baseBranch);
    expect(change.change?.branchortag).toEqual(featureBranch);
  });
});

/**
 * ReBench does not report a branch or repository when it is not run in
 * a git repository. Such sources must still be recorded only once.
 */
describe('Source without branch and repository', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('db_source_null_branch', 0, false, false);
  });

  afterAll(async () => {
    if (db) {
      return db.close();
    }
  });

  it('should record the source only once', async () => {
    const source = loadSmallPayload().source;
    (<any>source).branchOrTag = null;
    (<any>source).repoURL = null;

    const first = await db.recordSource(source);
    db.clearCache();
    const second = await db.recordSource(source);

    expect(second.id).toEqual(first.id);
    const result = await db.query({ text: 'SELECT * FROM Source' });
    expect(result.rowCount).toEqual(1);
  });
});

afterAll(async () => {
  return closeMainDb();
});
