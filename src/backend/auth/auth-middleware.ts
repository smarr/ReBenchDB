import { Next, ParameterizedContext } from 'koa';
import jwt from 'jsonwebtoken';

import { JWT_SECRET } from '../util.js';
import type { Database } from '../db/db.js';

export interface AuthState {
  userId: number;
  username: string;
}

function redirectOrUnauthorized(
  ctx: ParameterizedContext,
  clearCookie = false
): void {
  if (clearCookie) {
    ctx.cookies.set('rdb_session', '', { maxAge: 0, path: '/' });
  }
  if (ctx.headers.accept?.includes('text/html')) {
    ctx.redirect('/auth/login');
  } else {
    ctx.status = 401;
    ctx.type = 'json';
    ctx.body = { error: 'Authentication required' };
  }
}

export function requireAuth(
  db: Database
): (ctx: ParameterizedContext, next: Next) => Promise<void> {
  return async function requireAuthMiddleware(
    ctx: ParameterizedContext,
    next: Next
  ): Promise<void> {
    let token: string | undefined;

    const authHeader = ctx.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      const cookie = ctx.cookies.get('rdb_session');
      if (cookie) {
        token = decodeURIComponent(cookie);
      }
    }

    if (!token) {
      redirectOrUnauthorized(ctx);
      return;
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    } catch {
      redirectOrUnauthorized(ctx, true);
      return;
    }

    ctx.state.userId = Number(payload.sub);
    ctx.state.username = payload.username as string;

    // Establishes the RLS-scoped transaction for the whole request, so
    // every route behind requireAuth(db) is automatically scoped to the
    // authenticated user — there is nothing left for a route handler to
    // remember to wrap.
    await db.withUserContext(ctx.state.userId, next);
  };
}
