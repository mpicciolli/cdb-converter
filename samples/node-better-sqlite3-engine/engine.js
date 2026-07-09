import Database from "better-sqlite3";

function wrap(raw) {
	return {
		run(sql, params = []) {
			raw.prepare(sql).run(...params);
		},
		exec(sql) {
			const stmt = raw.prepare(sql).raw();
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
	return wrap(new Database(data ?? ":memory:"));
}

export const betterSqlite3Engine = {
	Database: DatabaseEngine,
};
