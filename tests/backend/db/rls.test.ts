import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it
} from '@jest/globals';

import {
  closeMainDb,
  createAndInitializeDB,
  TestDatabase
} from './db-testing.js';

import { createUser } from '../../../src/backend/auth/auth-db.js';

// ─── fixture helpers ────────────────────────────────────────────────────────

async function createProject(db: TestDatabase, name: string): Promise<number> {
  const r = await db.query<{ id: number }>({
    text: `INSERT INTO Project (name, slug) VALUES ($1, $2) RETURNING id`,
    values: [name, name.toLowerCase().replace(/\s+/g, '-')]
  });
  return r.rows[0].id;
}

async function addMembership(
  db: TestDatabase,
  userId: number,
  projectId: number
): Promise<void> {
  await db.query({
    text: `INSERT INTO ProjectMembership (userId, projectId, role)
           VALUES ($1, $2, 'view')`,
    values: [userId, projectId]
  });
}

async function createExperiment(
  db: TestDatabase,
  projectId: number,
  name: string
): Promise<number> {
  const r = await db.query<{ id: number }>({
    text: `INSERT INTO Experiment (name, projectId) VALUES ($1, $2) RETURNING id`,
    values: [name, projectId]
  });
  return r.rows[0].id;
}

async function createEnvironment(db: TestDatabase): Promise<number> {
  const r = await db.query<{ id: number }>({
    text: `INSERT INTO Environment (hostname) VALUES ('test-host') RETURNING id`
  });
  return r.rows[0].id;
}

async function createSource(db: TestDatabase): Promise<number> {
  const r = await db.query<{ id: number }>({
    text: `INSERT INTO Source (commitId) VALUES ('abc123') RETURNING id`
  });
  return r.rows[0].id;
}

async function createTrial(
  db: TestDatabase,
  expId: number,
  envId: number,
  sourceId: number
): Promise<number> {
  const r = await db.query<{ id: number }>({
    text: `INSERT INTO Trial (
                   manualRun, startTime, expId, username, envId, sourceId)
           VALUES (false, now(), $1, 'tester', $2, $3) RETURNING id`,
    values: [expId, envId, sourceId]
  });
  return r.rows[0].id;
}

async function createRun(db: TestDatabase): Promise<number> {
  const r = await db.query<{ id: number }>({
    text: `INSERT INTO Run
             (benchmark, suite, executor, cmdline, maxInvocationTime, minIterationTime)
           VALUES ('bench', 'suite', 'exec', 'cmd', 1000, 10) RETURNING id`
  });
  return r.rows[0].id;
}

async function createCriterion(db: TestDatabase): Promise<number> {
  const r = await db.query<{ id: number }>({
    text: `INSERT INTO Criterion (name, unit) VALUES ('total', 'ms')
           ON CONFLICT (name, unit) DO UPDATE SET name = EXCLUDED.name
           RETURNING id`
  });
  return r.rows[0].id;
}

async function insertMeasurement(
  db: TestDatabase,
  runId: number,
  trialId: number,
  criterionId: number,
  invocation = 1
): Promise<void> {
  await db.query({
    text: `INSERT INTO Measurement (runId, trialId, criterion, invocation, values)
           VALUES ($1, $2, $3, $4, '{1.0}')`,
    values: [runId, trialId, criterionId, invocation]
  });
}

async function insertTimeline(
  db: TestDatabase,
  runId: number,
  trialId: number,
  criterionId: number
): Promise<void> {
  await db.query({
    text: `INSERT INTO Timeline
             (runId, trialId, criterion, numSamples,
              minVal, maxVal, sdVal, mean, median, bci95low, bci95up)
           VALUES ($1, $2, $3, 1, 1.0, 2.0, 0.1, 1.5, 1.5, 1.2, 1.8)`,
    values: [runId, trialId, criterionId]
  });
}

async function insertProfileData(
  db: TestDatabase,
  runId: number,
  trialId: number
): Promise<void> {
  await db.query({
    text: `INSERT INTO ProfileData (runId, trialId, invocation, numIterations, value)
           VALUES ($1, $2, 1, 10, 'profile')`,
    values: [runId, trialId]
  });
}

// ─── Project ────────────────────────────────────────────────────────────────

describe('RLS policy: Project table', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('rls_project');
  });

  afterAll(async () => db.close());
  afterEach(async () => db.rollback());

  it('should hide a project from a user with no membership', async () => {
    const user = await createUser(db, 'alice', 'alice@test.com', 'hash');
    const projectId = await createProject(db, 'Secret Project');

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT id FROM Project' })
    );

    expect(result.rows.map((r) => r.id)).not.toContain(projectId);
  });

  it('should show a project to a user who is a member', async () => {
    const user = await createUser(db, 'alice', 'alice@test.com', 'hash');
    const projectId = await createProject(db, 'My Project');
    await addMembership(db, user.id, projectId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT id FROM Project' })
    );

    expect(result.rows.map((r) => r.id)).toContain(projectId);
  });

  it('should bypass restrictions when no user context is set', async () => {
    const projectId = await createProject(db, 'Any Project');

    const result = await db.query({ text: 'SELECT id FROM Project' });

    expect(result.rows.map((r) => r.id)).toContain(projectId);
  });
});

// ─── Experiment ─────────────────────────────────────────────────────────────

describe('RLS policy: Experiment table', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('rls_experiment');
  });

  afterAll(async () => db.close());
  afterEach(async () => db.rollback());

  it('should hide an experiment from a non-member', async () => {
    const user = await createUser(db, 'bob', 'bob@test.com', 'hash');
    const projectId = await createProject(db, 'Private Project');
    const expId = await createExperiment(db, projectId, 'Bench Exp');

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT id FROM Experiment' })
    );

    expect(result.rows.map((r) => r.id)).not.toContain(expId);
  });

  it('should show an experiment to a project member', async () => {
    const user = await createUser(db, 'bob', 'bob@test.com', 'hash');
    const projectId = await createProject(db, 'My Project');
    const expId = await createExperiment(db, projectId, 'Bench Exp');
    await addMembership(db, user.id, projectId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT id FROM Experiment' })
    );

    expect(result.rows.map((r) => r.id)).toContain(expId);
  });
});

// ─── Trial ──────────────────────────────────────────────────────────────────

describe('RLS policy: Trial table', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('rls_trial');
  });

  afterAll(async () => db.close());
  afterEach(async () => db.rollback());

  it('should hide a trial from a non-member', async () => {
    const user = await createUser(db, 'carol', 'carol@test.com', 'hash');
    const projectId = await createProject(db, 'Private Project');
    const expId = await createExperiment(db, projectId, 'Exp');
    const envId = await createEnvironment(db);
    const sourceId = await createSource(db);
    const trialId = await createTrial(db, expId, envId, sourceId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT id FROM Trial' })
    );

    expect(result.rows.map((r) => r.id)).not.toContain(trialId);
  });

  it('should show a trial to a project member', async () => {
    const user = await createUser(db, 'carol', 'carol@test.com', 'hash');
    const projectId = await createProject(db, 'My Project');
    const expId = await createExperiment(db, projectId, 'Exp');
    const envId = await createEnvironment(db);
    const sourceId = await createSource(db);
    const trialId = await createTrial(db, expId, envId, sourceId);
    await addMembership(db, user.id, projectId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT id FROM Trial' })
    );

    expect(result.rows.map((r) => r.id)).toContain(trialId);
  });
});

// ─── Source ─────────────────────────────────────────────────────────────────

describe('RLS policy: Source table', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('rls_source');
  });

  afterAll(async () => db.close());
  afterEach(async () => db.rollback());

  it('should hide a source when no accessible trial references it', async () => {
    const user = await createUser(db, 'dave', 'dave@test.com', 'hash');
    const projectId = await createProject(db, 'Private Project');
    const expId = await createExperiment(db, projectId, 'Exp');
    const envId = await createEnvironment(db);
    const sourceId = await createSource(db);
    await createTrial(db, expId, envId, sourceId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT id FROM Source' })
    );

    expect(result.rows.map((r) => r.id)).not.toContain(sourceId);
  });

  it('should show a source to a user who can access a referencing trial', async () => {
    const user = await createUser(db, 'dave', 'dave@test.com', 'hash');
    const projectId = await createProject(db, 'My Project');
    const expId = await createExperiment(db, projectId, 'Exp');
    const envId = await createEnvironment(db);
    const sourceId = await createSource(db);
    await createTrial(db, expId, envId, sourceId);
    await addMembership(db, user.id, projectId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT id FROM Source' })
    );

    expect(result.rows.map((r) => r.id)).toContain(sourceId);
  });
});

// ─── Measurement and Run ────────────────────────────────────────────────────

describe('RLS policy: Measurement and Run tables', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('rls_measurement_run');
  });

  afterAll(async () => db.close());
  afterEach(async () => db.rollback());

  async function buildChain(projectId: number) {
    const expId = await createExperiment(db, projectId, 'Exp');
    const envId = await createEnvironment(db);
    const sourceId = await createSource(db);
    const trialId = await createTrial(db, expId, envId, sourceId);
    const runId = await createRun(db);
    const criterionId = await createCriterion(db);
    await insertMeasurement(db, runId, trialId, criterionId);
    return { trialId, runId };
  }

  it('should hide measurements from a non-member', async () => {
    const user = await createUser(db, 'eve', 'eve@test.com', 'hash');
    const projectId = await createProject(db, 'Private Project');
    const { trialId } = await buildChain(projectId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT trialId FROM Measurement' })
    );

    expect(result.rows.map((r) => r.trialid)).not.toContain(trialId);
  });

  it('should show measurements to a project member', async () => {
    const user = await createUser(db, 'eve', 'eve@test.com', 'hash');
    const projectId = await createProject(db, 'My Project');
    const { trialId } = await buildChain(projectId);
    await addMembership(db, user.id, projectId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT trialId FROM Measurement' })
    );

    expect(result.rows.map((r) => r.trialid)).toContain(trialId);
  });

  it('should hide a run from a non-member with no accessible measurements', async () => {
    const user = await createUser(db, 'eve', 'eve@test.com', 'hash');
    const projectId = await createProject(db, 'Private Project');
    const { runId } = await buildChain(projectId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT id FROM Run' })
    );

    expect(result.rows.map((r) => r.id)).not.toContain(runId);
  });

  it('should show a run to a member whose measurements reference it', async () => {
    const user = await createUser(db, 'eve', 'eve@test.com', 'hash');
    const projectId = await createProject(db, 'My Project');
    const { runId } = await buildChain(projectId);
    await addMembership(db, user.id, projectId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT id FROM Run' })
    );

    expect(result.rows.map((r) => r.id)).toContain(runId);
  });
});

// ─── Timeline ───────────────────────────────────────────────────────────────

describe('RLS policy: Timeline table', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('rls_timeline');
  });

  afterAll(async () => db.close());
  afterEach(async () => db.rollback());

  it('should hide timeline rows from a non-member', async () => {
    const user = await createUser(db, 'frank', 'frank@test.com', 'hash');
    const projectId = await createProject(db, 'Private Project');
    const expId = await createExperiment(db, projectId, 'Exp');
    const envId = await createEnvironment(db);
    const sourceId = await createSource(db);
    const trialId = await createTrial(db, expId, envId, sourceId);
    const runId = await createRun(db);
    const criterionId = await createCriterion(db);
    await insertTimeline(db, runId, trialId, criterionId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT trialId FROM Timeline' })
    );

    expect(result.rows.map((r) => r.trialid)).not.toContain(trialId);
  });

  it('should show timeline rows to a project member', async () => {
    const user = await createUser(db, 'frank', 'frank@test.com', 'hash');
    const projectId = await createProject(db, 'My Project');
    const expId = await createExperiment(db, projectId, 'Exp');
    const envId = await createEnvironment(db);
    const sourceId = await createSource(db);
    const trialId = await createTrial(db, expId, envId, sourceId);
    const runId = await createRun(db);
    const criterionId = await createCriterion(db);
    await insertTimeline(db, runId, trialId, criterionId);
    await addMembership(db, user.id, projectId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT trialId FROM Timeline' })
    );

    expect(result.rows.map((r) => r.trialid)).toContain(trialId);
  });
});

// ─── ProfileData ───────────────────────────────────────────────────────────

describe('RLS policy: ProfileData table', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('rls_profiledata');
  });

  afterAll(async () => db.close());
  afterEach(async () => db.rollback());

  it('should hide profile data from a non-member', async () => {
    const user = await createUser(db, 'grace', 'grace@test.com', 'hash');
    const projectId = await createProject(db, 'Private Project');
    const expId = await createExperiment(db, projectId, 'Exp');
    const envId = await createEnvironment(db);
    const sourceId = await createSource(db);
    const trialId = await createTrial(db, expId, envId, sourceId);
    const runId = await createRun(db);
    await insertProfileData(db, runId, trialId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT trialId FROM ProfileData' })
    );

    expect(result.rows.map((r) => r.trialid)).not.toContain(trialId);
  });

  it('should show profile data to a project member', async () => {
    const user = await createUser(db, 'grace', 'grace@test.com', 'hash');
    const projectId = await createProject(db, 'My Project');
    const expId = await createExperiment(db, projectId, 'Exp');
    const envId = await createEnvironment(db);
    const sourceId = await createSource(db);
    const trialId = await createTrial(db, expId, envId, sourceId);
    const runId = await createRun(db);
    await insertProfileData(db, runId, trialId);
    await addMembership(db, user.id, projectId);

    const result = await db.withUserContext(user.id, () =>
      db.query({ text: 'SELECT trialId FROM ProfileData' })
    );

    expect(result.rows.map((r) => r.trialid)).toContain(trialId);
  });
});

// ─── Cross-project isolation ────────────────────────────────────────────────

describe('RLS policy: cross-project isolation', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    db = await createAndInitializeDB('rls_cross_project');
  });

  afterAll(async () => db.close());
  afterEach(async () => db.rollback());

  it('should only expose data from projects the user is a member of', async () => {
    const user = await createUser(db, 'henry', 'henry@test.com', 'hash');

    const ownedProjectId = await createProject(db, 'Owned Project');
    const otherProjectId = await createProject(db, 'Other Project');

    const ownedExpId = await createExperiment(db, ownedProjectId, 'Owned Exp');
    const otherExpId = await createExperiment(db, otherProjectId, 'Other Exp');

    const envId = await createEnvironment(db);
    const sourceId = await createSource(db);
    const ownedTrialId = await createTrial(db, ownedExpId, envId, sourceId);
    const otherTrialId = await createTrial(db, otherExpId, envId, sourceId);

    await addMembership(db, user.id, ownedProjectId);

    const projectIds = await db.withUserContext(user.id, async () => {
      const r = await db.query({ text: 'SELECT id FROM Project' });
      return r.rows.map((row) => row.id);
    });
    expect(projectIds).toContain(ownedProjectId);
    expect(projectIds).not.toContain(otherProjectId);

    const expIds = await db.withUserContext(user.id, async () => {
      const r = await db.query({ text: 'SELECT id FROM Experiment' });
      return r.rows.map((row) => row.id);
    });
    expect(expIds).toContain(ownedExpId);
    expect(expIds).not.toContain(otherExpId);

    const trialIds = await db.withUserContext(user.id, async () => {
      const r = await db.query({ text: 'SELECT id FROM Trial' });
      return r.rows.map((row) => row.id);
    });
    expect(trialIds).toContain(ownedTrialId);
    expect(trialIds).not.toContain(otherTrialId);
  });
});

afterAll(async () => closeMainDb());
