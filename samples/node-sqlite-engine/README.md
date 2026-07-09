# Node.js — swapping the SQLite engine

This sample shows that `cdb-converter` isn't tied to `sql.js`: it uses the bundled `node:sqlite` adapter (`cdb-converter/adapters/node-sqlite`) as a drop-in replacement for `initSqlJs()`.

## What it does

- Read a `.cdb` file from disk
- Convert it with `cdbToSql`, passing `nodeSqliteEngine` instead of a `sql.js` module
- Print detected table names from `DB_STRUCTURE`

## Prerequisites

- Node.js 26.1.0+ (required by `node:sqlite`'s `serialize()`/`deserialize()`)
- Install dependencies from the repository root: `npm install`
- Build the library from the repository root: `npm run build`

## Usage

From the repository root:

```bash
node samples/node-sqlite-engine/index.js <input.cdb>
```

## Example

```bash
node samples/node-sqlite-engine/index.js ./Career_1.cdb
```

## Using your own engine

Any object matching the `SqlEngine`/`SqlDatabase` interfaces exported from `cdb-converter` works in place of `sql.js`. See [`src/adapters/node-sqlite.ts`](../../src/adapters/node-sqlite.ts) for a reference implementation to adapt to other engines (e.g. `better-sqlite3`, `wa-sqlite`).
