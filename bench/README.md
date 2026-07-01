# Benchmarks

Reproducible performance and size numbers for `cdb-converter`.

## Running

```bash
npm run build        # bench imports from dist/
npm run bench        # text output over all official fixtures
npm run bench -- --md              # Markdown table (used below)
npm run bench -- --iterations 20   # more iterations
npm run bench -- path/to/save.cdb  # a specific CDB file
```

The script runs a warmup, then reports the **median** of N timed iterations, so a single
cold outlier (JIT warm-up, sql.js/WASM init) does not skew the result.

## Conversion performance

Round-trip timings against the official Pro Cycling Manager databases, median of 10
iterations after warmup.

| Fixture                  | Input (CDB) | Tables |   Rows | cdbToSql | sqlToCdb | Round-trip |
| ------------------------ | ----------: | -----: | -----: | -------: | -------: | ---------: |
| OfficialRelease-2014.cdb |      355 kB |    136 | 31,741 | 131.7 ms | 119.6 ms |   251.3 ms |
| OfficialRelease-2018.cdb |      566 kB |    150 | 62,127 | 167.8 ms | 198.5 ms |   366.3 ms |
| OfficialRelease-2019.cdb |      610 kB |    158 | 64,560 | 179.5 ms | 210.0 ms |   389.5 ms |
| OfficialRelease-2021.cdb |      417 kB |    147 | 36,672 | 133.6 ms | 130.7 ms |   264.3 ms |
| OfficialRelease-2025.cdb |      441 kB |    149 | 34,691 | 140.5 ms | 145.7 ms |   286.2 ms |

- **cdbToSql** — decompress + parse the CDB binary into an in-memory SQLite database.
- **sqlToCdb** — serialize the SQLite database back to compressed CDB bytes.
- **Round-trip** — `cdbToSql + sqlToCdb`. sql.js `db.export()` (SQLite → bytes) is
  negligible (~0.5 ms) and omitted from the total.

Most of the time is spent in binary parsing/writing, not in SQLite itself.

## Bundle size

The converter's own code is tiny; the footprint you actually ship is dominated by the
SQLite engine it depends on.

| Component                       | Size                                     |
| ------------------------------- | ---------------------------------------- |
| cdb-converter (published, gzip) | **~28 kB** (npm tarball)                 |
| `sql.js` WebAssembly runtime    | ~644 kB (`sql-wasm.wasm`, loaded lazily) |
| `pako` (zlib deflate/inflate)   | small, tree-shakeable                    |

The library itself adds only a few kilobytes. The SQLite WASM binary is the real weight,
and you would pay for it with any SQLite-in-JS approach. In the browser the `.wasm` is
fetched on demand (not part of your JS bundle); in Node.js it is loaded from
`node_modules` at runtime.
