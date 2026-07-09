import { DatabaseSync } from "node:sqlite";

function wrap(raw) {
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
	};
}

function DatabaseEngine(data) {
	const raw = new DatabaseSync(":memory:");
	if (data) raw.deserialize(Uint8Array.from(data));
	return wrap(raw);
}

export const nodeSqliteEngine = {
	Database: DatabaseEngine,
};
