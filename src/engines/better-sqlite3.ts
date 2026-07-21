import Database, { type Database as BetterSqlite3Handle } from "better-sqlite3";
import type { SqlDatabase, SqlEngine, SqlExecResult, SqlValue } from "../types";

class BetterSqlite3Database implements SqlDatabase {
	private readonly db: BetterSqlite3Handle;

	constructor(data?: Uint8Array | number[]) {
		this.db = data ? new Database(Buffer.from(data)) : new Database(":memory:");
	}

	run(sql: string, params: SqlValue[] = []): void {
		this.db.prepare(sql).run(...params);
	}

	exec(sql: string): SqlExecResult[] {
		const stmt = this.db.prepare(sql).raw();
		const rows = stmt.all() as SqlValue[][];
		if (rows.length === 0) return [];
		const columns = stmt.columns().map((c) => c.name);
		return [{ columns, values: rows }];
	}

	export(): Uint8Array {
		return this.db.serialize();
	}

	close(): void {
		this.db.close();
	}
}

export const betterSqlite3Engine: SqlEngine = {
	Database: BetterSqlite3Database,
};
