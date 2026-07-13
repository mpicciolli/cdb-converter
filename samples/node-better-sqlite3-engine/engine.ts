import Database from "better-sqlite3";
import type { SqlDatabase, SqlEngine } from "../../src/types";

function wrap(raw: Database) {
	return {
		run(sql, params = []) {
			raw.prepare(sql).run(...params);
		},
		exec(sql) {
			const stmt = raw.prepare(sql).raw();
			const rows = stmt.all();
			if (rows.length === 0) return [];
			const columns = stmt.columns().map((c: any) => c.name);
			return [{ columns, values: rows }];
		},
		export() {
			return raw.serialize();
		},
		close() {
			raw.close();
		},
	} as SqlDatabase;
}

function DatabaseEngine(data: Uint8Array | number[] | undefined): SqlDatabase {
	const raw = new Database(data ?? ":memory:");
	return wrap(raw);
}

export const betterSqlite3Engine: SqlEngine = {
	Database: DatabaseEngine,
};
