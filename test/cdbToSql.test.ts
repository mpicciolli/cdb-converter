/**
 * CDB to SQLite conversion tests
 */

import { describe, expect, it, vi } from "vitest";
import { cdbToSql, sqlToCdb } from "../src/index";
import type { SqlJsStatic } from "../src/types";

vi.mock("../src/compression", () => ({
	decompressCdb: vi.fn((data: ArrayBuffer | Uint8Array) => data),
}));

const mockReadChunk = vi.fn();

vi.mock("../src/reader", () => ({
	CDBReader: class MockCDBReader {
		readChunk() {
			return mockReadChunk();
		}
	},
}));

// Mock SqlJs for testing - would need actual sql.js in real tests

type MockSqlDatabase = InstanceType<SqlJsStatic["Database"]> & {
	sqlOperations: Array<{ sql: string; params?: unknown[] }>;
};

function createMockSqlJs(): SqlJsStatic & {
	createdDatabases: MockSqlDatabase[];
} {
	const createdDatabases: MockSqlDatabase[] = [];

	return {
		Database: class MockDatabase {
			tables: Map<string, { rows: unknown[][] }> = new Map();
			sqlOperations: Array<{ sql: string; params?: unknown[] }> = [];
			_tableFlagsMap?: Map<number, number>;

			constructor() {
				createdDatabases.push(this as MockSqlDatabase);
			}

			run(sql: string, params?: unknown[]): void {
				this.sqlOperations.push({ sql, params });

				if (sql.includes("CREATE TABLE")) {
					const match = sql.match(/CREATE TABLE "?(\w+)"?/);
					if (match) {
						this.tables.set(match[1], { rows: [] });
					}
				} else if (sql.includes("INSERT INTO")) {
					const match = sql.match(/INSERT INTO "?(\w+)"?/);
					if (match) {
						const table = this.tables.get(match[1]);
						if (table && params) {
							table.rows.push(params);
						}
					}
				}
			}

			exec(sql: string): Array<{ columns: string[]; values: unknown[][] }> {
				if (sql.includes("SELECT TableName, ID FROM DB_STRUCTURE")) {
					return [
						{
							columns: ["TableName", "ID"],
							values: [
								["TestTable", 100],
								["Teams", 10],
							],
						},
					];
				}

				if (sql.includes("PRAGMA table_info")) {
					return [
						{
							columns: ["cid", "name", "type", "notnull", "dflt_value", "pk"],
							values: [
								[0, "id", "INTEGER 1600", 0, null, 0],
								[1, "name", "TEXT 1602", 0, null, 0],
							],
						},
					];
				}

				if (sql.includes("SELECT * FROM")) {
					return [
						{
							columns: ["id", "name"],
							values: [
								[1, "Test1"],
								[2, "Test2"],
							],
						},
					];
				}

				return [];
			}

			export(): Uint8Array {
				return new Uint8Array([0, 1, 2, 3]);
			}
		},
		createdDatabases,
	};
}

describe("cdb/sql conversion surface", () => {
	it("batches wide tables with at least one row per insert", () => {
		const sql = createMockSqlJs();
		const tableColumns = Array.from({ length: 1000 }, (_, columnIndex) => ({
			name: `col_${columnIndex}`,
			columnIndex,
			type: 0,
			data: [columnIndex],
		}));

		mockReadChunk.mockReturnValueOnce({
			children: {
				1: [
					{
						name: "WideTable",
						tableId: 1,
						tableFlags: 0,
						rowCount: 1,
						columns: tableColumns,
					},
				],
			},
		});

		cdbToSql(new Uint8Array([1, 2, 3]), sql);
		const [db] = sql.createdDatabases;

		expect(sql.createdDatabases).toHaveLength(1);
		expect(mockReadChunk).toHaveBeenCalledOnce();
		expect(db).toBeDefined();
		expect(db.sqlOperations).toContainEqual({
			sql: expect.stringContaining('INSERT INTO "WideTable" VALUES ('),
			params: expect.arrayContaining([0, 999]),
		});
		expect(
			db.sqlOperations.filter((operation) =>
				operation.sql.startsWith('INSERT INTO "WideTable" VALUES'),
			),
		).toHaveLength(1);

		mockReadChunk.mockReset();
	});

	it("exposes cdbToSql", () => {
		expect(typeof cdbToSql).toBe("function");
	});

	it("exposes sqlToCdb", () => {
		expect(typeof sqlToCdb).toBe("function");
	});

	it("keeps the mock database behavior usable for round-trip scaffolding", () => {
		const sql = createMockSqlJs();
		const mockDb = new sql.Database();
		mockDb._tableFlagsMap = new Map([[10, 65]]);

		mockDb.run("CREATE TABLE test (id INTEGER)");
		mockDb.run("INSERT INTO test VALUES (?)", [42]);

		const result = mockDb.exec("SELECT * FROM test");
		expect(Array.isArray(result)).toBe(true);
	});
});
