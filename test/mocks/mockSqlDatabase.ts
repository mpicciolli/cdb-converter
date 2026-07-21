/**
 * Mocks for the library's own `SqlDatabase` interface (4 methods: `run`, `exec`,
 * `export`, `close`), independent of any concrete SQLite engine.
 */

import type { SqlDatabase, SqlExecResult, SqlValue } from "../../src/types";

export interface MockSqlDatabaseOptions {
	/** Handles `db.exec(sql)`. Return the rows the code under test should observe. */
	exec: (sql: string) => SqlExecResult[];
	/** Handles `db.export()`. Defaults to a tiny non-empty buffer. */
	export?: () => Uint8Array;
}

/**
 * Object-literal mock for a single {@link SqlDatabase}. Use when the test only needs
 * to script `exec` (and maybe `export`) responses without any stateful behaviour.
 */
export function createMockSqlDatabase(
	options: MockSqlDatabaseOptions,
): SqlDatabase {
	return {
		exec: options.exec,
		export: options.export ?? (() => new Uint8Array([0, 1, 2])),
		run: () => {},
		close: () => {},
	};
}

/**
 * Base class implementing the {@link SqlDatabase} surface with default no-op/empty
 * behaviour. Extend it and override only the methods your test drives (typically
 * `run` / `exec` / `export`).
 */
export class MockSqlDatabaseBase implements SqlDatabase {
	run(_sql: string, _params?: SqlValue[]): void {}

	exec(_sql: string): SqlExecResult[] {
		return [];
	}

	export(): Uint8Array {
		return new Uint8Array([0, 1, 2]);
	}

	close(): void {}
}
