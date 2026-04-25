/**
 * SQLite to CDB conversion tests
 */

import { describe, expect, it } from "vitest";
import { sqlToCdb } from "../src/index";
import type { SqlDatabase } from "../src/types";

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

	it("runs in an environment with ArrayBuffer support", () => {
		expect(typeof ArrayBuffer).toBe("function");
	});
});
