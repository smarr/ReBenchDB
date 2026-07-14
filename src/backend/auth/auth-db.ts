import type { Database } from '../db/db.js';

export interface AppUser {
  id: number;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  isActive: boolean;
}

export async function checkUserByUsername(
  db: Database,
  username: string
): Promise<boolean> {
  const result = await db.query<{
    exists: boolean;
  }>({
    name: 'checkUserByUsername',
    text: 'SELECT EXISTS ( SELECT 1 FROM AppUser WHERE username = $1 )',
    values: [username]
  });
  return result.rows[0]?.exists ?? false;
}

export async function checkUserByEmail(
  db: Database,
  email: string
): Promise<boolean> {
  const result = await db.query<{
    exists: boolean;
  }>({
    name: 'checkUserByEmail',
    text: 'SELECT EXISTS ( SELECT 1 FROM AppUser WHERE email = $1 )',
    values: [email]
  });
  return result.rows[0]?.exists ?? false;
}

export async function createUser(
  db: Database,
  username: string,
  email: string,
  passwordHash: string
): Promise<AppUser> {
  const result = await db.query<AppUser>({
    name: 'createUser',
    text: `INSERT INTO AppUser (username, email, "passwordHash")
           VALUES ($1, $2, $3)
           RETURNING *`,
    values: [username, email, passwordHash]
  });
  return result.rows[0];
}
