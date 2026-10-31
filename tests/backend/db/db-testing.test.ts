import {
  describe,
  expect,
  it,
  jest,
  beforeEach,
  afterEach
} from '@jest/globals';

import { explainMainDbError } from './db-testing.js';
import type { DatabaseConfig } from '../../../src/backend/db/types.js';
import { log } from '../../../src/backend/logging.js';

describe('explainMainDbError()', () => {
  const cfg: DatabaseConfig = {
    user: 'rdb',
    password: '',
    host: 'localhost',
    database: 'main_db',
    port: 5432
  };
  const suiteDb = 'main_db_some_suite';

  function pgError(code: string, message = 'pg message'): Error {
    return Object.assign(new Error(message), { code });
  }

  function explain(e: any, config = cfg): Error {
    return explainMainDbError(e, config, suiteDb);
  }

  let logError: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    // reportConnectionRefused() logs details, which we don't need to see
    logError = jest.spyOn(log, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logError.mockRestore();
  });

  it('should keep the original error as cause', () => {
    const e = pgError('3D000');
    expect(explain(e).cause).toBe(e);
  });

  it('should always explain how to configure the main database', () => {
    const msg = explain(pgError('3D000')).message;
    expect(msg).toContain(
      `separate database per test suite (here "${suiteDb}")`
    );
    expect(msg).toContain('RDB_DB (default "test_rdb4")');
    expect(msg).toContain('RDB_DB=postgres npm test');
  });

  it('should identify the main database, user, and server', () => {
    expect(explain(pgError('3D000')).message).toContain(
      'main database "main_db" (user "rdb" on localhost:5432)'
    );
  });

  it('should fall back to the OS user if no user is configured', () => {
    const msg = explain(pgError('3D000'), { ...cfg, user: '' }).message;
    expect(msg).toContain(`(user "${process.env.USER}" on`);
  });

  it('should report a refused connection', () => {
    const e = Object.assign(pgError('ECONNREFUSED'), {
      address: '127.0.0.1',
      port: 5432
    });
    expect(explain(e).message).toMatch(
      /^Connection refused for main database .* Is PostgreSQL running\?/
    );
    expect(logError).toHaveBeenCalled();
  });

  it('should report a refused connection of an AggregateError', () => {
    // pg reports one error each for IPv4 and IPv6, wrapped in an
    // AggregateError, which has no code itself
    const refused = (address: string) =>
      Object.assign(pgError('ECONNREFUSED'), { address, port: 5432 });
    const e = new AggregateError([refused('::1'), refused('127.0.0.1')]);

    expect(explain(e).message).toMatch(/^Connection refused for main database/);
    expect(logError).toHaveBeenCalled();
  });

  it('should explain how to create a missing main database', () => {
    const msg = explain(pgError('3D000')).message;
    expect(msg).toMatch(/^The main database "main_db" .* does not exist\./);
    expect(msg).toContain('Create it with `createdb main_db`');
  });

  it('should report failed authentication', () => {
    for (const code of ['28P01', '28000']) {
      expect(explain(pgError(code, 'auth failed')).message).toMatch(
        /^Authentication failed for main database "main_db" .*: auth failed/
      );
    }
  });

  it('should explain how to grant permission to create databases', () => {
    const msg = explain(pgError('42501', 'permission denied')).message;
    expect(msg).toMatch(
      /^The user "rdb" is not permitted to create databases: permission denied/
    );
    expect(msg).toContain('ALTER ROLE rdb CREATEDB');
  });

  it('should include the original message for other errors', () => {
    const msg = explain(pgError('XX000', 'something else')).message;
    expect(msg).toMatch(/^Failed to create "main_db_some_suite" via main/);
    expect(msg).toMatch(/: something else\n/);
  });
});
