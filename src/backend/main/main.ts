import { ParameterizedContext } from 'koa';
import { db } from '../db/db-instance.js';
import { isReBenchDotDev } from '../../util.js';
import { processTemplate } from '../../templates.js';

export async function renderMainPage(ctx: ParameterizedContext): Promise<void> {
  const projects = await db.getAllProjects();
  ctx.body = processTemplate('../backend/main/index.html', {
    projects,
    isReBenchDotDev: isReBenchDotDev()
  });
  ctx.type = 'html';
}
