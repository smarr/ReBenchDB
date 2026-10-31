import { describe, expect, beforeAll, afterAll, it } from '@jest/globals';
import { readdirSync, readFileSync } from 'node:fs';

import {
  expectedSchemaVersion,
  loadScheme,
  parseSchemaVersion
} from '../../../src/backend/db/db.js';
import { robustPath } from '../../../src/backend/util.js';
import { TestDatabase, createAndInitializeDB, createDB } from './db-testing.js';

const migrationFolder = robustPath('backend/db/schema-updates');

function getMigrations(): { version: number; sql: string }[] {
  return readdirSync(migrationFolder)
    .map((f) => /^migration\.(\d+)\.sql$/.exec(f))
    .filter((m) => m !== null)
    .map((m) => ({
      version: parseInt(m[1]),
      sql: readFileSync(`${migrationFolder}/${m[0]}`, 'utf-8')
    }))
    .sort((a, b) => a.version - b.version);
}

/** The first migration that introduced the SchemaVersion table. */
const firstVersionedMigration = 19;

describe('Schema version in SQL files', () => {
  it('should parse the version from db.sql', () => {
    expect(parseSchemaVersion(loadScheme())).toEqual(expectedSchemaVersion);
    expect(expectedSchemaVersion).toBeGreaterThanOrEqual(
      firstVersionedMigration
    );
  });

  it('should match the number of the latest migration', () => {
    const migrations = getMigrations();
    const latest = migrations[migrations.length - 1];
    expect(expectedSchemaVersion).toEqual(latest.version);
  });

  it('should be set by each migration to its own number', () => {
    const versioned = getMigrations().filter(
      (m) => m.version >= firstVersionedMigration
    );
    expect(versioned.length).toBeGreaterThan(0);
    for (const m of versioned) {
      expect(parseSchemaVersion(m.sql)).toEqual(m.version);
    }
  });

  it('should parse both the INSERT and the UPDATE form', () => {
    expect(
      parseSchemaVersion('INSERT INTO SchemaVersion (version) VALUES (42);')
    ).toEqual(42);
    expect(
      parseSchemaVersion('UPDATE SchemaVersion SET version = 43;')
    ).toEqual(43);
    expect(parseSchemaVersion('SELECT 1;')).toBeNull();
  });
});

describe('Schema version in the database', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('schema_version', 0, false, false);
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it('should report the expected version for a fresh database', async () => {
    expect(await db.getSchemaVersion()).toEqual(expectedSchemaVersion);
    expect(await db.checkSchemaVersion()).toEqual({
      ok: true,
      actual: expectedSchemaVersion,
      expected: expectedSchemaVersion
    });
  });

  it('should reject a database with a different version', async () => {
    await db.query({
      text: 'UPDATE SchemaVersion SET version = $1',
      values: [expectedSchemaVersion - 1]
    });
    expect(await db.checkSchemaVersion()).toEqual({
      ok: false,
      actual: expectedSchemaVersion - 1,
      expected: expectedSchemaVersion
    });
    await db.query({
      text: 'UPDATE SchemaVersion SET version = $1',
      values: [expectedSchemaVersion]
    });
  });
});

describe('Schema version in a database without version table', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createDB('schema_version_none', 0, false, false);
    await db.connectClient();
    await db.query({ text: 'CREATE TABLE Run (id serial primary key)' });
  });

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it('should report no version', async () => {
    expect(await db.getSchemaVersion()).toBeNull();
  });

  it('should reject the database', async () => {
    expect(await db.checkSchemaVersion()).toEqual({
      ok: false,
      actual: null,
      expected: expectedSchemaVersion
    });
  });
});
