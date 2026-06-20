import { ParameterizedContext } from 'koa';

import type { Database } from '../db/db.js';
import { prepareTemplate } from '../templates.js';
import { rebenchVersion, robustPath } from '../util.js';
import { getUserByUsername } from '../auth/auth-db.js';
import {
  PROJECT_ROLES,
  ProjectRole,
  addProjectMember,
  countOwners,
  createProjectWithOwner,
  generateApiTokenForUser,
  getApiTokenStatusForUser,
  getProjectsForUser,
  getUserRoleForProject,
  isProjectRole,
  listProjectMembers,
  removeProjectMember,
  slugify,
  updateProjectMemberRole
} from './admin-db.js';
import {
  addGroupToProject,
  addUserToGroup,
  createGroup,
  deleteGroup,
  getGroupById,
  listGroupMembers,
  listGroups,
  removeUserFromGroup
} from './group-db.js';

const adminTpl = prepareTemplate(robustPath('backend/admin/admin.html'));

export function renderAdminPage(ctx: ParameterizedContext): void {
  ctx.body = adminTpl({
    rebenchVersion,
    username: ctx.state.username
  });
  ctx.type = 'html';
}

function jsonError(
  ctx: ParameterizedContext,
  status: number,
  message: string
): void {
  ctx.status = status;
  ctx.type = 'json';
  ctx.body = { error: message };
}

function parseProjectId(ctx: ParameterizedContext): number | null {
  const raw = ctx.params.projectId;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    jsonError(ctx, 400, 'Invalid projectId');
    return null;
  }
  return id;
}

function parseUserId(ctx: ParameterizedContext): number | null {
  const raw = ctx.params.userId;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    jsonError(ctx, 400, 'Invalid userId');
    return null;
  }
  return id;
}

async function requireOwner(
  ctx: ParameterizedContext,
  db: Database,
  projectId: number
): Promise<boolean> {
  const role = await getUserRoleForProject(db, ctx.state.userId, projectId);
  if (role !== 'owner') {
    jsonError(
      ctx,
      role === null ? 404 : 403,
      role === null ? 'Project not found' : 'Owner role required'
    );
    return false;
  }
  return true;
}

export async function listMyProjects(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const projects = await getProjectsForUser(db, ctx.state.userId);
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { projects };
}

export async function createProject(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const body = ctx.request.body as any;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const description =
    typeof body?.description === 'string' && body.description.trim() !== ''
      ? body.description.trim()
      : null;

  if (!name) {
    jsonError(ctx, 400, 'Project name is required');
    return;
  }
  if (name.length > 100) {
    jsonError(ctx, 400, 'Project name must be at most 100 characters');
    return;
  }

  const slug = slugify(name);
  if (!slug) {
    jsonError(ctx, 400, 'Project name must contain alphanumeric characters');
    return;
  }

  try {
    const project = await createProjectWithOwner(
      db,
      name,
      slug,
      description,
      ctx.state.userId
    );
    ctx.status = 201;
    ctx.type = 'json';
    ctx.body = { project };
  } catch (e: any) {
    if (e?.code === '23505') {
      jsonError(ctx, 409, 'A project with that name or slug already exists');
      return;
    }
    throw e;
  }
}

export async function getMembers(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const projectId = parseProjectId(ctx);
  if (projectId === null) return;
  if (!(await requireOwner(ctx, db, projectId))) return;

  const members = await listProjectMembers(db, projectId);
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { members };
}

export async function addMember(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const projectId = parseProjectId(ctx);
  if (projectId === null) return;
  if (!(await requireOwner(ctx, db, projectId))) return;

  const body = ctx.request.body as any;
  const username =
    typeof body?.username === 'string' ? body.username.trim() : '';
  const role = body?.role;

  if (!username) {
    jsonError(ctx, 400, 'username is required');
    return;
  }
  if (!isProjectRole(role)) {
    jsonError(
      ctx,
      400,
      `role must be one of: ${PROJECT_ROLES.join(', ')}`
    );
    return;
  }

  const user = await getUserByUsername(db, username);
  if (!user) {
    jsonError(ctx, 404, `No user found with username "${username}"`);
    return;
  }

  try {
    await addProjectMember(db, projectId, user.id, role as ProjectRole);
    ctx.status = 201;
    ctx.type = 'json';
    ctx.body = {
      member: {
        userId: user.id,
        username: user.username,
        email: user.email,
        role
      }
    };
  } catch (e: any) {
    if (e?.code === '23505') {
      jsonError(ctx, 409, 'User is already a member of this project');
      return;
    }
    throw e;
  }
}

export async function updateMember(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const projectId = parseProjectId(ctx);
  if (projectId === null) return;
  const userId = parseUserId(ctx);
  if (userId === null) return;
  if (!(await requireOwner(ctx, db, projectId))) return;

  const body = ctx.request.body as any;
  const role = body?.role;
  if (!isProjectRole(role)) {
    jsonError(
      ctx,
      400,
      `role must be one of: ${PROJECT_ROLES.join(', ')}`
    );
    return;
  }

  if (role !== 'owner') {
    const current = await getUserRoleForProject(db, userId, projectId);
    if (current === 'owner') {
      const owners = await countOwners(db, projectId);
      if (owners <= 1) {
        jsonError(
          ctx,
          409,
          'Cannot demote the last owner of the project'
        );
        return;
      }
    }
  }

  const updated = await updateProjectMemberRole(
    db,
    projectId,
    userId,
    role as ProjectRole
  );
  if (!updated) {
    jsonError(ctx, 404, 'Member not found');
    return;
  }
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { ok: true };
}

export async function getMyApiToken(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const status = await getApiTokenStatusForUser(db, ctx.state.userId);
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = status;
}

export async function generateMyApiToken(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const token = await generateApiTokenForUser(db, ctx.state.userId);
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { token };
}

export async function deleteMember(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const projectId = parseProjectId(ctx);
  if (projectId === null) return;
  const userId = parseUserId(ctx);
  if (userId === null) return;
  if (!(await requireOwner(ctx, db, projectId))) return;

  const current = await getUserRoleForProject(db, userId, projectId);
  if (current === null) {
    jsonError(ctx, 404, 'Member not found');
    return;
  }
  if (current === 'owner') {
    const owners = await countOwners(db, projectId);
    if (owners <= 1) {
      jsonError(ctx, 409, 'Cannot remove the last owner of the project');
      return;
    }
  }

  await removeProjectMember(db, projectId, userId);
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { ok: true };
}

function parseGroupId(ctx: ParameterizedContext): number | null {
  const raw = ctx.params.groupId;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    jsonError(ctx, 400, 'Invalid groupId');
    return null;
  }
  return id;
}

export async function listAllGroups(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const groups = await listGroups(db);
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { groups };
}

export async function createNewGroup(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const body = ctx.request.body as any;
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const description =
    typeof body?.description === 'string' && body.description.trim() !== ''
      ? body.description.trim()
      : null;

  if (!name) {
    jsonError(ctx, 400, 'Group name is required');
    return;
  }
  if (name.length > 100) {
    jsonError(ctx, 400, 'Group name must be at most 100 characters');
    return;
  }

  try {
    const group = await createGroup(db, name, description, ctx.state.userId);
    ctx.status = 201;
    ctx.type = 'json';
    ctx.body = { group };
  } catch (e: any) {
    if (e?.code === '23505') {
      jsonError(ctx, 409, 'A group with that name already exists');
      return;
    }
    throw e;
  }
}

export async function removeGroup(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const groupId = parseGroupId(ctx);
  if (groupId === null) return;

  const deleted = await deleteGroup(db, groupId);
  if (!deleted) {
    jsonError(ctx, 404, 'Group not found');
    return;
  }
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { ok: true };
}

export async function getGroupMembers(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const groupId = parseGroupId(ctx);
  if (groupId === null) return;

  const group = await getGroupById(db, groupId);
  if (group === null) {
    jsonError(ctx, 404, 'Group not found');
    return;
  }

  const members = await listGroupMembers(db, groupId);
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { members };
}

export async function addGroupMember(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const groupId = parseGroupId(ctx);
  if (groupId === null) return;

  const group = await getGroupById(db, groupId);
  if (group === null) {
    jsonError(ctx, 404, 'Group not found');
    return;
  }

  const body = ctx.request.body as any;
  const username =
    typeof body?.username === 'string' ? body.username.trim() : '';
  if (!username) {
    jsonError(ctx, 400, 'username is required');
    return;
  }

  const user = await getUserByUsername(db, username);
  if (!user) {
    jsonError(ctx, 404, `No user found with username "${username}"`);
    return;
  }

  try {
    await addUserToGroup(db, groupId, user.id);
    ctx.status = 201;
    ctx.type = 'json';
    ctx.body = { member: { userId: user.id, username: user.username, email: user.email } };
  } catch (e: any) {
    if (e?.code === '23505') {
      jsonError(ctx, 409, 'User is already a member of this group');
      return;
    }
    throw e;
  }
}

export async function removeGroupMember(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const groupId = parseGroupId(ctx);
  if (groupId === null) return;
  const userId = parseUserId(ctx);
  if (userId === null) return;

  const removed = await removeUserFromGroup(db, groupId, userId);
  if (!removed) {
    jsonError(ctx, 404, 'Member not found in group');
    return;
  }
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { ok: true };
}

export async function assignGroupToProject(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const projectId = parseProjectId(ctx);
  if (projectId === null) return;
  if (!(await requireOwner(ctx, db, projectId))) return;

  const body = ctx.request.body as any;
  const groupId = typeof body?.groupId === 'number' ? body.groupId : Number(body?.groupId);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    jsonError(ctx, 400, 'groupId is required');
    return;
  }

  const role = body?.role;
  if (!isProjectRole(role)) {
    jsonError(ctx, 400, `role must be one of: ${PROJECT_ROLES.join(', ')}`);
    return;
  }

  const group = await getGroupById(db, groupId);
  if (group === null) {
    jsonError(ctx, 404, 'Group not found');
    return;
  }

  const added = await addGroupToProject(
    db,
    projectId,
    groupId,
    role as ProjectRole
  );
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { added };
}
