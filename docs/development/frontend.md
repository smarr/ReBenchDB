# Frontend

The frontend, i.e., the code that runs in the browser, is implemented with a
somewhat "classic" approach, trying to be in some sense of the word "low tech",
while using mature/boring libraries to make this approach a bit more convenient.

## TypeScript

The frontend is implemented in TypeScript.
During development, the builtin server will serve the JS files directly
from the `/dist` folder, and `npm run nodemon` in combination with
`npm run watch` works as one would expect.

See `/src/index.ts` where `serveStaticResource` is used, which is implemented
under `/src/backend/dev-server/server.ts`.

When testing with Docker, the Dockerfile triggers `npm run compile`,
which ensures all files are in the expected place.

## JQuery

For the interaction with the DOM, we are generally using JQuery.
Thus, instead of using `document.querySelectorAll('#id')` or similar,
we use `$('#id')`.

JQuery allows for fairly concise code.

## Serve-Side Page Generation

For each page, we decide ad hoc, whether the data is queried and rendered
on the server, or whether we add a JSON-based API endpoint, and
render the page in the browser.

I am not sure, that there is a consistently applied design principle right now.
But, when ever we can do it on the server, without obvious drawbacks, it means
we do not need to expose raw data via JSON, and have an endpoint less that
we have to worry about. So, in some ways, that's preferred.

However, some database queries are known to take more time. For these cases,
requesting the data via an API endpoint as JSON is preferred.

## API End Points

The API end points are defined as routes in `/src/index.ts` and recognizable
by the `get*AsJson` function names.

The `get*AsJson` functions wrap the HTTP aspect and the data retrieval is done
by a specific method, for instance `getProfileAsJson(.)` uses `getProfile(.)`.
The types for the data are defined in `/src/shared/view-types.ts`, which is
also used by the backend. Thus, types that are used to communicate between
frontend and backend should be defined only once in `view-types.ts`.
