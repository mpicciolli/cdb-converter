# Benchmarks

Reproducible performance and size numbers for `cdb-converter`.

## Running

The benchmarks run through [`vitest bench`](https://vitest.dev/guide/features.html#benchmarking), which handles warmup,
iteration counts and statistics (mean, p99, ops/sec, margin of error) automatically. They
import from `src/`, so no build step is required.

```bash
npm run bench                          # all official fixtures
npm run bench -- --outputJson out.json # machine-readable results
```

Each case is warmed up before timing, so a cold outlier (JIT warm-up, sql.js/WASM init)
does not skew the result.

## Conversion performance

Round-trip timings against the official Pro Cycling Manager databases (`mean` reported by
`vitest bench`).

| Fixture                  | Input (CDB) | Tables |   Rows | cdbToSql | sqlToCdb | Round-trip |
| ------------------------ | ----------: | -----: | -----: | -------: | -------: | ---------: |
| OfficialRelease-2014.cdb |      355 kB |    136 | 31,741 | 131.7 ms | 119.6 ms |   251.3 ms |
| OfficialRelease-2018.cdb |      566 kB |    150 | 62,127 | 167.8 ms | 198.5 ms |   366.3 ms |
| OfficialRelease-2019.cdb |      610 kB |    158 | 64,560 | 177.2 ms | 210.0 ms |   387.2 ms |
| OfficialRelease-2021.cdb |      417 kB |    147 | 36,672 | 133.1 ms | 128.1 ms |   261.2 ms |
| OfficialRelease-2025.cdb |      441 kB |    149 | 34,691 | 145.3 ms | 144.8 ms |   290.1 ms |

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
