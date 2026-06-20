import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it
} from '@jest/globals';

import {
  closeMainDb,
  createAndInitializeDB,
  TestDatabase
} from './db-testing.js';

import {
  createUser,
  getUserByEmail,
  getUserByUsername
} from '../../../src/backend/auth/auth-db.js';

import {
  addGroupToProject,
  addUserToGroup,
  createGroup,
  deleteGroup,
  getGroupById,
  listGroupMembers,
  listGroups,
  removeUserFromGroup
} from '../../../src/backend/admin/group-db.js';

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
    expect(user.passwordHash).toEqual('hash_abc');
    expect(user.id).toBeGreaterThan(0);
    expect(user.isActive).toEqual(true);
    expect(user.createdAt).toBeInstanceOf(Date);
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
    expect(user!.passwordHash).toEqual('hash_bob');
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

  async function createTestProject(
    db: TestDatabase,
    name: string
  ): Promise<number> {
    const result = await db.query<{ id: number }>({
      text: `INSERT INTO Project (name, slug) VALUES ($1, $2) RETURNING id`,
      values: [name, name.toLowerCase().replace(/\s+/g, '-')]
    });
    return result.rows[0].id;
  }

  it('should create a project membership with view role', async () => {
    const user = await createUser(
      db,
      'frank',
      'frank@example.com',
      'hash_frank'
    );
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

  // eslint-disable-next-line max-len
  it('should enforce the (userId, projectId) primary key constraint', async () => {
    const user = await createUser(
      db,
      'grace',
      'grace@example.com',
      'hash_grace'
    );
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

  // eslint-disable-next-line max-len
  it('should allow a user to have memberships in multiple projects', async () => {
    const user = await createUser(
      db,
      'henry',
      'henry@example.com',
      'hash_henry'
    );
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

describe('UserGroup table operations', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('auth_groups');
  });

  afterAll(async () => {
    return db.close();
  });

  afterEach(async () => {
    return db.rollback();
  });

  it('should create a group and return all fields', async () => {
    const owner = await createUser(db, 'alice', 'alice@example.com', 'h');
    const group = await createGroup(db, 'Team Alpha', 'A test team', owner.id);

    expect(group.id).toBeGreaterThan(0);
    expect(group.name).toEqual('Team Alpha');
    expect(group.description).toEqual('A test team');
    expect(group.createdBy).toEqual(owner.id);
    expect(group.memberCount).toEqual(0);
  });

  it('should support a null description', async () => {
    const owner = await createUser(db, 'alice', 'alice@example.com', 'h');
    const group = await createGroup(db, 'No Description', null, owner.id);

    expect(group.description).toBeNull();
  });

  it('should return an empty list when no groups exist', async () => {
    const groups = await listGroups(db);
    expect(groups).toHaveLength(0);
  });

  it('should list all groups ordered by name', async () => {
    const owner = await createUser(db, 'alice', 'alice@example.com', 'h');
    await createGroup(db, 'Zebra Team', null, owner.id);
    await createGroup(db, 'Alpha Team', null, owner.id);

    const groups = await listGroups(db);

    expect(groups).toHaveLength(2);
    expect(groups[0].name).toEqual('Alpha Team');
    expect(groups[1].name).toEqual('Zebra Team');
  });

  it('should include the correct member count in listGroups', async () => {
    const owner = await createUser(db, 'alice', 'alice@example.com', 'h');
    const bob = await createUser(db, 'bob', 'bob@example.com', 'h');
    const group = await createGroup(db, 'Counted Team', null, owner.id);

    await addUserToGroup(db, group.id, owner.id);
    await addUserToGroup(db, group.id, bob.id);

    const groups = await listGroups(db);
    expect(groups[0].memberCount).toEqual(2);
  });

  it('should return null for getGroupById with an unknown id', async () => {
    const result = await getGroupById(db, 99999);
    expect(result).toBeNull();
  });

  it('should return a group by id', async () => {
    const owner = await createUser(db, 'alice', 'alice@example.com', 'h');
    const created = await createGroup(db, 'Findable', 'desc', owner.id);

    const found = await getGroupById(db, created.id);

    expect(found).not.toBeNull();
    expect(found!.name).toEqual('Findable');
    expect(found!.description).toEqual('desc');
  });

  it('should delete a group and return true', async () => {
    const owner = await createUser(db, 'alice', 'alice@example.com', 'h');
    const group = await createGroup(db, 'Temporary', null, owner.id);

    const deleted = await deleteGroup(db, group.id);

    expect(deleted).toEqual(true);
    expect(await getGroupById(db, group.id)).toBeNull();
  });

  it('should return false when deleting a non-existent group', async () => {
    const deleted = await deleteGroup(db, 99999);
    expect(deleted).toEqual(false);
  });

  it('should reject a duplicate group name', async () => {
    const owner = await createUser(db, 'alice', 'alice@example.com', 'h');
    await createGroup(db, 'Duplicate', null, owner.id);

    await expect(
      createGroup(db, 'Duplicate', null, owner.id)
    ).rejects.toThrow();
  });
});

describe('UserGroupMembership table operations', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('auth_group_membership');
  });

  afterAll(async () => {
    return db.close();
  });

  afterEach(async () => {
    return db.rollback();
  });

  async function createTestProject(name: string): Promise<number> {
    const result = await db.query<{ id: number }>({
      text: `INSERT INTO Project (name, slug) VALUES ($1, $2) RETURNING id`,
      values: [name, name.toLowerCase().replace(/\s+/g, '-')]
    });
    return result.rows[0].id;
  }

  it('should add a user to a group and list them as a member', async () => {
    const owner = await createUser(db, 'alice', 'alice@example.com', 'h');
    const group = await createGroup(db, 'Team', null, owner.id);

    await addUserToGroup(db, group.id, owner.id);

    const members = await listGroupMembers(db, group.id);
    expect(members).toHaveLength(1);
    expect(members[0].userId).toEqual(owner.id);
    expect(members[0].username).toEqual('alice');
    expect(members[0].email).toEqual('alice@example.com');
  });

  it('should list group members ordered by username', async () => {
    const alice = await createUser(db, 'alice', 'alice@example.com', 'h');
    const bob = await createUser(db, 'bob', 'bob@example.com', 'h');
    const zoe = await createUser(db, 'zoe', 'zoe@example.com', 'h');
    const group = await createGroup(db, 'Sorted Team', null, alice.id);

    await addUserToGroup(db, group.id, zoe.id);
    await addUserToGroup(db, group.id, alice.id);
    await addUserToGroup(db, group.id, bob.id);

    const members = await listGroupMembers(db, group.id);
    expect(members.map((m) => m.username)).toEqual(['alice', 'bob', 'zoe']);
  });

  it('should return an empty list for a group with no members', async () => {
    const owner = await createUser(db, 'alice', 'alice@example.com', 'h');
    const group = await createGroup(db, 'Empty Team', null, owner.id);

    const members = await listGroupMembers(db, group.id);
    expect(members).toHaveLength(0);
  });

  it('should remove a user from a group', async () => {
    const alice = await createUser(db, 'alice', 'alice@example.com', 'h');
    const bob = await createUser(db, 'bob', 'bob@example.com', 'h');
    const group = await createGroup(db, 'Team', null, alice.id);

    await addUserToGroup(db, group.id, alice.id);
    await addUserToGroup(db, group.id, bob.id);

    const removed = await removeUserFromGroup(db, group.id, alice.id);

    expect(removed).toEqual(true);
    const members = await listGroupMembers(db, group.id);
    expect(members).toHaveLength(1);
    expect(members[0].username).toEqual('bob');
  });

  it('should return false when removing a user who is not a group member', async () => {
    const alice = await createUser(db, 'alice', 'alice@example.com', 'h');
    const group = await createGroup(db, 'Team', null, alice.id);

    const removed = await removeUserFromGroup(db, group.id, alice.id);
    expect(removed).toEqual(false);
  });

  it('should reject adding the same user to a group twice', async () => {
    const alice = await createUser(db, 'alice', 'alice@example.com', 'h');
    const group = await createGroup(db, 'Team', null, alice.id);

    await addUserToGroup(db, group.id, alice.id);

    await expect(addUserToGroup(db, group.id, alice.id)).rejects.toThrow();
  });

  it('should cascade-delete memberships when the user is deleted', async () => {
    const alice = await createUser(db, 'alice', 'alice@example.com', 'h');
    const group = await createGroup(db, 'Team', null, alice.id);
    await addUserToGroup(db, group.id, alice.id);

    await db.query({
      text: `DELETE FROM AppUser WHERE id = $1`,
      values: [alice.id]
    });

    const members = await listGroupMembers(db, group.id);
    expect(members).toHaveLength(0);
  });

  it('should cascade-delete all memberships when the group is deleted', async () => {
    const alice = await createUser(db, 'alice', 'alice@example.com', 'h');
    const bob = await createUser(db, 'bob', 'bob@example.com', 'h');
    const group = await createGroup(db, 'Team', null, alice.id);
    await addUserToGroup(db, group.id, alice.id);
    await addUserToGroup(db, group.id, bob.id);

    await deleteGroup(db, group.id);

    const result = await db.query({
      text: `SELECT * FROM UserGroupMembership WHERE groupId = $1`,
      values: [group.id]
    });
    expect(result.rowCount).toEqual(0);
  });

  it('should add all group members to a project', async () => {
    const alice = await createUser(db, 'alice', 'alice@example.com', 'h');
    const bob = await createUser(db, 'bob', 'bob@example.com', 'h');
    const group = await createGroup(db, 'Team', null, alice.id);
    await addUserToGroup(db, group.id, alice.id);
    await addUserToGroup(db, group.id, bob.id);
    const projectId = await createTestProject('Project X');

    const added = await addGroupToProject(db, projectId, group.id, 'view');

    expect(added).toEqual(2);
    const result = await db.query<{ userid: number; role: string }>({
      text: `SELECT userId, role FROM ProjectMembership WHERE projectId = $1
             ORDER BY userId`,
      values: [projectId]
    });
    expect(result.rowCount).toEqual(2);
    expect(result.rows.map((r) => r.role)).toEqual(['view', 'view']);
  });

  it('should assign the specified role when adding a group to a project', async () => {
    const alice = await createUser(db, 'alice', 'alice@example.com', 'h');
    const group = await createGroup(db, 'Team', null, alice.id);
    await addUserToGroup(db, group.id, alice.id);
    const projectId = await createTestProject('Project Y');

    await addGroupToProject(db, projectId, group.id, 'edit');

    const result = await db.query<{ role: string }>({
      text: `SELECT role FROM ProjectMembership WHERE projectId = $1 AND userId = $2`,
      values: [projectId, alice.id]
    });
    expect(result.rows[0].role).toEqual('edit');
  });

  it('should return zero when adding an empty group to a project', async () => {
    const alice = await createUser(db, 'alice', 'alice@example.com', 'h');
    const group = await createGroup(db, 'Empty Team', null, alice.id);
    const projectId = await createTestProject('Project Z');

    const added = await addGroupToProject(db, projectId, group.id, 'view');

    expect(added).toEqual(0);
  });

  it('should skip members already in the project (ON CONFLICT DO NOTHING)', async () => {
    const alice = await createUser(db, 'alice', 'alice@example.com', 'h');
    const bob = await createUser(db, 'bob', 'bob@example.com', 'h');
    const group = await createGroup(db, 'Team', null, alice.id);
    await addUserToGroup(db, group.id, alice.id);
    await addUserToGroup(db, group.id, bob.id);
    const projectId = await createTestProject('Project W');

    await db.query({
      text: `INSERT INTO ProjectMembership (userId, projectId, role)
             VALUES ($1, $2, 'owner')`,
      values: [alice.id, projectId]
    });

    const added = await addGroupToProject(db, projectId, group.id, 'view');

    expect(added).toEqual(1);
    const result = await db.query<{ userid: number; role: string }>({
      text: `SELECT userId, role FROM ProjectMembership
             WHERE projectId = $1 ORDER BY userId`,
      values: [projectId]
    });
    expect(result.rowCount).toEqual(2);
    const aliceRow = result.rows.find((r) => r.userid === alice.id);
    expect(aliceRow!.role).toEqual('owner');
  });
});

afterAll(async () => {
  return closeMainDb();
});
