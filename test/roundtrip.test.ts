/**
 * Round-trip conversion tests (intention: no data loss).
 *
 * Drives the REAL better-sqlite3 engine (no mocks) through the same path the CLI
 * uses:
 *   cdb -> cdbToSql -> db.export() (SQLite bytes on disk) -> reopen -> sqlToCdb -> cdb
 * then converts back to SQL and asserts the semantic content is identical.
 *
 * Comparing the decompressed/SQL *content* (not the compressed bytes) isolates the
 * question "is any data lost?" from non-deterministic deflate output. Going through
 * export()/reopen is essential: it drops any in-memory state, so it catches metadata
 * (e.g. table flags) that would only survive within a single process.
 *
 * Running across every shipped game version doubles as a multi-version support check.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { betterSqlite3Engine } from "../src/engines/better-sqlite3";
import { cdbToSql, sqlToCdb } from "../src/index";
import type { SqlDatabase } from "../src/types";
import { saveFixtures } from "./fixtures/save.fixture";

const SQL = betterSqlite3Engine;

interface TableSnapshot {
	name: string;
	id: number;
	flags: number | null;
	/** Column definitions as "name :: type" (type carries cdb type + index + tableId). */
	columns: string[];
	rows: unknown[][];
}

/**
 * Capture the full semantic content of a converted database, ordered deterministically
 * so two conversions can be compared without false negatives from table ordering.
 */
function snapshot(db: SqlDatabase): TableSnapshot[] {
	const structure = db.exec(
		`SELECT TableName, ID, Flags FROM DB_STRUCTURE ORDER BY ID`,
	);
	if (structure.length === 0) return [];

	return structure[0].values.map((row) => {
		const name = row[0] as string;
		const id = row[1] as number;
		const flags = (row[2] ?? null) as number | null;

		const schema = db.exec(`PRAGMA table_info("${name}")`);
		const columns = schema[0].values.map(
			(col) => `${col[1] as string} :: ${col[2] as string}`,
		);

		const data = db.exec(`SELECT * FROM "${name}" ORDER BY rowid`);
		const rows = data.length > 0 ? data[0].values : [];

		return { name, id, flags, columns, rows };
	});
}

describe("cdb <-> sql round-trip (no data loss)", () => {
	it.each(saveFixtures)(
		"preserves all data and table flags for %s",
		(_label, fixturePath) => {
			const original = readFileSync(fixturePath);

			// 1. cdb -> sql
			const db1 = cdbToSql(original, SQL);
			const before = snapshot(db1);

			// 2. Serialize to SQLite bytes and reopen — mirrors the CLI writing a .sqlite
			//    file and reading it back, dropping any in-memory-only state.
			const db2 = new SQL.Database(db1.export()) as SqlDatabase;

			// 3. sql -> cdb -> sql
			const db3 = cdbToSql(sqlToCdb(db2), SQL);
			const after = snapshot(db3);

			try {
				// Same tables, in the same order, with the same flags.
				expect(after.map((t) => `${t.id}:${t.name}:${t.flags}`)).toEqual(
					before.map((t) => `${t.id}:${t.name}:${t.flags}`),
				);

				// Same schema and the same row data, table by table.
				for (let i = 0; i < before.length; i++) {
					expect(after[i].columns, `columns of ${before[i].name}`).toEqual(
						before[i].columns,
					);
					expect(after[i].rows, `rows of ${before[i].name}`).toEqual(
						before[i].rows,
					);
				}
			} finally {
				db1.close();
				db2.close();
				db3.close();
			}
		},
	);
});
