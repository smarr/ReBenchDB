import {
  describe,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  it
} from '@jest/globals';

import {
  TestDatabase,
  createAndInitializeDB,
  closeMainDb
} from './db-testing.js';

import {
  createUser,
  getUserByUsername,
  getUserByEmail
} from '../../../src/backend/auth/auth-db.js';

describe('appuser table operations', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('auth_db');
  });

  afterAll(async () => {
    return db.close();
  });

  afterEach(async () => {
    return db.rollback();
  });

  it('should create a user and return all fields', async () => {
    const user = await createUser(db, 'alice', 'alice@example.com', 'hash_abc');

    expect(user.username).toEqual('alice');
    expect(user.email).toEqual('alice@example.com');
    expect(user.password_hash).toEqual('hash_abc');
    expect(user.id).toBeGreaterThan(0);
    expect(user.is_active).toEqual(true);
    expect(user.created_at).toBeInstanceOf(Date);
  });

  it('should return null when looking up a non-existent username', async () => {
    const user = await getUserByUsername(db, 'nobody');
    expect(user).toBeNull();
  });

  it('should return null when looking up a non-existent email', async () => {
    const user = await getUserByEmail(db, 'nobody@example.com');
    expect(user).toBeNull();
  });

  it('should retrieve a user by username after creation', async () => {
    await createUser(db, 'bob', 'bob@example.com', 'hash_bob');

    const user = await getUserByUsername(db, 'bob');

    expect(user).not.toBeNull();
    expect(user!.username).toEqual('bob');
    expect(user!.email).toEqual('bob@example.com');
    expect(user!.password_hash).toEqual('hash_bob');
  });

  it('should retrieve a user by email after creation', async () => {
    await createUser(db, 'carol', 'carol@example.com', 'hash_carol');

    const user = await getUserByEmail(db, 'carol@example.com');

    expect(user).not.toBeNull();
    expect(user!.username).toEqual('carol');
    expect(user!.email).toEqual('carol@example.com');
  });

  it('should reject a duplicate username', async () => {
    await createUser(db, 'dave', 'dave@example.com', 'hash_dave');

    await expect(
      createUser(db, 'dave', 'other@example.com', 'hash_other')
    ).rejects.toThrow();
  });

  it('should reject a duplicate email', async () => {
    await createUser(db, 'eve', 'shared@example.com', 'hash_eve');

    await expect(
      createUser(db, 'other', 'shared@example.com', 'hash_other')
    ).rejects.toThrow();
  });
});

describe('ProjectMembership table operations', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('auth_membership');
  });

  afterAll(async () => {
    return db.close();
  });

  afterEach(async () => {
    return db.rollback();
  });

  async function createTestProject(db: TestDatabase, name: string): Promise<number> {
    const result = await db.query<{ id: number }>({
      text: `INSERT INTO Project (name, slug) VALUES ($1, $2) RETURNING id`,
      values: [name, name.toLowerCase().replace(/\s+/g, '-')]
    });
    return result.rows[0].id;
  }

  it('should create a project membership with view role', async () => {
    const user = await createUser(db, 'frank', 'frank@example.com', 'hash_frank');
    const projectId = await createTestProject(db, 'Test Project');

    await db.query({
      text: `INSERT INTO ProjectMembership (userId, projectId, role)
             VALUES ($1, $2, 'view')`,
      values: [user.id, projectId]
    });

    const result = await db.query({
      text: `SELECT * FROM ProjectMembership WHERE userId = $1`,
      values: [user.id]
    });

    expect(result.rowCount).toEqual(1);
    expect(result.rows[0].role).toEqual('view');
    expect(result.rows[0].userid).toEqual(user.id);
    expect(result.rows[0].projectid).toEqual(projectId);
  });

  it('should enforce the (userId, projectId) primary key constraint', async () => {
    const user = await createUser(db, 'grace', 'grace@example.com', 'hash_grace');
    const projectId = await createTestProject(db, 'Another Project');

    await db.query({
      text: `INSERT INTO ProjectMembership (userId, projectId, role)
             VALUES ($1, $2, 'view')`,
      values: [user.id, projectId]
    });

    await expect(
      db.query({
        text: `INSERT INTO ProjectMembership (userId, projectId, role)
               VALUES ($1, $2, 'edit')`,
        values: [user.id, projectId]
      })
    ).rejects.toThrow();
  });

  it('should allow a user to have memberships in multiple projects', async () => {
    const user = await createUser(db, 'henry', 'henry@example.com', 'hash_henry');
    const projectId1 = await createTestProject(db, 'Project Alpha');
    const projectId2 = await createTestProject(db, 'Project Beta');

    await db.query({
      text: `INSERT INTO ProjectMembership (userId, projectId, role)
             VALUES ($1, $2, 'owner')`,
      values: [user.id, projectId1]
    });
    await db.query({
      text: `INSERT INTO ProjectMembership (userId, projectId, role)
             VALUES ($1, $2, 'view')`,
      values: [user.id, projectId2]
    });

    const result = await db.query({
      text: `SELECT * FROM ProjectMembership WHERE userId = $1
             ORDER BY projectId`,
      values: [user.id]
    });

    expect(result.rowCount).toEqual(2);
    expect(result.rows[0].role).toEqual('owner');
    expect(result.rows[1].role).toEqual('view');
  });

  it('should cascade delete memberships when the user is deleted', async () => {
    const user = await createUser(db, 'ivan', 'ivan@example.com', 'hash_ivan');
    const projectId = await createTestProject(db, 'Ivan Project');

    await db.query({
      text: `INSERT INTO ProjectMembership (userId, projectId, role)
             VALUES ($1, $2, 'edit')`,
      values: [user.id, projectId]
    });

    await db.query({
      text: `DELETE FROM appuser WHERE id = $1`,
      values: [user.id]
    });

    const result = await db.query({
      text: `SELECT * FROM ProjectMembership WHERE userId = $1`,
      values: [user.id]
    });

    expect(result.rowCount).toEqual(0);
  });
});

afterAll(async () => {
  return closeMainDb();
});
