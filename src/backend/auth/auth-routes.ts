import { ParameterizedContext } from 'koa';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import type { Database } from '../db/db.js';
import {
  createUser,
  getUserByEmail,
  getUserByUsername
} from './auth-db.js';
import { prepareTemplate } from '../templates.js';
import { rebenchVersion, robustPath } from '../util.js';

const loginTpl = prepareTemplate(robustPath('backend/auth/login.html'));

export function renderLoginPage(ctx: ParameterizedContext): void {
  ctx.body = loginTpl({ rebenchVersion });
  ctx.type = 'html';
}

const JWT_SECRET = process.env.JWT_SECRET || '';
const BCRYPT_ROUNDS = 12;

export async function register(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const body = ctx.request.body as any;
  const { username, email, password } = body ?? {};

  if (!username || !email || !password) {
    ctx.status = 400;
    ctx.type = 'json';
    ctx.body = { error: 'username, email, and password are required' };
    return;
  }

  if (typeof username !== 'string' || username.length > 100) {
    ctx.status = 400;
    ctx.type = 'json';
    ctx.body = { error: 'username must be a string of at most 100 characters' };
    return;
  }

  if (typeof email !== 'string' || email.length > 255) {
    ctx.status = 400;
    ctx.type = 'json';
    ctx.body = { error: 'email must be a string of at most 255 characters' };
    return;
  }

  if (typeof password !== 'string' || password.length < 8) {
    ctx.status = 400;
    ctx.type = 'json';
    ctx.body = { error: 'password must be at least 8 characters' };
    return;
  }

  const existingByUsername = await getUserByUsername(db, username);
  if (existingByUsername) {
    ctx.status = 409;
    ctx.type = 'json';
    ctx.body = { error: 'Username already taken' };
    return;
  }

  const existingByEmail = await getUserByEmail(db, email);
  if (existingByEmail) {
    ctx.status = 409;
    ctx.type = 'json';
    ctx.body = { error: 'Email already registered' };
    return;
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await createUser(db, username, email, passwordHash);

  ctx.status = 201;
  ctx.type = 'json';
  ctx.body = { userId: user.id, username: user.username };
}

export async function login(
  ctx: ParameterizedContext,
  db: Database
): Promise<void> {
  const body = ctx.request.body as any;
  const { username, password } = body ?? {};

  if (!username || !password) {
    ctx.status = 400;
    ctx.type = 'json';
    ctx.body = { error: 'username and password are required' };
    return;
  }

  const user = await getUserByUsername(db, username);

  if (!user || !user.is_active) {
    ctx.status = 401;
    ctx.type = 'json';
    ctx.body = { error: 'Invalid credentials' };
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    ctx.status = 401;
    ctx.type = 'json';
    ctx.body = { error: 'Invalid credentials' };
    return;
  }

  const token = jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  ctx.status = 200;
  ctx.type = 'json';
  ctx.body = { token };
}
