import type { SqlValue } from "sql.js";
import { describe, expect, it } from "vitest";
import { sqlToCdb } from "../src/index";
import { createMockSqlDatabase } from "./mocks/mockSqlDatabase";

type QueryResult = { columns: string[]; values: SqlValue[][] };

function createSqlToCdbMockDb(
	overrides: {
		dbStructure?: QueryResult[];
		tableInfo?: QueryResult[];
		selectRows?: QueryResult[];
	} = {},
) {
	const {
		dbStructure = [{ columns: ["TableName", "ID"], values: [["DYN_team", 1]] }],
		tableInfo = [
			{
				columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
				values: [[0, "gene_sz_lastname", "TEXT 4098", 0, null, 0]],
			},
		],
		selectRows = [{ columns: ["gene_sz_lastname"], values: [] }],
	} = overrides;

	return createMockSqlDatabase({
		exec: (sql) => {
			if (sql.includes("DB_STRUCTURE")) {
				return dbStructure;
			}

			if (sql.includes('PRAGMA table_info("DYN_team")')) {
				return tableInfo;
			}

			if (sql.includes('SELECT * FROM "DYN_team"')) {
				return selectRows;
			}

			return [{ columns: [], values: [] }];
		},
	});
}

describe("sql to cdb conversion surface", () => {
	it("exposes sqlToCdb", () => {
		expect(typeof sqlToCdb).toBe("function");
	});

	it("throws when DB_STRUCTURE table is missing", () => {
		const mockDb = createSqlToCdbMockDb({ dbStructure: [] });

		expect(() => sqlToCdb(mockDb)).toThrow(/DB_STRUCTURE/);
	});

	it("throws when schema information for a listed table is unavailable", () => {
		const mockDb = createSqlToCdbMockDb({ tableInfo: [] });

		expect(() => sqlToCdb(mockDb)).toThrow(
			/No schema information available for table "DYN_team"/,
		);
	});

	it("throws when a PRAGMA table_info column type is missing the encoded suffix", () => {
		const mockDb = createSqlToCdbMockDb({
			tableInfo: [
				{
					columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
					values: [[0, "gene_sz_lastname", "INTEGER", 0, null, 0]],
				},
			],
		});

		expect(() => sqlToCdb(mockDb)).toThrow(
			/Invalid encoded column type for "gene_sz_lastname": expected "<sqlite type> <encoded number>", got "INTEGER"/,
		);
	});

	it("throws when a PRAGMA table_info column type has an invalid encoded suffix", () => {
		const mockDb = createSqlToCdbMockDb({
			tableInfo: [
				{
					columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
					values: [[0, "gene_sz_lastname", "INTEGER abc", 0, null, 0]],
				},
			],
		});

		expect(() => sqlToCdb(mockDb)).toThrow(
			/Invalid encoded column type for "gene_sz_lastname": expected "<sqlite type> <encoded number>", got "INTEGER abc"/,
		);
	});

	it("throws when a row contains a NULL value for a column", () => {
		const mockDb = createSqlToCdbMockDb({
			selectRows: [
				{
					columns: ["gene_sz_lastname"],
					values: [["Doe"], [null]],
				},
			],
		});

		expect(() => sqlToCdb(mockDb)).toThrow(
			/NULL or missing value in table "DYN_team", column "gene_sz_lastname", row 2/,
		);
	});

	it("runs in an environment with ArrayBuffer support", () => {
		expect(typeof ArrayBuffer).toBe("function");
	});
});
