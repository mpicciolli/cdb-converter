import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSqlJsEngine } from "../../src/engines/sql-js";
import { cdbToSql, type SqlEngine } from "../../src/index";
import { fixturePath } from "../fixtures/save.fixture";

describe("sql.js engine", () => {
	it("converts a CDB file to a queryable SQLite database", async () => {
		const SQL: SqlEngine = await createSqlJsEngine();
		const bytes = readFileSync(fixturePath(2025));

		const db = cdbToSql(bytes, SQL);
		try {
			const tables = db.exec("SELECT TableName FROM DB_STRUCTURE ORDER BY ID");
			expect(tables[0]?.values.length).toBeGreaterThan(0);
		} finally {
			db.close();
		}
	});
});
