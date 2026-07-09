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

## Normalization overhead

`cdbToSql` can reconstruct `PRIMARY KEY` / `FOREIGN KEY` constraints from the PCM naming
conventions (`{ normalize: true }`), and optionally index every foreign-key column
(`{ normalize: true, indexForeignKeys: true }`). Both are opt-in; the table below measures
their cost against the default flat conversion.

### Conversion time (`cdbToSql` mean)

| Fixture                  |  Default | `normalize` |  `+ indexForeignKeys` |
| ------------------------ | -------: | ----------: | --------------------: |
| OfficialRelease-2014.cdb | 132.7 ms | 148.8 ms (+12%) |    187.4 ms (+41%) |
| OfficialRelease-2018.cdb | 172.5 ms | 194.9 ms (+13%) |    234.4 ms (+36%) |
| OfficialRelease-2019.cdb | 173.3 ms | 188.0 ms (+8%)  |    240.8 ms (+39%) |
| OfficialRelease-2021.cdb | 133.1 ms | 145.9 ms (+10%) |    194.6 ms (+46%) |
| OfficialRelease-2025.cdb | 137.8 ms | 149.5 ms (+8%)  |    192.1 ms (+39%) |

### Output size (`db.export()`)

| Fixture                  | Default | `normalize` | `+ indexForeignKeys` |
| ------------------------ | ------: | ----------: | -------------------: |
| OfficialRelease-2014.cdb | 1.79 MB | 2.58 MB (+45%) |   4.18 MB (+134%) |
| OfficialRelease-2018.cdb | 2.36 MB | 3.27 MB (+38%) |   5.30 MB (+124%) |
| OfficialRelease-2019.cdb | 2.51 MB | 3.46 MB (+38%) |   5.61 MB (+124%) |
| OfficialRelease-2021.cdb | 1.89 MB | 2.77 MB (+47%) |   4.62 MB (+145%) |
| OfficialRelease-2025.cdb | 1.91 MB | 2.76 MB (+44%) |   4.51 MB (+136%) |

- **`normalize`** adds declarative constraints and the unique indexes SQLite creates for
  primary keys — a modest, mostly one-time cost (~+10% time, ~+40% size).
- **`indexForeignKeys`** adds one index per FK column (~130–180 of them). This is where the
  bulk of the size and time goes, which is why it is a separate opt-in; enable it only when
  you run frequent filtered JOINs on the output.
- Normalization has **no effect on `sqlToCdb`**: the constraints are ignored on the way
  back, so the round-trip stays byte-identical.

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
