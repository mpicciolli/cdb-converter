import type { BindParams, QueryExecResult } from "sql.js";
import { describe, expect, it, vi } from "vitest";
import { cdbToSql } from "../src/index";
import type { SqlJsStatic } from "../src/types";
import { MockSqlDatabaseBase, MockStatement } from "./mocks/mockSqlDatabase";

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

type MockSqlDatabase = MockDatabase;

function createMockSqlJs(): SqlJsStatic & {
	createdDatabases: MockSqlDatabase[];
} {
	const createdDatabases: MockSqlDatabase[] = [];

	class MockDatabaseImpl extends MockDatabase {
		constructor() {
			super();
			createdDatabases.push(this);
		}
	}

	return {
		Database: MockDatabaseImpl,
		Statement: MockStatement,
		createdDatabases,
	};
}

class MockDatabase extends MockSqlDatabaseBase {
	tables: Map<string, { rows: unknown[][] }> = new Map();
	sqlOperations: Array<{ sql: string; params?: BindParams }> = [];

	override run(sql: string, params?: BindParams): this {
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
				if (table && Array.isArray(params)) {
					table.rows.push(params);
				}
			}
		}

		return this;
	}

	override exec(sql: string): QueryExecResult[] {
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

	override export(): Uint8Array {
		return new Uint8Array([0, 1, 2, 3]);
	}
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
});
