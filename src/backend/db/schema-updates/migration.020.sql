-- A source is identified by commit, branch, and repository,
-- so that a commit benchmarked on multiple branches gets a source per branch.
ALTER TABLE Source
  DROP CONSTRAINT source_commitid_key,
  ADD CONSTRAINT source_commitid_branchortag_repourl_key
    UNIQUE NULLS NOT DISTINCT (commitId, branchOrTag, repoURL);

-- With more sources, the smallint sourceId would overflow sooner.
ALTER TABLE Trial
  ALTER COLUMN sourceId TYPE int;

UPDATE SchemaVersion SET version = 20;
