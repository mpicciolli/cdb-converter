# Node.js SQLite to CDB sample

This sample converts a SQLite database file back into a Pro Cycling Manager `.cdb` file from the command line.

## What it does

- Read a `.sqlite` or `.db` file from disk
- Open it with `sql.js`
- Convert it with `sqlToCdb`
- Write the generated `.cdb` file

## Prerequisites

- Node.js 22+
- Install dependencies from the repository root: `npm install`
- Build the library from the repository root: `npm run build`

## Usage

From the repository root:

```bash
node samples/node-sql-to-cdb/index.js <input.sqlite> [output.cdb]
```

If `output.cdb` is omitted, the sample writes the output next to the input file with the `.cdb` extension.

## Example

```bash
node samples/node-sql-to-cdb/index.js ./save.sqlite ./save.cdb
```
