# Repository Layout

The implementation is in the `/src` folder. Tests are implemented in `/tests`.

## 1. General Structure of Source under /src

- `backend` TypeScript code running on the server
- `frontend` TypeScript code that runs on the client/browser
- `shared` helper functions and type definitions shared by frontend and backend
- `views` contains HTML fragments used by multiple features


## 2. Benchmarks

The `src/benchmarks` folder provides a few integration-level benchmarks that
can be used to assess end-to-end performance.

These are run in our CI setup using ReBench and the `/rebench.conf`
configuration file. Thus, ReBenchDB is benchmarking and tracking itself.

## 3. Vendored

The `src/vendored` folder contains upstream dependencies that had to be
integrated for practical purposes.

## 4. Patches

The `/patches` folder contains in-repo maintained customizations of NPM packages,
where the vendoring did not seem necessary.

## 5. Resources

The `/resources` folder contains the `style.css` file and is used to store
the compilation results and files that need to be accessible by the frontend.
