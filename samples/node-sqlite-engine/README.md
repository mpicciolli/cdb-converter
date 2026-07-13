# Node.js — swapping the SQLite engine

This sample shows that `cdb-converter` isn't tied to `sql.js`: [`engine.js`](./engine.js) is a small hand-written `SqlEngine`/`SqlDatabase` adapter wrapping Node's built-in `node:sqlite`, used as a drop-in replacement for `initSqlJs()`.

## What it does

- Read a `.cdb` file from disk
- Convert it with `cdbToSql`, passing `nodeSqliteEngine` instead of a `sql.js` module
- Print detected table names from `DB_STRUCTURE`

## Prerequisites

- Node.js 24.16.0+ or 26.1.0+ (required by `node:sqlite`'s `serialize()`/`deserialize()`)
- Install dependencies from the repository root: `npm install`
- Build the library from the repository root: `npm run build`
- Optional, for editor type-checking of `engine.js` (`@ts-check`): install this sample's own dev dependency with `npm install` from within `samples/node-sqlite-engine/`

## Usage

From the repository root:

```bash
node samples/node-sqlite-engine/index.js <input.cdb>
```

## Example

```bash
node samples/node-sqlite-engine/index.js ./Career_1.cdb
```

## Adapting other engines

See [`engine.js`](./engine.js) for the adapter shape. Any object matching `SqlEngine`/`SqlDatabase` (exported from `cdb-converter`) works the same way — `better-sqlite3` (see the [`node-better-sqlite3-engine`](../node-better-sqlite3-engine) sample), `wa-sqlite`, `absurd-sql`, etc. can be wired up on the same principle.
