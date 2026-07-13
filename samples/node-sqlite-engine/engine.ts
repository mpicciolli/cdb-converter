import { DatabaseSync } from "node:sqlite";
import type { SqlDatabase } from "../../src/types";

function wrap(raw: DatabaseSync) {
	return {
		run(sql, params = []) {
			raw.prepare(sql).run(...params);
		},
		exec(sql) {
			const stmt = raw.prepare(sql);
			stmt.setReturnArrays(true);
			const rows = stmt.all();
			if (rows.length === 0) return [];
			const columns = stmt.columns().map((c) => c.name);
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

function DatabaseEngine(data: Uint8Array | number[]) {
	const raw = new DatabaseSync(":memory:");
	if (data) raw.deserialize(Uint8Array.from(data));
	return wrap(raw);
}

export const nodeSqliteEngine = {
	Database: DatabaseEngine,
};
