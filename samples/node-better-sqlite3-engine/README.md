# Node.js — using better-sqlite3 as the SQLite engine

This sample shows that `cdb-converter` isn't tied to `sql.js` or the bundled `node:sqlite` adapter: [`engine.js`](./engine.js) is a small hand-written `SqlEngine`/`SqlDatabase` adapter wrapping [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3), used as a drop-in replacement for `initSqlJs()`.

Unlike the `node:sqlite` adapter, this one is **not shipped by `cdb-converter`** — `better-sqlite3` is a native dependency (requires `node-gyp`/prebuilt bindings) that most consumers don't need, so it's kept out of the main package and lives only in this sample.

## What it does

- Read a `.cdb` file from disk
- Convert it with `cdbToSql`, passing `betterSqlite3Engine` instead of a `sql.js` module
- Print detected table names from `DB_STRUCTURE`

## Prerequisites

- Install dependencies from the repository root: `npm install`
- Build the library from the repository root: `npm run build`
- Install this sample's own dependency: `npm install` from within `samples/node-better-sqlite3-engine/`

## Usage

From the repository root:

```bash
node samples/node-better-sqlite3-engine/index.js <input.cdb>
```

## Example

```bash
node samples/node-better-sqlite3-engine/index.js ./Career_1.cdb
```

## Adapting other engines

See [`engine.js`](./engine.js) for the adapter shape. Any object matching `SqlEngine`/`SqlDatabase` (exported from `cdb-converter`) works the same way — `sqlite3`, `wa-sqlite`, `absurd-sql`, etc. can be wired up on the same principle.
