import { randomBytes } from 'node:crypto';

import type { Database } from '../db/db.js';

export type ProjectRole = 'view' | 'edit' | 'owner';

export const PROJECT_ROLES: ProjectRole[] = ['view', 'edit', 'owner'];

export function isProjectRole(value: unknown): value is ProjectRole {
  return (
    typeof value === 'string' &&
    (PROJECT_ROLES as string[]).includes(value)
  );
}

export interface MyProject {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  role: ProjectRole;
}

export interface ProjectMember {
  userId: number;
  username: string;
  email: string;
  role: ProjectRole;
}

export async function getProjectsForUser(
  db: Database,
  userId: number
): Promise<MyProject[]> {
  const result = await db.query<MyProject>({
    name: 'admin_getProjectsForUser',
    text: `SELECT p.id, p.name, p.slug, p.description, pm.role
             FROM Project p
             JOIN ProjectMembership pm ON pm.projectId = p.id
             WHERE pm.userId = $1
             ORDER BY p.position DESC, p.name ASC`,
    values: [userId]
  });
  return result.rows;
}

export async function getUserRoleForProject(
  db: Database,
  userId: number,
  projectId: number
): Promise<ProjectRole | null> {
  const result = await db.query<{ role: ProjectRole }>({
    name: 'admin_getUserRoleForProject',
    text: `SELECT role FROM ProjectMembership
             WHERE userId = $1 AND projectId = $2`,
    values: [userId, projectId]
  });
  return result.rows[0]?.role ?? null;
}

export async function listProjectMembers(
  db: Database,
  projectId: number
): Promise<ProjectMember[]> {
  const result = await db.query<ProjectMember>({
    name: 'admin_listProjectMembers',
    text: `SELECT u.id AS "userId", u.username, u.email, pm.role
             FROM ProjectMembership pm
             JOIN AppUser u ON u.id = pm.userId
             WHERE pm.projectId = $1
             ORDER BY pm.role DESC, u.username ASC`,
    values: [projectId]
  });
  return result.rows;
}

export async function addProjectMember(
  db: Database,
  projectId: number,
  userId: number,
  role: ProjectRole
): Promise<void> {
  await db.query({
    name: 'admin_addProjectMember',
    text: `INSERT INTO ProjectMembership (userId, projectId, role)
             VALUES ($1, $2, $3::projectRole)`,
    values: [userId, projectId, role]
  });
}

export async function updateProjectMemberRole(
  db: Database,
  projectId: number,
  userId: number,
  role: ProjectRole
): Promise<boolean> {
  const result = await db.query({
    name: 'admin_updateProjectMemberRole',
    text: `UPDATE ProjectMembership
             SET role = $3::projectRole
             WHERE projectId = $1 AND userId = $2`,
    values: [projectId, userId, role]
  });
  return (result.rowCount ?? 0) > 0;
}

export async function removeProjectMember(
  db: Database,
  projectId: number,
  userId: number
): Promise<boolean> {
  const result = await db.query({
    name: 'admin_removeProjectMember',
    text: `DELETE FROM ProjectMembership
             WHERE projectId = $1 AND userId = $2`,
    values: [projectId, userId]
  });
  return (result.rowCount ?? 0) > 0;
}

export async function countOwners(
  db: Database,
  projectId: number
): Promise<number> {
  const result = await db.query<{ cnt: string }>({
    name: 'admin_countOwners',
    text: `SELECT count(*)::text AS cnt FROM ProjectMembership
             WHERE projectId = $1 AND role = 'owner'`,
    values: [projectId]
  });
  return Number(result.rows[0]?.cnt ?? 0);
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface CreatedProject {
  id: number;
  name: string;
  slug: string;
}

/**
 * Inserts the Project and its initial owner ProjectMembership in one
 * statement. Must be called outside withUserContext so it runs as the pool
 * (superuser) connection — RLS on Project would otherwise reject the INSERT
 * because no membership exists for the project yet.
 */
export async function generateApiTokenForUser(
  db: Database,
  userId: number
): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await db.query({
    name: 'admin_generateApiTokenForUser',
    text: `UPDATE AppUser SET "apiToken" = $2 WHERE id = $1`,
    values: [userId, token]
  });
  return token;
}

export async function getApiTokenStatusForUser(
  db: Database,
  userId: number
): Promise<{ hasToken: boolean; suffix: string | null }> {
  const result = await db.query<{ apiToken: string | null }>({
    name: 'admin_getApiTokenStatusForUser',
    text: `SELECT "apiToken" FROM AppUser WHERE id = $1`,
    values: [userId]
  });
  const token = result.rows[0]?.apiToken ?? null;
  return {
    hasToken: token !== null,
    suffix: token ? token.slice(-8) : null
  };
}

export async function getUserByApiToken(
  db: Database,
  token: string
): Promise<{ id: number } | null> {
  const result = await db.query<{ id: number }>({
    name: 'admin_getUserByApiToken',
    text: `SELECT id FROM AppUser WHERE "apiToken" = $1 AND "isActive" = true`,
    values: [token]
  });
  return result.rows[0] ?? null;
}

export async function getUserRoleForProjectByName(
  db: Database,
  userId: number,
  projectName: string
): Promise<ProjectRole | null> {
  const result = await db.query<{ role: ProjectRole }>({
    name: 'admin_getUserRoleForProjectByName',
    text: `SELECT pm.role FROM ProjectMembership pm
             JOIN Project p ON p.id = pm.projectId
             WHERE pm.userId = $1 AND p.name = $2`,
    values: [userId, projectName]
  });
  return result.rows[0]?.role ?? null;
}

export async function createProjectWithOwner(
  db: Database,
  name: string,
  slug: string,
  description: string | null,
  ownerUserId: number
): Promise<CreatedProject> {
  const result = await db.query<CreatedProject>({
    name: 'admin_createProjectWithOwner',
    text: `WITH new_project AS (
             INSERT INTO Project (name, slug, description)
               VALUES ($1, $2, $3)
               RETURNING id, name, slug
           ), new_membership AS (
             INSERT INTO ProjectMembership (userId, projectId, role)
               SELECT $4, id, 'owner' FROM new_project
           )
           SELECT id, name, slug FROM new_project`,
    values: [name, slug, description, ownerUserId]
  });
  return result.rows[0];
}
