-- Adding Support for Users, Groups, and Namespaces
CREATE TABLE UserAccount (
  id serial primary key,
  userName varchar unique, -- has to be a valid `slug`
  email varchar unique,
  passwordHash varchar,
  apiToken char(64) NULL,
  createdAt timestamp with time zone DEFAULT now(),
  isActive bool NOT NULL DEFAULT true -- deactivated users cannot log in
);

CREATE TABLE UserGroup (
  id serial primary key,
  groupName varchar unique, -- has to be a valid `slug`
  description text,
  createdAt timestamp with time zone DEFAULT now(),
  createdBy int REFERENCES UserAccount (id)
);

-- A Namespace is either a user account or user group, and ensures that
-- there are no name collisions between users and groups.
CREATE TABLE Namespace (
  id serial primary key,
  name varchar unique NOT NULL, -- has to be a valid `slug`
  type char(1) CHECK (type IN ('u', 'g')),
  accountId int NULL REFERENCES UserAccount (id),
  groupId int NULL REFERENCES UserGroup (id),

  CONSTRAINT eitherAccountOrGroup CHECK (
    (accountId IS NOT NULL AND groupId IS     NULL AND type = 'u') OR
    (accountId IS     NULL AND groupId IS NOT NULL AND type = 'g')
  )
);

ALTER TABLE Project
  ADD COLUMN namespaceId int REFERENCES Namespace (id);
ALTER TABLE UserAccount
  ADD COLUMN namespaceId int REFERENCES Namespace (id);
ALTER TABLE UserGroup
  ADD COLUMN namespaceId int REFERENCES Namespace (id);

CREATE TYPE projectRole AS ENUM ('view', 'edit', 'owner');

CREATE TABLE ProjectPermissions (
  projectId int REFERENCES Project (id),
  namespaceId int REFERENCES Namespace (id),
  role projectRole NOT NULL,
  PRIMARY KEY (projectId, namespaceId)
);

-- The admin account owns the legacy group.
-- Because Authentication is not yet implemented, the admin account has no password hash, so it cannot log in.
INSERT INTO UserAccount (userName) VALUES ('admin');
INSERT INTO Namespace (name, type, accountId)
  SELECT userName, 'u', id FROM UserAccount WHERE userName = 'admin';
UPDATE UserAccount
  SET namespaceId = (SELECT id FROM Namespace WHERE name = 'admin')
  WHERE userName = 'admin';

-- Old projects that were created before users and groups existed belong to the legacy group.
INSERT INTO UserGroup (groupName, description, createdBy)
  SELECT 'legacy', 'Projects created before users and groups existed', id
  FROM UserAccount WHERE userName = 'admin';
INSERT INTO Namespace (name, type, groupId)
  SELECT groupName, 'g', id FROM UserGroup WHERE groupName = 'legacy';
UPDATE UserGroup
  SET namespaceId = (SELECT id FROM Namespace WHERE name = 'legacy')
  WHERE groupName = 'legacy';


-- Update all existing projects to belong to the legacy group,
-- and make the namespaceId column non-nullable.
UPDATE Project
  SET namespaceId = (SELECT id FROM Namespace WHERE name = 'legacy');
ALTER TABLE Project ALTER COLUMN namespaceId SET NOT NULL;
