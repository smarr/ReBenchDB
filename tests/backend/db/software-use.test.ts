import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';

import {
  TestDatabase,
  closeMainDb,
  createAndInitializeDB
} from './db-testing.js';
import { loadSmallPayloadFor } from '../../payload.js';
import type { VersionInfo } from '../../../src/shared/api.js';

const beforeUpdateCommit = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const afterUpdateCommit = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function softwareFor(kernelRelease: string): VersionInfo[] {
  return [
    { name: 'kernel-release', version: kernelRelease },
    { name: 'architecture', version: 'x86_64' },

    // entries without name or version are not recorded
    { name: 'unknown-tool', version: <string>(<unknown>null) },
    { name: <string>(<unknown>null), version: '1.0' }
  ];
}

describe('Software versions of a trial', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('db_software_use', 0, false, false);

    const before = loadSmallPayloadFor(
      beforeUpdateCommit,
      'Before',
      '2025-01-01T10:00'
    );
    before.env.software = softwareFor('6.1.0');
    await db.recordAllData(before);

    // the same data may be sent more than once
    db.clearCache();
    await db.recordAllData(before);

    const after = loadSmallPayloadFor(
      afterUpdateCommit,
      'After',
      '2025-01-02T10:00'
    );
    after.env.software = softwareFor('6.8.0');
    await db.recordAllData(after);
  });

  afterAll(async () => {
    if (db) {
      return db.close();
    }
  });

  it('should record the software with each trial', async () => {
    const result = await db.query({
      text: `SELECT e.name AS exp, s.name, s.version
              FROM Trial t
                JOIN Experiment e          ON e.id = t.expId
                JOIN SoftwareUse su        ON su.trialId = t.id
                JOIN SoftwareVersionInfo s ON s.id = su.softId
              ORDER BY t.startTime, s.name`
    });
    expect(result.rows).toEqual([
      { exp: 'Before', name: 'architecture', version: 'x86_64' },
      { exp: 'Before', name: 'kernel-release', version: '6.1.0' },
      { exp: 'After', name: 'architecture', version: 'x86_64' },
      { exp: 'After', name: 'kernel-release', version: '6.8.0' }
    ]);
  });

  it('should record each software version only once', async () => {
    const result = await db.query({
      text: 'SELECT name, version FROM SoftwareVersionInfo ORDER BY id'
    });
    expect(result.rows).toEqual([
      { name: 'kernel-release', version: '6.1.0' },
      { name: 'architecture', version: 'x86_64' },
      { name: 'kernel-release', version: '6.8.0' }
    ]);
  });
});

afterAll(async () => {
  return closeMainDb();
});
