-- add slug column
ALTER TABLE Project ADD COLUMN slug varchar unique;

-- populate the slug column by replacing all non-save-characters with a dash
UPDATE Project SET slug = regexp_replace(name, '[^0-9a-zA-Z-]', '-', 'g');
