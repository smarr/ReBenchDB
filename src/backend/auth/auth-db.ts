import type { Database } from '../db/db.js';

export interface AppUser {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  created_at: Date;
  is_active: boolean;
}

export async function getUserByUsername(
  db: Database,
  username: string
): Promise<AppUser | null> {
  const result = await db.query<AppUser>({
    name: 'getUserByUsername',
    text: 'SELECT * FROM appuser WHERE username = $1',
    values: [username]
  });
  return result.rows[0] ?? null;
}

export async function getUserByEmail(
  db: Database,
  email: string
): Promise<AppUser | null> {
  const result = await db.query<AppUser>({
    name: 'getUserByEmail',
    text: 'SELECT * FROM appuser WHERE email = $1',
    values: [email]
  });
  return result.rows[0] ?? null;
}

export async function createUser(
  db: Database,
  username: string,
  email: string,
  passwordHash: string
): Promise<AppUser> {
  const result = await db.query<AppUser>({
    name: 'createUser',
    text: `INSERT INTO appuser (username, email, password_hash)
           VALUES ($1, $2, $3)
           RETURNING *`,
    values: [username, email, passwordHash]
  });
  return result.rows[0];
}
