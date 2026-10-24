import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from '../db/db-testing.js';
import { loadSmallPayload } from '../../payload.js';
import type { BenchmarkData } from '../../../src/shared/api.js';
import type { Project } from '../../../src/backend/db/types.js';

const projectSlug = 'Small-Example-Project';

const oldCpu = 'Old CPU @ 2.00GHz';
const newCpu = 'New CPU @ 3.00GHz';
const oldMemory = 16 * 1024 * 1024 * 1024;
const newMemory = 32 * 1024 * 1024 * 1024;

const beforeUpgradeCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const afterUpgradeCommit = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function payloadFor(
  commitId: string,
  experimentName: string,
  startTime: string,
  cpu: string,
  memory: number
): BenchmarkData {
  const data = loadSmallPayload();
  data.source.commitId = commitId;
  data.experimentName = experimentName;
  data.startTime = startTime;
  data.env.cpu = cpu;
  data.env.memory = memory;
  return data;
}

/**
 * An environment can change over time.
 *
 * The trials need to keep the environment they were executed in,
 * and must not be reported with the details of the first environment
 * that was recorded for the hostname.
 */
describe('Machine changed without changing its hostname', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('db_environment_changes', 0, false);

    await db.recordAllData(
      payloadFor(
        beforeUpgradeCommit,
        'Before',
        '2025-01-01T10:00',
        oldCpu,
        oldMemory
      )
    );
    await db.recordAllData(
      payloadFor(
        afterUpgradeCommit,
        'After',
        '2025-01-02T10:00',
        newCpu,
        newMemory
      )
    );
  });

  afterAll(async () => {
    if (db) {
      return db.close();
    }
  });

  it('should record an environment per machine configuration', async () => {
    const result = await db.query({
      text: 'SELECT cpu, memory FROM Environment ORDER BY memory'
    });
    expect(result.rows).toEqual([
      { cpu: oldCpu, memory: String(oldMemory) },
      { cpu: newCpu, memory: String(newMemory) }
    ]);
  });

  it('should keep the environment of each trial', async () => {
    const result = await db.query({
      text: `SELECT e.name, env.cpu
              FROM Trial t
                JOIN Experiment e    ON e.id = t.expId
                JOIN Environment env ON env.id = t.envId
              ORDER BY t.startTime`
    });
    expect(result.rows).toEqual([
      { name: 'Before', cpu: oldCpu },
      { name: 'After', cpu: newCpu }
    ]);
  });

  it('should report both environments for a comparison', async () => {
    const project = <Project>await db.getProjectBySlug(projectSlug);
    const envs = await db.getEnvironmentsForComparison(
      project.id,
      beforeUpgradeCommit,
      afterUpgradeCommit
    );
    expect(envs.map((e) => e.cpu).sort()).toEqual([newCpu, oldCpu]);
  });
});

/**
 * ReBench does not report the CPU and clock speed when it cannot
 * determine them. Such environments must still be recorded only once.
 */
describe('Environment without CPU details', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('db_environment_no_cpu', 0, false, false);
  });

  afterAll(async () => {
    if (db) {
      return db.close();
    }
  });

  it('should record the environment only once', async () => {
    const env = loadSmallPayload().env;
    delete (<any>env).cpu;
    delete (<any>env).clockSpeed;

    const first = await db.recordEnvironment(env);
    db.clearCache();
    const second = await db.recordEnvironment(env);

    expect(second.id).toEqual(first.id);
    const result = await db.query({ text: 'SELECT * FROM Environment' });
    expect(result.rowCount).toEqual(1);
  });
});

afterAll(async () => {
  return closeMainDb();
});
