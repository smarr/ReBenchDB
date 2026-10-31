# Backend

Under `src/backend`, the code is separated a bit by the "pages" of the frontend,
so, end-user visible functionality, and by implementation concerns.

Functionality that may be used by multiple parts of the backend, can be provided
by files directly in `backend`.

The different features typically consist of some server-side TypeScript code
and one or more HTML fragments that use the EJS template engine.

The `backend/db` feature groups the main interactions with the database, contains the
initial structure of the DB in `db.sql`, as well as SQL scripts that perform
schema updates. These scripts are run manually, and there's currently no
migration infrastructure, but we check versioning as below.

The `src/index.ts` file defines the routes to make the different features
accessible to the user.


## Database Versioning

In `db.sql`, we explicitly keep a version, and it needs to match
the migration files in `db/schema-updates/`.

When changing the database schema, we need to:

1. add a new `db/schema-updates/migration.NNN.sql`, with NNN the next number
2. the file needs to have `UPDATE SchemaVersion SET version = NNN;`
3. and the updated `db.sql`, needs to set the version to NNN, too

`tests/backend/db/schema-version.test.ts` checks that these numbers agree.
