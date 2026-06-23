/**
 * Round-trip verification tests (uses real sql.js)
 */

import initSqlJs from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { readCdbTables, sqlToCdb, verifyRoundTrip } from "../src/index";
import { DataType } from "../src/types";
import type { SqlDatabase, SqlJsStatic } from "../src/types";

/** Mirror the column-type encoding produced by cdbToSql. */
function encodeColumn(
	tableId: number,
	columnIndex: number,
	type: DataType,
): number {
	return (tableId * 256 + columnIndex) * 16 + (type & 0xf);
}

/**
 * Build a small but representative SQLite database in the shape cdbToSql
 * produces (DB_STRUCTURE + encoded column types), then serialize it to a real
 * CDB buffer we can feed back through verifyRoundTrip.
 */
function buildSeedCdb(SQL: SqlJsStatic): ArrayBuffer {
	const db: SqlDatabase = new SQL.Database();
	const tableId = 1; // intentionally absent from TABLE_FLAGS_BY_ID

	db.run(`CREATE TABLE DB_STRUCTURE (TableName TEXT '274', ID INTEGER)`);
	db.run(`INSERT INTO DB_STRUCTURE VALUES (?, ?)`, ["DYN_team", tableId]);

	db.run(
		`CREATE TABLE "DYN_team" (` +
			`"id" 'INTEGER ${encodeColumn(tableId, 0, DataType.INTEGER)}', ` +
			`"name" 'TEXT ${encodeColumn(tableId, 1, DataType.STRING)}', ` +
			`"rating" 'REAL ${encodeColumn(tableId, 2, DataType.FLOAT)}'` +
			`)`,
	);
	db.run(`INSERT INTO "DYN_team" VALUES (?, ?, ?)`, [1, "Alpha", 3.5]);
	db.run(`INSERT INTO "DYN_team" VALUES (?, ?, ?)`, [2, "Bravo", 7.25]);

	// Non-default flags only survive while the in-memory map is attached.
	db._tableFlagsMap = new Map([[tableId, 129]]);

	return sqlToCdb(db);
}

describe("verifyRoundTrip", () => {
	let SQL: SqlJsStatic;

	beforeAll(async () => {
		SQL = (await initSqlJs()) as unknown as SqlJsStatic;
	});

	it("reports a clean round-trip for the in-memory conversion contract", () => {
		const cdb = buildSeedCdb(SQL);

		const report = verifyRoundTrip(cdb, SQL, { throughDisk: false });

		expect(report.differences).toEqual([]);
		expect(report.ok).toBe(true);
		expect(report.byteIdenticalDecompressed).toBe(true);
	});

	it("surfaces table-flags loss on a through-disk round-trip", () => {
		// Known limitation: TABLE_FLAGS are kept in an in-memory map and are lost
		// once the SQLite database is exported and reopened. verifyRoundTrip is
		// expected to catch this rather than hide it.
		const cdb = buildSeedCdb(SQL);

		const report = verifyRoundTrip(cdb, SQL, { throughDisk: true });

		expect(report.ok).toBe(false);
		expect(report.differences).toContainEqual({
			table: "DYN_team",
			kind: "table-flags",
			detail: "flags 129 -> 0",
		});
	});

	it("preserves cell values across the round-trip", () => {
		const cdb = buildSeedCdb(SQL);

		const report = verifyRoundTrip(cdb, SQL, { throughDisk: false });

		expect(report.differences.some((d) => d.kind === "cell-value")).toBe(false);
	});
});

describe("readCdbTables", () => {
	let SQL: SqlJsStatic;

	beforeAll(async () => {
		SQL = (await initSqlJs()) as unknown as SqlJsStatic;
	});

	it("parses a CDB buffer into tables without going through SQLite", () => {
		const tables = readCdbTables(buildSeedCdb(SQL));

		expect(tables).toHaveLength(1);
		const [team] = tables;
		expect(team.name).toBe("DYN_team");
		expect(team.tableId).toBe(1);
		expect(team.rowCount).toBe(2);
		expect(team.columns.map((column) => column.name)).toEqual([
			"id",
			"name",
			"rating",
		]);
		expect(team.columns[1].data).toEqual(["Alpha", "Bravo"]);
		expect(team.columns[2].data).toEqual([3.5, 7.25]);
	});
});
