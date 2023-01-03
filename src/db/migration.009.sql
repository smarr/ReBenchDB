-- Add a column to indicate whether we want notifications on github for this
-- project.
ALTER TABLE Project ADD COLUMN githubNotification bool DEFAULT true;
