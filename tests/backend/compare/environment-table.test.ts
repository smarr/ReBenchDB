import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from '../db/db-testing.js';
import { loadSmallPayload, loadSmallPayloadFor } from '../../payload.js';
import { getCompareViewData } from '../../../src/backend/compare/report.js';
import type { BenchmarkData } from '../../../src/shared/api.js';
import type { CompareViewWithData } from '../../../src/shared/view-types.js';

const projectSlug = 'Small-Example-Project';

const oldOs = 'Linux';
const newOs = 'FreeBSD';
const oldCpu = 'Old CPU @ 2.00GHz';
const newCpu = 'New CPU @ 3.00GHz';
const oldMemory = 16 * 1024 * 1024 * 1024;
const newMemory = 32 * 1024 * 1024 * 1024;
const oldClockSpeed = 2_000_000_000;
const newClockSpeed = 3_000_000_000;

const beforeUpgradeCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const afterUpgradeCommit = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const afterOsChangeCommit = 'cccccccccccccccccccccccccccccccccccccccc';

function payloadFor(
  commitId: string,
  experimentName: string,
  startTime: string,
  cpu: string,
  memory: number,
  clockSpeed = oldClockSpeed,
  osType = oldOs
): BenchmarkData {
  const data = loadSmallPayloadFor(commitId, experimentName, startTime);
  data.env.osType = osType;
  data.env.cpu = cpu;
  data.env.memory = memory;
  data.env.clockSpeed = clockSpeed;
  return data;
}

async function compare(
  db: TestDatabase,
  base: string,
  change: string
): Promise<CompareViewWithData> {
  const view = await getCompareViewData(base, change, projectSlug, db);
  expect(view.revisionFound).toBe(true);
  return <CompareViewWithData>view;
}

/**
 * An environment can change over time.
 *
 * The trials need to keep the environment they were executed in,
 * and must not be reported with the details of the first environment
 * that was recorded for the hostname.
 * A change of CPU or OS means results are not comparable.
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
    await db.recordAllData(
      payloadFor(
        afterOsChangeCommit,
        'After OS Change',
        '2025-01-03T10:00',
        newCpu,
        newMemory,
        oldClockSpeed,
        newOs
      )
    );
  });

  afterAll(async () => {
    if (db) {
      return db.close();
    }
  });

  it('should record an environment per OS and CPU', async () => {
    const result = await db.query({
      text: 'SELECT osType, cpu FROM Environment ORDER BY id'
    });
    expect(result.rows).toEqual([
      { ostype: oldOs, cpu: oldCpu },
      { ostype: oldOs, cpu: newCpu },
      { ostype: newOs, cpu: newCpu }
    ]);
  });

  it('should keep the environment of each trial', async () => {
    const result = await db.query({
      text: `SELECT e.name, env.osType, env.cpu
              FROM Trial t
                JOIN Experiment e    ON e.id = t.expId
                JOIN Environment env ON env.id = t.envId
              ORDER BY t.startTime`
    });
    expect(result.rows).toEqual([
      { name: 'Before', ostype: oldOs, cpu: oldCpu },
      { name: 'After', ostype: oldOs, cpu: newCpu },
      { name: 'After OS Change', ostype: newOs, cpu: newCpu }
    ]);
  });

  it('should report both environments for a comparison', async () => {
    const view = await compare(db, beforeUpgradeCommit, afterUpgradeCommit);
    const envs = view.stats.environments;
    expect(envs.map((e) => e.cpu).sort()).toEqual([newCpu, oldCpu]);
  });

  it('should report only the identity of each environment', async () => {
    const view = await compare(db, beforeUpgradeCommit, afterUpgradeCommit);
    for (const e of view.stats.environments) {
      expect(Object.keys(e).sort()).toEqual([
        'cpu',
        'hostname',
        'id',
        'note',
        'ostype'
      ]);
    }
  });

  it('should not compare results across a CPU change', async () => {
    const view = await compare(db, beforeUpgradeCommit, afterUpgradeCommit);
    expect(view.stats.acrossVersions.missing.length).toBeGreaterThan(0);
  });

  it('should not compare results across an OS change', async () => {
    const view = await compare(db, afterUpgradeCommit, afterOsChangeCommit);
    expect(view.stats.acrossVersions.missing.length).toBeGreaterThan(0);
  });
});

describe('Memory and clock speed are instable measurements', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('db_environment_drift', 0, false, false);

    await db.recordAllData(
      payloadFor(
        beforeUpgradeCommit,
        'Before',
        '2025-01-01T10:00',
        oldCpu,
        oldMemory,
        oldClockSpeed
      )
    );
    await db.recordAllData(
      payloadFor(
        afterUpgradeCommit,
        'After',
        '2025-01-02T10:00',
        oldCpu,
        newMemory,
        newClockSpeed
      )
    );
  });

  afterAll(async () => {
    if (db) {
      return db.close();
    }
  });

  it('should record a single environment', async () => {
    const result = await db.query({ text: 'SELECT cpu FROM Environment' });
    expect(result.rows).toEqual([{ cpu: oldCpu }]);
  });

  it('should record memory and clock speed with each trial', async () => {
    const result = await db.query({
      text: `SELECT e.name, t.memory, t.clockSpeed
              FROM Trial t
                JOIN Experiment e ON e.id = t.expId
              ORDER BY t.startTime`
    });
    expect(result.rows).toEqual([
      {
        name: 'Before',
        memory: String(oldMemory),
        clockspeed: String(oldClockSpeed)
      },
      {
        name: 'After',
        memory: String(newMemory),
        clockspeed: String(newClockSpeed)
      }
    ]);
  });

  it('should compare the results of both trials', async () => {
    const view = await compare(db, beforeUpgradeCommit, afterUpgradeCommit);
    expect(view.stats.acrossVersions.missing).toEqual([]);
    expect(view.stats.environments.map((e) => e.cpu)).toEqual([oldCpu]);
  });

  it('should summarize the differences of the environment', async () => {
    const view = await compare(db, beforeUpgradeCommit, afterUpgradeCommit);
    const table = view.environmentTable;
    expect(table.columns).toHaveLength(1);

    const env = table.columns[0];
    expect(env.cpu).toEqual(oldCpu);
    expect(env.split).toBe(true);
    expect(table.groups[0]).toEqual({
      name: 'Hardware',
      rows: [
        {
          name: 'Memory',
          values: [{ base: ['16.00GB'], change: ['32.00GB'], differs: true }]
        },
        {
          name: 'Clock Speed',
          values: [{ base: ['2.00GHz'], change: ['3.00GHz'], differs: true }]
        }
      ]
    });
  });
});

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
