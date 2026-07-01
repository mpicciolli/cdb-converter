// Reproducible round-trip benchmarks for cdb-converter, driven by `vitest bench`
// (tinybench under the hood). Vitest handles warmup, iteration counts and
// statistics (mean, p99, ops/sec, margin of error) for us.
//
// Measures, per fixture:
//   - cdbToSql : decompress + parse CDB -> in-memory SQLite
//   - export   : sql.js db.export() (SQLite -> bytes)
//   - sqlToCdb : SQLite -> compressed CDB bytes
//

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import initSqlJs from "sql.js";
import { bench, describe } from "vitest";
import { cdbToSql, sqlToCdb } from "../src/index";

const FIXTURES = [
	"test/fixtures/OfficialRelease-2014.cdb",
	"test/fixtures/OfficialRelease-2018.cdb",
	"test/fixtures/OfficialRelease-2019.cdb",
	"test/fixtures/OfficialRelease-2021.cdb",
	"test/fixtures/OfficialRelease-2025.cdb",
];

const SQL = await initSqlJs();

for (const path of FIXTURES) {
	const cdbBytes = readFileSync(path);

	describe(basename(path), () => {
		// cdbToSql builds a fresh database each run; close it afterwards so the
		// sql.js/WASM heap does not grow across iterations.
		let toSqlDb: ReturnType<typeof cdbToSql> | undefined;
		bench(
			"cdbToSql",
			() => {
				toSqlDb = cdbToSql(cdbBytes, SQL);
			},
			{
				teardown: () => {
					toSqlDb?.close();
					toSqlDb = undefined;
				},
			},
		);

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
