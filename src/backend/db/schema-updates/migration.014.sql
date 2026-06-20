-- migration.014.sql
-- Adds user authentication, project-level Row Level Security,
-- and user groups for batch-assigning users to projects.
--
-- Post-migration manual steps required (run as superuser):
--   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rdb_app;
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rdb_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO rdb_app;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT USAGE, SELECT ON SEQUENCES TO rdb_app;
--   -- Set a password for rdb_app if it will be used for direct connections:
--   -- ALTER ROLE rdb_app WITH PASSWORD '...';

BEGIN;

-- ============================================================
-- 1. ENUM type for membership roles
-- ============================================================
CREATE TYPE projectRole AS ENUM ('view', 'edit', 'owner');

-- ============================================================
-- 2. Application user table (local auth, no SSO)
-- ============================================================
CREATE TABLE AppUser (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL UNIQUE,
  email         VARCHAR(255) NOT NULL UNIQUE,
  "passwordHash" VARCHAR(255) NOT NULL,
  "apiToken"     VARCHAR(64) UNIQUE NULL,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "isActive"     BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- 3. Project membership (user <-> project with role)
-- ============================================================
CREATE TABLE ProjectMembership (
  userId    INTEGER NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  projectId INTEGER NOT NULL REFERENCES Project(id) ON DELETE CASCADE,
  role      projectRole NOT NULL DEFAULT 'view',
  PRIMARY KEY (userId, projectId)
);

CREATE INDEX projectmembership_projectid_idx ON ProjectMembership (projectId);

-- ============================================================
-- 4. User groups (for batch-assigning users to projects)
--    Groups are a snapshot mechanism: assigning a group to a
--    project bulk-inserts all current group members into
--    ProjectMembership.
-- ============================================================
CREATE TABLE UserGroup (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  "createdBy" INTEGER REFERENCES AppUser(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE UserGroupMembership (
  userId  INTEGER NOT NULL REFERENCES AppUser(id) ON DELETE CASCADE,
  groupId INTEGER NOT NULL REFERENCES UserGroup(id) ON DELETE CASCADE,
  PRIMARY KEY (userId, groupId)
);

CREATE INDEX usergroupmembership_groupid_idx ON UserGroupMembership (groupId);

-- ============================================================
-- 5. Dedicated non-superuser DB role for the application.
--    The backend will SET LOCAL ROLE rdb_app inside each
--    user-facing transaction so that RLS policies fire even
--    when the pool connects as the DB owner / superuser.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rdb_app') THEN
    CREATE ROLE rdb_app LOGIN;
  END IF;
END$$;

-- ============================================================
-- 6. Enable Row Level Security on all relevant tables.
--    FORCE ensures the table owner / superuser is also filtered
--    when SET LOCAL ROLE rdb_app is in effect.
-- ============================================================
ALTER TABLE Project         ENABLE ROW LEVEL SECURITY;
ALTER TABLE Experiment      ENABLE ROW LEVEL SECURITY;
ALTER TABLE Trial           ENABLE ROW LEVEL SECURITY;
ALTER TABLE Run             ENABLE ROW LEVEL SECURITY;
ALTER TABLE Measurement     ENABLE ROW LEVEL SECURITY;
ALTER TABLE Timeline        ENABLE ROW LEVEL SECURITY;
ALTER TABLE Source          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ProfileData     ENABLE ROW LEVEL SECURITY;

ALTER TABLE Project         FORCE ROW LEVEL SECURITY;
ALTER TABLE Experiment      FORCE ROW LEVEL SECURITY;
ALTER TABLE Trial           FORCE ROW LEVEL SECURITY;
ALTER TABLE Run             FORCE ROW LEVEL SECURITY;
ALTER TABLE Measurement     FORCE ROW LEVEL SECURITY;
ALTER TABLE Timeline        FORCE ROW LEVEL SECURITY;
ALTER TABLE Source          FORCE ROW LEVEL SECURITY;
ALTER TABLE ProfileData     FORCE ROW LEVEL SECURITY;

-- ============================================================
-- 7. Helper function to read the session-local user ID.
--    SECURITY DEFINER so rdb_app can call current_setting.
-- ============================================================
CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS INTEGER
  LANGUAGE sql STABLE SECURITY DEFINER AS
$$
  SELECT NULLIF(current_setting('app.currentUserId', true), '')::INTEGER;
$$;

-- ============================================================
-- 8. RLS policies
--
--    All user-facing routes are protected by requireAuth which
--    sets app.currentUserId via withUserContext.
--    Machine-to-machine endpoints (PUT /rebenchdb/results) run
--    as the pool superuser without SET ROLE, so they bypass
--    RLS entirely and are unaffected by these policies.
-- ============================================================

-- Project: direct membership check
CREATE POLICY project_access ON Project
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
      WHERE pm.projectId = Project.id
        AND pm.userId = app_current_user_id()
    )
  );

-- Experiment: linked to Project via projectId
CREATE POLICY experiment_access ON Experiment
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
      WHERE pm.projectId = Experiment.projectId
        AND pm.userId = app_current_user_id()
    )
  );

-- Trial: Experiment.projectId
CREATE POLICY trial_access ON Trial
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Experiment e ON e.id = Trial.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

-- Run: not directly project-scoped; visible if any accessible
--      Trial references it through Measurement.
CREATE POLICY run_access ON Run
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM Measurement m
        JOIN Trial t ON t.id = m.trialId
        JOIN Experiment e ON e.id = t.expId
        JOIN ProjectMembership pm ON pm.projectId = e.projectId
      WHERE m.runId = Run.id
        AND pm.userId = app_current_user_id()
    )
  );

-- Measurement: Trial -> Experiment -> Project
CREATE POLICY measurement_access ON Measurement
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Trial t ON t.id = Measurement.trialId
        JOIN Experiment e ON e.id = t.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

-- Timeline: same join path as Measurement
CREATE POLICY timeline_access ON Timeline
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Trial t ON t.id = Timeline.trialId
        JOIN Experiment e ON e.id = t.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

-- Source: shared across projects; visible if any accessible
--         Trial references it.
CREATE POLICY source_access ON Source
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM Trial t
        JOIN Experiment e ON e.id = t.expId
        JOIN ProjectMembership pm ON pm.projectId = e.projectId
      WHERE t.sourceId = Source.id
        AND pm.userId = app_current_user_id()
    )
  );

-- ProfileData: same join path as Measurement
CREATE POLICY profiledata_access ON ProfileData
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Trial t ON t.id = ProfileData.trialId
        JOIN Experiment e ON e.id = t.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

-- ============================================================
-- 9. Grants for rdb_app so RLS policies can be tested and enforced.
--    rdb_app needs SELECT (and write) on all tables so that
--    SET LOCAL ROLE rdb_app does not produce permission errors
--    before the RLS filter is applied.
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rdb_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rdb_app;

-- ============================================================
-- 10. Schema version bump
-- ============================================================
INSERT INTO SchemaVersion (version, updateDate) VALUES (14, now());

COMMIT;
