# CDB save fixtures

Real Pro Cycling Manager `.cdb` saves used by [`test/fixtures.test.ts`](../../fixtures.test.ts)
to guard against round-trip regressions across game versions.

## How it works

Fixtures are **auto-discovered**: any `*.cdb` file in this folder is picked up
automatically. Each one runs two checks:

- **parse snapshot** — catches reader regressions (run `vitest -u` to update
  after an intentional change);
- **semantic round-trip** (`verifyRoundTrip`) — catches writer regressions / data loss.

If this folder contains no `.cdb` file, the suite is skipped, so cloning the
repo and running the tests works out of the box.

## Adding a save (one per game version)

A new PCM game ships roughly once a year, each potentially with a new schema.
To add coverage:

1. Drop the save here, named by version, e.g. `pcm2025.cdb`.
2. Run `npm test` once and commit the generated snapshot in `__snapshots__/`.
3. Record its provenance in the table below.

Prefer a **reduced** save (a handful of rows per table) over a full one: the
round-trip coverage comes from the variety of tables / column types / flags,
not from row count — and it keeps the repository small. Full multi-MB saves can
be kept locally instead (the suite skips whatever is absent).

## Provenance

| File | Game version | Notes |
| ---- | ------------ | ----- |
| _(none yet)_ | | |
