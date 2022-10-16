-- Add a position column, which is now used to order the projects
-- where ever db.getAllProjects() is used
ALTER TABLE Project ADD COLUMN position integer DEFAULT 0;
