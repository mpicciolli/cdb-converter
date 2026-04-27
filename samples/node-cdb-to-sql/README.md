# Node.js CDB to SQLite sample

This sample converts a Pro Cycling Manager `.cdb` file into a SQLite database file from the command line.

## What it does

- Read a `.cdb` file from disk
- Convert it with `cdbToSql`
- Write the resulting `.sqlite` file
- Print detected table names from `DB_STRUCTURE`

## Prerequisites

- Node.js 22+
- Install dependencies from the repository root: `npm install`
- Build the library from the repository root: `npm run build`

## Usage

From the repository root:

```bash
node samples/node-cdb-to-sql/index.js <input.cdb> [output.sqlite]
```

If `output.sqlite` is omitted, the sample writes the output next to the input file with the `.sqlite` extension.

## Example

```bash
node samples/node-cdb-to-sql/index.js ./Career_1.cdb ./Career_1.sqlite
```