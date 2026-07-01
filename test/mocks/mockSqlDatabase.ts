/**
 * Fully-typed mocks for sql.js' `Database` / `Statement` / `SqlJsStatic`.
 *
 * `SqlDatabase` extends sql.js' `Database`, which exposes ~11 methods. Tests only
 * ever drive a handful of them (`exec`, `run`, `export`), so hand-written mocks used
 * to reach for `as unknown as SqlDatabase` to silence the missing members.
 *
 * The building blocks here implement the *whole* surface instead — the methods a test
 * cares about are provided, every other method is a stub that throws if it is ever
 * called. The results are real `Database` / `Statement` / `SqlJsStatic` values, so no
 * `unknown` cast is needed anywhere.
 */

import type {
	BindParams,
	Database,
	ParamsObject,
	QueryExecResult,
	SqlValue,
	Statement,
	StatementIterator,
} from "sql.js";
import type { SqlDatabase } from "../../src/types";

const notImplemented = (method: string) => (): never => {
	throw new Error(`Mock sql.js: "${method}" was called but not stubbed`);
};

export interface MockSqlDatabaseOptions {
	/** Handles `db.exec(sql)`. Return the rows the code under test should observe. */
	exec: (sql: string, params?: BindParams) => QueryExecResult[];
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
	const db: SqlDatabase = {
		exec: options.exec,
		export: options.export ?? (() => new Uint8Array([0, 1, 2])),
		run: () => db,
		close: () => {},
		create_function: () => db,
		updateHook: () => db,
		each: notImplemented("each"),
		getRowsModified: notImplemented("getRowsModified"),
		handleError: notImplemented("handleError"),
		iterateStatements: notImplemented("iterateStatements"),
		prepare: notImplemented("prepare"),
	};

	return db;
}

/** Stub `Statement`. Every method throws — provided only to satisfy `SqlJsStatic`. */
export class MockStatement implements Statement {
	bind = notImplemented("Statement.bind") as (values?: BindParams) => boolean;
	free = notImplemented("Statement.free") as () => boolean;
	freemem = notImplemented("Statement.freemem");
	get = notImplemented("Statement.get") as (params?: BindParams) => SqlValue[];
	getAsObject = notImplemented("Statement.getAsObject") as (
		params?: BindParams,
	) => ParamsObject;
	getColumnNames = notImplemented("Statement.getColumnNames") as () => string[];
	getNormalizedSQL = notImplemented(
		"Statement.getNormalizedSQL",
	) as () => string;
	getSQL = notImplemented("Statement.getSQL") as () => string;
	reset = notImplemented("Statement.reset") as () => void;
	run = notImplemented("Statement.run") as (values?: BindParams) => void;
	step = notImplemented("Statement.step") as () => boolean;
}

/**
 * Base class implementing the full {@link Database} surface with throwing stubs.
 * Extend it and override only the methods your test drives (typically `run` / `exec`
 * / `export`); instances are genuine `Database` values, so no cast is required.
 */
export class MockSqlDatabaseBase implements Database {
	run(_sql: string, _params?: BindParams): Database {
		return this;
	}

	exec(_sql: string, _params?: BindParams): QueryExecResult[] {
		return [];
	}

	export(): Uint8Array {
		return new Uint8Array([0, 1, 2]);
	}

	close(): void {}

	create_function(
		_name: string,
		_func: (...args: unknown[]) => unknown,
	): Database {
		return this;
	}

	updateHook(): Database {
		return this;
	}

	each = notImplemented("each") as Database["each"];
	getRowsModified = notImplemented("getRowsModified");
	handleError = notImplemented("handleError");
	iterateStatements = notImplemented(
		"iterateStatements",
	) as () => StatementIterator;
	prepare = notImplemented("prepare") as () => Statement;
}
