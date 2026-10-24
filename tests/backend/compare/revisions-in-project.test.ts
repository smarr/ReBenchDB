import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from '../db/db-testing.js';
import { loadSmallPayload } from '../../payload.js';
import { getCompareViewData } from '../../../src/backend/compare/report.js';
import type { BenchmarkData } from '../../../src/shared/api.js';
import type { Project } from '../../../src/backend/db/types.js';

const projectName = 'Small Example Project';
const projectSlug = 'Small-Example-Project';
const otherProjectName = 'Other Project';

const baseCommit = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const changeCommit = 'cccccccccccccccccccccccccccccccccccccccc';
const otherProjectCommit = 'dddddddddddddddddddddddddddddddddddddddd';

function payloadFor(
  project: string,
  commitId: string,
  experimentName: string,
  startTime: string
): BenchmarkData {
  const data = loadSmallPayload();
  data.projectName = project;
  data.source.commitId = commitId;
  data.experimentName = experimentName;
  data.startTime = startTime;
  return data;
}

/**
 * The revisions to be compared need to be looked up in the requested project.
 *
 * Here, the change commit was also benchmarked in another project,
 * which also has a commit that the requested project does not have.
 * The base commit was benchmarked in two experiments.
 */
describe('Looking up the revisions of a project', () => {
  let db: TestDatabase;
  let project: Project;

  beforeAll(async () => {
    db = await createAndInitializeDB('compare_revisions_in_project', 0, false);

    for (const data of [
      payloadFor(projectName, baseCommit, 'Base', '2025-01-01T10:00'),
      payloadFor(projectName, baseCommit, 'Base 2', '2025-01-02T10:00'),
      payloadFor(projectName, changeCommit, 'Change', '2025-01-03T10:00'),
      payloadFor(otherProjectName, changeCommit, 'Change', '2025-01-04T10:00'),
      payloadFor(otherProjectName, otherProjectCommit, 'O', '2025-01-05T10:00')
    ]) {
      await db.recordAllData(data);
    }

    project = <Project>await db.getProjectBySlug(projectSlug);
  });

  afterAll(async () => {
    if (db) {
      return db.close();
    }
  });

  it('should find both revisions in the requested project', async () => {
    const result = await db.revisionsExistInProject(
      projectSlug,
      baseCommit,
      changeCommit
    );

    expect(result.dataFound).toBe(true);
    expect(result.base?.projectid).toEqual(project.id);
    expect(result.change?.projectid).toEqual(project.id);
  });

  it('should not compare to a revision of another project', async () => {
    const view = await getCompareViewData(
      baseCommit,
      otherProjectCommit,
      projectSlug,
      db
    );
    expect(view.revisionFound).toBe(false);
  });
});

afterAll(async () => {
  return closeMainDb();
});
