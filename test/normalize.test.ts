import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { betterSqlite3Engine } from "../src/engines/better-sqlite3";
import { cdbToSql, sqlToCdb } from "../src/index";
import type { SqlDatabase, SqlEngine } from "../src/types";
import { fixturePath } from "./fixtures/save.fixture";

const SQL: SqlEngine = betterSqlite3Engine;
let bytes: Buffer;

beforeAll(() => {
	bytes = readFileSync(fixturePath(2025));
});

function columnSpecs(db: SqlDatabase, tableName: string): string[] {
	return db
		.exec(`PRAGMA table_info("${tableName}")`)[0]
		.values.map((col) => `${col[1] as string} :: ${col[2] as string}`);
}

describe("cdbToSql normalize mode", () => {
	it("reconstructs foreign keys and primary keys", () => {
		const db = cdbToSql(bytes, SQL, { normalize: true }) as SqlDatabase;

		const cyclistFks = db
			.exec(`PRAGMA foreign_key_list("DYN_cyclist")`)[0]
			.values.map((row) => `${row[3]}->${row[2]}.${row[4]}`);

		const teamPk = db
			.exec(`PRAGMA table_info("DYN_team")`)[0]
			.values.filter((row) => row[5])
			.map((row) => row[1]);

		expect(cyclistFks).toContain("fkIDteam->DYN_team.IDteam");
		expect(teamPk).toEqual(["IDteam"]);
	});

	it("enables joins across reconstructed relationships", () => {
		const db = cdbToSql(bytes, SQL, { normalize: true }) as SqlDatabase;
		const joined = db.exec(
			`SELECT COUNT(*) FROM DYN_cyclist c JOIN DYN_team t ON c.fkIDteam = t.IDteam`,
		)[0].values[0][0] as number;

		expect(joined).toBeGreaterThan(0);
	});

	it("does not index foreign-key columns unless asked", () => {
		const withoutIndexes = cdbToSql(bytes, SQL, {
			normalize: true,
		}) as SqlDatabase;
		const withIndexes = cdbToSql(bytes, SQL, {
			normalize: true,
			indexForeignKeys: true,
		}) as SqlDatabase;

		const countFkIndexes = (db: SqlDatabase) =>
			db.exec(
				`SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE '%\\_fk\\_idx' ESCAPE '\\'`,
			)[0].values[0][0] as number;

		expect(countFkIndexes(withoutIndexes)).toBe(0);
		expect(countFkIndexes(withIndexes)).toBeGreaterThan(0);
	});

	it("only emits foreign keys that target an enforced primary key", () => {
		const db = cdbToSql(bytes, SQL, { normalize: true }) as SqlDatabase;
		const tables = db
			.exec(`SELECT TableName FROM DB_STRUCTURE`)[0]
			.values.map((row) => row[0] as string);

		for (const table of tables) {
			const fks = db.exec(`PRAGMA foreign_key_list("${table}")`);
			if (fks.length === 0) continue;

			for (const [, , refTable, , refColumn] of fks[0].values) {
				const refTablePk = db
					.exec(`PRAGMA table_info("${refTable}")`)[0]
					.values.filter((row) => row[1] === refColumn)
					.map((row) => row[5]);
				expect(
					refTablePk,
					`${table} -> ${refTable}.${refColumn} must reference a declared PRIMARY KEY`,
				).toEqual([1]);
			}
		}
	});

	it("emits no foreign keys by default (backwards compatible)", () => {
		const db = cdbToSql(bytes, SQL) as SqlDatabase;
		const fks = db.exec(`PRAGMA foreign_key_list("DYN_cyclist")`);

		expect(fks).toHaveLength(0);
	});

	it("leaves encoded types and column order untouched", () => {
		const plain = cdbToSql(bytes, SQL) as SqlDatabase;
		const normalized = cdbToSql(bytes, SQL, { normalize: true }) as SqlDatabase;

		for (const name of ["DYN_cyclist", "DYN_team", "STA_stage"]) {
			expect(columnSpecs(normalized, name), name).toEqual(
				columnSpecs(plain, name),
			);
		}
	});

	it("round-trips back to CDB identically to a non-normalized conversion", () => {
		const normalized = cdbToSql(bytes, SQL, { normalize: true }) as SqlDatabase;
		const reopened = new SQL.Database(normalized.export()) as SqlDatabase;
		const roundTripped = cdbToSql(sqlToCdb(reopened), SQL) as SqlDatabase;
		const plain = cdbToSql(bytes, SQL) as SqlDatabase;

		const structure = plain
			.exec(`SELECT TableName FROM DB_STRUCTURE ORDER BY ID`)[0]
			.values.map((row) => row[0] as string);

		for (const name of structure) {
			expect(columnSpecs(roundTripped, name), `columns of ${name}`).toEqual(
				columnSpecs(plain, name),
			);
			const after = roundTripped.exec(`SELECT * FROM "${name}" ORDER BY rowid`);
			const before = plain.exec(`SELECT * FROM "${name}" ORDER BY rowid`);
			expect(
				after.length > 0 ? after[0].values : [],
				`rows of ${name}`,
			).toEqual(before.length > 0 ? before[0].values : []);
		}
	});
});
