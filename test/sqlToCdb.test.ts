/**
 * SQLite to CDB conversion tests
 */

import { describe, expect, it } from "vitest";
import { sqlToCdb } from "../src/index";
import type { SqlDatabase } from "../src/types";

function createSqlToCdbMockDb(columnType: string): SqlDatabase {
	return {
		run: () => {},
		exec: (sql: string) => {
			if (sql.includes("DB_STRUCTURE")) {
				return [{ columns: ["TableName", "ID"], values: [["DYN_team", 1]] }];
			}

			if (sql.includes('PRAGMA table_info("DYN_team")')) {
				return [
					{
						columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
						values: [[0, "gene_sz_lastname", columnType, 0, null, 0]],
					},
				];
			}

			if (sql.includes('SELECT * FROM "DYN_team"')) {
				return [{ columns: ["gene_sz_lastname"], values: [] }];
			}

			return [{ columns: [], values: [] }];
		},
		export: () => new Uint8Array([0, 1, 2]),
	};
}

describe("sql to cdb conversion surface", () => {
	it("exposes sqlToCdb", () => {
		expect(typeof sqlToCdb).toBe("function");
	});

	it("throws when DB_STRUCTURE table is missing", () => {
		const mockDb: SqlDatabase = {
			run: () => {},
			exec: (sql: string) => {
				if (sql.includes("DB_STRUCTURE")) {
					return [];
				}

				return [{ columns: [], values: [] }];
			},
			export: () => new Uint8Array([0, 1, 2]),
		};

		expect(() => sqlToCdb(mockDb)).toThrow(/DB_STRUCTURE/);
	});

	it("throws when schema information for a listed table is unavailable", () => {
		const mockDb: SqlDatabase = {
			run: () => {},
			exec: (sql: string) => {
				if (sql.includes("DB_STRUCTURE")) {
					return [{ columns: ["TableName", "ID"], values: [["DYN_team", 1]] }];
				}

				if (sql.includes('PRAGMA table_info("DYN_team")')) {
					return [];
				}

				return [{ columns: [], values: [] }];
			},
			export: () => new Uint8Array([0, 1, 2]),
		};

		expect(() => sqlToCdb(mockDb)).toThrow(
			/No schema information available for table "DYN_team"/,
		);
	});

	it("throws when a PRAGMA table_info column type is missing the encoded suffix", () => {
		const mockDb = createSqlToCdbMockDb("INTEGER");

		expect(() => sqlToCdb(mockDb)).toThrow(
			/Invalid encoded column type for "gene_sz_lastname": expected "<sqlite type> <encoded number>", got "INTEGER"/,
		);
	});

	it("throws when a PRAGMA table_info column type has an invalid encoded suffix", () => {
		const mockDb = createSqlToCdbMockDb("INTEGER abc");

		expect(() => sqlToCdb(mockDb)).toThrow(
			/Invalid encoded column type for "gene_sz_lastname": expected "<sqlite type> <encoded number>", got "INTEGER abc"/,
		);
	});

	it("runs in an environment with ArrayBuffer support", () => {
		expect(typeof ArrayBuffer).toBe("function");
	});
});
