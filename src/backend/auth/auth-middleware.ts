import { Next, ParameterizedContext } from 'koa';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || '';

if (!JWT_SECRET) {
  console.warn(
    '[auth] WARNING: JWT_SECRET environment variable is not set. ' +
      'Authentication will not work correctly.'
  );
}

export interface AuthState {
  userId: number;
  username: string;
}

function redirectOrUnauthorized(ctx: ParameterizedContext, clearCookie = false): void {
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

export async function requireAuth(
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

  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    ctx.state.userId = Number(payload.sub);
    ctx.state.username = payload.username as string;
    await next();
  } catch {
    redirectOrUnauthorized(ctx, true);
  }
}
