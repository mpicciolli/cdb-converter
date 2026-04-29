# cdb-converter

TypeScript library for converting Pro Cycling Manager CDB database files to/from SQLite and other formats. Lightweight, isomorphic (works in Node.js and browser), and zero-configuration.

> Based on [agfor/pcmdbedit](https://github.com/agfor/pcmdbedit/) — many thanks to agfor for the foundational work.

## Features

- ✅ **CDB ↔ SQLite** - Convert between binary CDB format and SQLite databases
- ✅ **TypeScript** - Native type definitions, full IDE support
- ✅ **Isomorphic** - Works in Node.js and browser environments (via sql.js)
- ✅ **Lightweight** - Minimal dependencies (pako, sql.js only)
- ✅ **Tree-shakeable** - Pure functions, no side effects
- ✅ **Preserves metadata** - Round-trip conversion maintains all table/column information

## Installation

```bash
npm install cdb-converter
```

## Samples

Example projects are available in the [samples](./samples/) folder:

- [Browser sample](./samples/browser/) - Convert a `.cdb` file to SQLite directly in the browser
- [Node.js CDB to SQLite sample](./samples/node-cdb-to-sql/) - Convert a `.cdb` file into a `.sqlite` file from the command line
- [Node.js SQLite to CDB sample](./samples/node-sql-to-cdb/) - Convert a `.sqlite` or `.db` file back into a `.cdb` file from the command line

## Quick Start

### Convert CDB to SQLite

```typescript
import { cdbToSql } from "cdb-converter";
import initSqlJs from "sql.js";

const SQL = await initSqlJs();

// Read CDB file
const cdbBuffer = fs.readFileSync("save.cdb");

// Convert to SQLite
const db = cdbToSql(cdbBuffer, SQL);

// Query the database
const result = db.exec("SELECT * FROM Teams LIMIT 5");
console.log(result[0].values);

// Export to SQLite file
const sqliteData = db.export();
fs.writeFileSync("save.db", sqliteData);
```

### Convert SQLite back to CDB

```typescript
import initSqlJs from "sql.js";
import { sqlToCdb } from "cdb-converter";

const SQL = await initSqlJs({
  locateFile: (filename) =>
    `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${filename}`,
});

// Load SQLite database
const sqliteBuffer = fs.readFileSync("save.db");
const db = new SQL.Database(sqliteBuffer);

// Convert back to CDB
const cdbBuffer = sqlToCdb(db);

// Save as CDB
fs.writeFileSync("save.cdb", cdbBuffer);
```

### Compression

The library automatically handles CDB compression (zlib deflate):

```typescript
import { compressCdb, decompressCdb } from "cdb-converter";

const compressed = compressCdb(cdbData);
const decompressed = decompressCdb(compressed);
```

## Supported Data Types

The library preserves all CDB data types during conversion:

| Type          | Description       | Example         |
| ------------- | ----------------- | --------------- |
| INTEGER       | 32-bit signed     | 42              |
| FLOAT         | IEEE 754 float32  | 3.14            |
| STRING        | UTF-8 text        | "cyclist"       |
| BOOLEAN       | Bit-packed        | true/false      |
| INTEGER_BYTE  | 8-bit signed      | -128 to 127     |
| INTEGER_SHORT | 16-bit unsigned   | 0 to 65535      |
| FLOAT_LIST    | Array of floats   | "(1.5,2.3,3.7)" |
| INTEGER_LIST  | Array of integers | "(10,20,30)"    |

## API Reference

### `cdbToSql(cdbBuffer: ArrayBuffer | Uint8Array, SQL: SqlJsStatic): Database`

Convert CDB binary data to SQLite database instance.

You must pass the initialized `sql.js` module returned by `initSqlJs()`. This library does not initialize `sql.js` internally because that setup is asynchronous and environment-specific: the caller controls how the wasm file is loaded in Node.js or in the browser, and `cdbToSql` only needs the ready-to-use `Database` constructor exposed by that module.

- **cdbBuffer**: Raw CDB binary data (compressed or uncompressed)
- **SQL**: sql.js instance from `initSqlJs()`
- **returns**: sql.js Database instance with CDB tables loaded

### `sqlToCdb(db: Database): ArrayBuffer`

Convert SQLite database back to CDB binary format (automatically compressed).

- **db**: sql.js Database instance
- **returns**: Compressed CDB binary data (ArrayBuffer)

### `compressCdb(data: ArrayBuffer | Uint8Array): ArrayBuffer`

Compress CDB data using zlib deflate.

### `decompressCdb(data: ArrayBuffer | Uint8Array): ArrayBuffer`

Decompress CDB data (handles both compressed and uncompressed input).

## Metadata Preservation

The library uses a special `DB_STRUCTURE` table to preserve CDB metadata:

```sql
CREATE TABLE DB_STRUCTURE (
  TableName TEXT,
  ID INTEGER
)
```

Table flags and column indices are preserved in the database object for round-trip conversion.

## Browser Usage

```html
<script src="https://cdn.jsdelivr.net/npm/sql.js@1.10.2/dist/sql-wasm.js"></script>
<script type="module">
  import {
    cdbToSql,
    sqlToCdb,
  } from "https://cdn.jsdelivr.net/npm/cdb-converter";

  // Initialize sql.js
  const SQL = await initSqlJs();

  // Read CDB from file input
  const file = document.getElementById("cdb-input").files[0];
  const cdbBuffer = await file.arrayBuffer();

  // Convert and use
  const db = cdbToSql(cdbBuffer, SQL);
  console.log(
    "Tables:",
    db.exec("SELECT * FROM sqlite_master WHERE type='table'"),
  );
</script>
```

## License

MIT - See [LICENSE.md](./LICENSE.md) for details.
