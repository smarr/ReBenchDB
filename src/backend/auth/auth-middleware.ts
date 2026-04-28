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
