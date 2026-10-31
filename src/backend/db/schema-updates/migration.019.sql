-- From now on, record the version of the database schema.
CREATE TABLE SchemaVersion (
  -- ensures that there is only a single row
  id boolean primary key default true check (id),
  version integer NOT NULL
);

INSERT INTO SchemaVersion (version) VALUES (19);
