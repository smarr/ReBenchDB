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
  const role = await db.withUserContext(ctx.state.userId, () =>
    getUserRoleForProject(db, ctx.state.userId, projectId)
  );
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
  const projects = await db.withUserContext(ctx.state.userId, () =>
    getProjectsForUser(db, ctx.state.userId)
  );
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

  const members = await db.withUserContext(ctx.state.userId, () =>
    listProjectMembers(db, projectId)
  );
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
    await db.withUserContext(ctx.state.userId, () =>
      addProjectMember(db, projectId, user.id, role as ProjectRole)
    );
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
    const current = await db.withUserContext(ctx.state.userId, () =>
      getUserRoleForProject(db, userId, projectId)
    );
    if (current === 'owner') {
      const owners = await db.withUserContext(ctx.state.userId, () =>
        countOwners(db, projectId)
      );
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

  const updated = await db.withUserContext(ctx.state.userId, () =>
    updateProjectMemberRole(db, projectId, userId, role as ProjectRole)
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

  const current = await db.withUserContext(ctx.state.userId, () =>
    getUserRoleForProject(db, userId, projectId)
  );
  if (current === null) {
    jsonError(ctx, 404, 'Member not found');
    return;
  }
  if (current === 'owner') {
    const owners = await db.withUserContext(ctx.state.userId, () =>
      countOwners(db, projectId)
    );
    if (owners <= 1) {
      jsonError(ctx, 409, 'Cannot remove the last owner of the project');
      return;
    }
  }

  await db.withUserContext(ctx.state.userId, () =>
    removeProjectMember(db, projectId, userId)
  );
  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { ok: true };
}
