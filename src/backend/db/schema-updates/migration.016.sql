BEGIN;

ALTER POLICY project_access ON Project
  USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
      WHERE pm.projectId = Project.id
        AND pm.userId = app_current_user_id()
    )
  );

ALTER POLICY experiment_access ON Experiment
  USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
      WHERE pm.projectId = Experiment.projectId
        AND pm.userId = app_current_user_id()
    )
  );

ALTER POLICY trial_access ON Trial
  USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Experiment e ON e.id = Trial.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

ALTER POLICY run_access ON Run
  USING (
    EXISTS (
      SELECT 1 FROM Measurement m
        JOIN Trial t ON t.id = m.trialId
        JOIN Experiment e ON e.id = t.expId
        JOIN ProjectMembership pm ON pm.projectId = e.projectId
      WHERE m.runId = Run.id
        AND pm.userId = app_current_user_id()
    )
  );

ALTER POLICY measurement_access ON Measurement
  USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Trial t ON t.id = Measurement.trialId
        JOIN Experiment e ON e.id = t.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

ALTER POLICY timeline_access ON Timeline
  USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Trial t ON t.id = Timeline.trialId
        JOIN Experiment e ON e.id = t.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

ALTER POLICY source_access ON Source
  USING (
    EXISTS (
      SELECT 1 FROM Trial t
        JOIN Experiment e ON e.id = t.expId
        JOIN ProjectMembership pm ON pm.projectId = e.projectId
      WHERE t.sourceId = Source.id
        AND pm.userId = app_current_user_id()
    )
  );

ALTER POLICY profiledata_access ON ProfileData
  USING (
    EXISTS (
      SELECT 1 FROM ProjectMembership pm
        JOIN Trial t ON t.id = ProfileData.trialId
        JOIN Experiment e ON e.id = t.expId
      WHERE pm.projectId = e.projectId
        AND pm.userId = app_current_user_id()
    )
  );

INSERT INTO SchemaVersion (version, updateDate) VALUES (15, now());

COMMIT;
