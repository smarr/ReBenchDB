CREATE TABLE SchemaVersion (
  updateDate timestamp with time zone,
  version smallint primary key
);

INSERT INTO SchemaVersion (version, updateDate) VALUES (1, now());

ALTER TABLE Project ADD COLUMN showChanges bool;

ALTER TABLE Project ADD COLUMN allResults bool;

UPDATE Project SET showChanges = true, allResults = false WHERE name = 'SOMns';
UPDATE Project SET showChanges = false, allResults = true WHERE name = 'ReBenchDB Self-Tracking';

