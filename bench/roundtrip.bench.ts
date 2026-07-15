// Reproducible round-trip benchmarks for cdb-converter
//
// Measures, per fixture:
//   - cdbToSql                     : decompress + parse CDB -> in-memory SQLite
//   - cdbToSql (normalize)         : same, plus reconstructed PK/FK constraints
//   - cdbToSql (normalize+fkIndex) : same, plus an index on every FK column
//   - export                       : better-sqlite3 db.export() (SQLite -> bytes)
//   - sqlToCdb                     : SQLite -> compressed CDB bytes
//
// Uses the better-sqlite3 engine, matching what the CLI runs in Node.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { bench, describe } from "vitest";
import { betterSqlite3Engine } from "../src/engines/better-sqlite3";
import { cdbToSql, sqlToCdb } from "../src/index";

const FIXTURES = [
	"test/fixtures/OfficialRelease-2014.cdb",
	"test/fixtures/OfficialRelease-2018.cdb",
	"test/fixtures/OfficialRelease-2019.cdb",
	"test/fixtures/OfficialRelease-2021.cdb",
	"test/fixtures/OfficialRelease-2025.cdb",
];

const SQL = betterSqlite3Engine;

for (const path of FIXTURES) {
	const cdbBytes = readFileSync(path);

	describe(basename(path), () => {
		// cdbToSql builds a fresh database each run. vitest's setup/teardown are
		// per-cycle (not per-iteration) hooks, so we close the database inside the
		// timed function to release native handles between iterations. close() is
		// negligible next to the parse it measures.
		bench("cdbToSql", () => {
			cdbToSql(cdbBytes, SQL).close();
		});

		bench("cdbToSql (normalize)", () => {
			cdbToSql(cdbBytes, SQL, { normalize: true }).close();
		});

		bench("cdbToSql (normalize+fkIndex)", () => {
			cdbToSql(cdbBytes, SQL, {
				normalize: true,
				indexForeignKeys: true,
			}).close();
		});

		// export and sqlToCdb are read-only on the database, so a single instance
		// can be reused across iterations.
		let db: ReturnType<typeof cdbToSql>;
		const setup = () => {
			db = cdbToSql(cdbBytes, SQL);
		};
		const teardown = () => {
			db.close();
		};

		bench("export", () => void db.export(), { setup, teardown });
		bench("sqlToCdb", () => void sqlToCdb(db), { setup, teardown });
	});
}
