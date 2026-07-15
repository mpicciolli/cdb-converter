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

Each case is warmed up before timing, so a cold outlier (JIT warm-up, native binding load)
does not skew the result. Benchmarks run against the `better-sqlite3` engine, matching what
the CLI uses in Node.js — see [Bundle size](#bundle-size) for how the `sql.js` (WASM) engine
compares.

## Conversion performance

Round-trip timings against the official Pro Cycling Manager databases (`mean` reported by
`vitest bench`).

| Fixture                  | Input (CDB) | Tables |   Rows | cdbToSql | sqlToCdb | Round-trip |
| ------------------------ | ----------: | -----: | -----: | -------: | -------: | ---------: |
| OfficialRelease-2014.cdb |      355 kB |    136 | 31,741 | 107.2 ms | 100.5 ms |   207.7 ms |
| OfficialRelease-2018.cdb |      566 kB |    150 | 62,127 | 141.5 ms | 171.1 ms |   312.6 ms |
| OfficialRelease-2019.cdb |      610 kB |    158 | 64,560 | 144.9 ms | 179.5 ms |   324.3 ms |
| OfficialRelease-2021.cdb |      417 kB |    147 | 36,672 | 109.3 ms | 109.3 ms |   218.6 ms |
| OfficialRelease-2025.cdb |      441 kB |    149 | 34,691 | 122.6 ms | 125.8 ms |   248.4 ms |

- **cdbToSql** — decompress + parse the CDB binary into an in-memory SQLite database.
- **sqlToCdb** — serialize the SQLite database back to compressed CDB bytes.
- **Round-trip** — `cdbToSql + sqlToCdb`. `db.export()` (SQLite → bytes) is
  negligible (~0.3 ms) and omitted from the total.

Most of the time is spent in binary parsing/writing, not in SQLite itself. Native
`better-sqlite3` runs this ~15-17% faster end-to-end than the previous `sql.js` (WASM)
baseline, since it avoids per-call WASM boundary overhead on the large number of small
`run`/`exec` calls the conversion makes.

## Normalization overhead

`cdbToSql` can reconstruct `PRIMARY KEY` / `FOREIGN KEY` constraints from the PCM naming
conventions (`{ normalize: true }`), and optionally index every foreign-key column
(`{ normalize: true, indexForeignKeys: true }`). Both are opt-in; the table below measures
their cost against the default flat conversion.

### Conversion time (`cdbToSql` mean)

| Fixture                  |  Default | `normalize` |  `+ indexForeignKeys` |
| ------------------------ | -------: | ----------: | --------------------: |
| OfficialRelease-2014.cdb | 107.2 ms | 122.8 ms (+14%) |    140.6 ms (+31%) |
| OfficialRelease-2018.cdb | 141.5 ms | 151.0 ms (+7%)  |    190.1 ms (+34%) |
| OfficialRelease-2019.cdb | 144.9 ms | 160.6 ms (+11%) |    189.6 ms (+31%) |
| OfficialRelease-2021.cdb | 109.3 ms | 114.7 ms (+5%)  |    149.2 ms (+37%) |
| OfficialRelease-2025.cdb | 122.6 ms | 124.1 ms (+1%)  |    150.1 ms (+23%) |

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

The converter's own code is tiny; the footprint you actually ship depends on which SQLite
engine you use.

| Component                                        | Size                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| cdb-converter (published, gzip)                  | **~28 kB** (npm tarball)                                           |
| `better-sqlite3` (default, Node)                 | native addon, compiled at install time — no JS/WASM bundle weight |
| `sql.js` WebAssembly runtime (browser, optional) | ~644 kB (`sql-wasm.wasm`, loaded lazily)                           |
| `pako` (zlib deflate/inflate)                    | small, tree-shakeable                                              |

The library itself adds only a few kilobytes. `better-sqlite3` — the default engine used
by the CLI and Node consumers — is a native addon: it costs an install-time compile step
(or a prebuilt binary), not JS/WASM bundle size. `sql.js` remains available as an optional
engine (`cdb-converter/engines/sql-js`) for the browser, where its `.wasm` is fetched on
demand rather than bundled into your JS.
