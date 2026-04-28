import type { Database } from '../db/db.js';
import type { ProjectRole } from './admin-db.js';

export interface UserGroup {
  id: number;
  name: string;
  description: string | null;
  createdBy: number | null;
  createdAt: string;
  memberCount: number;
}

export interface GroupMember {
  userId: number;
  username: string;
  email: string;
}

export async function createGroup(
  db: Database,
  name: string,
  description: string | null,
  createdByUserId: number
): Promise<UserGroup> {
  const result = await db.query<UserGroup>({
    name: 'group_createGroup',
    text: `INSERT INTO UserGroup (name, description, "createdBy")
             VALUES ($1, $2, $3)
             RETURNING id, name, description, "createdBy", "createdAt",
               0 AS "memberCount"`,
    values: [name, description, createdByUserId]
  });
  return result.rows[0];
}

export async function listGroups(db: Database): Promise<UserGroup[]> {
  const result = await db.query<UserGroup>({
    name: 'group_listGroups',
    text: `SELECT g.id, g.name, g.description, g."createdBy", g."createdAt",
                  COUNT(m.userId)::int AS "memberCount"
             FROM UserGroup g
             LEFT JOIN UserGroupMembership m ON m.groupId = g.id
             GROUP BY g.id
             ORDER BY g.name ASC`
  });
  return result.rows;
}

export async function getGroupById(
  db: Database,
  groupId: number
): Promise<UserGroup | null> {
  const result = await db.query<UserGroup>({
    name: 'group_getGroupById',
    text: `SELECT g.id, g.name, g.description, g."createdBy", g."createdAt",
                  COUNT(m.userId)::int AS "memberCount"
             FROM UserGroup g
             LEFT JOIN UserGroupMembership m ON m.groupId = g.id
             WHERE g.id = $1
             GROUP BY g.id`,
    values: [groupId]
  });
  return result.rows[0] ?? null;
}

export async function deleteGroup(
  db: Database,
  groupId: number
): Promise<boolean> {
  const result = await db.query({
    name: 'group_deleteGroup',
    text: `DELETE FROM UserGroup WHERE id = $1`,
    values: [groupId]
  });
  return (result.rowCount ?? 0) > 0;
}

export async function listGroupMembers(
  db: Database,
  groupId: number
): Promise<GroupMember[]> {
  const result = await db.query<GroupMember>({
    name: 'group_listGroupMembers',
    text: `SELECT u.id AS "userId", u.username, u.email
             FROM UserGroupMembership m
             JOIN AppUser u ON u.id = m.userId
             WHERE m.groupId = $1
             ORDER BY u.username ASC`,
    values: [groupId]
  });
  return result.rows;
}

export async function addUserToGroup(
  db: Database,
  groupId: number,
  userId: number
): Promise<void> {
  await db.query({
    name: 'group_addUserToGroup',
    text: `INSERT INTO UserGroupMembership (userId, groupId) VALUES ($1, $2)`,
    values: [userId, groupId]
  });
}

export async function removeUserFromGroup(
  db: Database,
  groupId: number,
  userId: number
): Promise<boolean> {
  const result = await db.query({
    name: 'group_removeUserFromGroup',
    text: `DELETE FROM UserGroupMembership WHERE groupId = $1 AND userId = $2`,
    values: [groupId, userId]
  });
  return (result.rowCount ?? 0) > 0;
}

export async function addGroupToProject(
  db: Database,
  projectId: number,
  groupId: number,
  role: ProjectRole
): Promise<number> {
  const result = await db.query<{ cnt: string }>({
    name: 'group_addGroupToProject',
    text: `WITH members AS (
             SELECT userId FROM UserGroupMembership WHERE groupId = $2
           ), inserted AS (
             INSERT INTO ProjectMembership (userId, projectId, role)
               SELECT userId, $1, $3::projectRole FROM members
               ON CONFLICT (userId, projectId) DO NOTHING
             RETURNING userId
           )
           SELECT COUNT(*)::text AS cnt FROM inserted`,
    values: [projectId, groupId, role]
  });
  return Number(result.rows[0]?.cnt ?? 0);
}
