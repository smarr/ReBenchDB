import { Next, ParameterizedContext } from 'koa';
import jwt from 'jsonwebtoken';

import { JWT_SECRET } from '../util.js';

export interface AuthState {
  userId: number;
  username: string;
}

export async function requireAuth(
  ctx: ParameterizedContext,
  next: Next
): Promise<void> {
  const header = ctx.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    ctx.status = 401;
    ctx.type = 'json';
    ctx.body = { error: 'Authentication required' };
    return;
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    ctx.state.userId = Number(payload.sub);
    ctx.state.username = payload.username as string;
    await next();
  } catch {
    ctx.status = 401;
    ctx.type = 'json';
    ctx.body = { error: 'Invalid or expired token' };
  }
}
