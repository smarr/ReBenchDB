## General Things to think about

- [ ] I don't like the code in admin.ts. The network interaction is verbose and not really abstracted, and does not match the style used elsewhere in the frontend
- [ ] the newly added frontend code uses custom helper methods all over instead of just using JQuery
- [ ] add test for accepting data without access token
      - I commented that code out, and it's not failing tests
- [ ] fix migration script to be migration 15
- [ ] do we need to merge migration scripts?
- [ ] test migration on smde-rdb
- [ ] benchmark this on smde-rdb with SOM++
- [ ] fix integration test on Github Actions
- [ ] investigate the solution for user tokens for uploading data
- [ ] think about whether we may want to allow token-less use, perhaps a ReBenchDB instance can be configured as "open" for convenience, or a specific project can be configured as open
- [ ] now that there's a user concept, do we want to have a statistics page per user?
- [ ] do we want to support quotas per user?
- [ ] the refreshing of reports now should be simply a button that require's the users authentication
- [ ] make sure REFRESH_SECRET is not a thing anymore
- [ ] users should be able to say that a project is public or private

## PR Splitting?

- [ ] move .dockerignore to misc PR?
- [ ] package.json @types/ejs or remove

## Reviewing Status

- [x] .dockerignore

- [ ] src/backend/admin/admin-db.ts
- [ ] src/backend/admin/admin-routes.ts
- [ ] src/backend/admin/admin.html
- [ ] src/backend/admin/group-db.ts
- [ ] src/backend/admin/operations.ts
- [ ] src/backend/auth/auth-db.ts
- [ ] src/backend/auth/auth-middleware.ts
- [ ] src/backend/auth/auth-routes.ts
- [ ] src/backend/auth/login.html
- [ ] src/backend/compare/report.ts
- [ ] src/backend/db/database-with-pool.ts
- [ ] src/backend/db/db.sql
- [ ] src/backend/db/db.ts
- [ ] src/backend/db/schema-updates/migration.014.sql
- [ ] src/backend/db/schema-updates/migration.016.sql
- [ ] src/backend/github/github.ts
- [ ] src/backend/perf-tracker.ts
- [ ] src/backend/rebench/results.ts
- [ ] src/backend/timeline/timeline-calc.ts
- [ ] src/backend/timeline/timeline.ts
- [ ] src/backend/util.ts
- [ ] src/frontend/admin.ts
- [ ] src/frontend/login.ts
- [ ] src/index.ts
- [ ] src/shared/api.ts
- [ ] src/views/common-menu.html


- [ ] tests/backend/db/auth-db.test.ts
- [ ] tests/backend/db/db-setup.test.ts
- [ ] tests/backend/db/db-testing.ts
- [ ] tests/backend/db/db.test.ts
- [ ] tests/backend/db/rls.test.ts
- [ ] tests/backend/timeline/timeline-calc.test.ts
- [ ] tests/data/expected-results/main/index.html
- [ ] tests/data/expected-results/project/get-exp-data.html
- [ ] tests/data/expected-results/project/project-data.html

## Files need to be revisited after other TODOs

- [ ] .github/workflows/ci.yml
- [ ] docker-compose.yml
- [ ] package.json