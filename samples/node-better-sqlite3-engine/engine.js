// @ts-check
import Database from "better-sqlite3";

/** @typedef {import("../../src/types").SqlDatabase} SqlDatabase */
/** @typedef {import("../../src/types").SqlEngine} SqlEngine */
/** @typedef {import("../../src/types").SqlValue} SqlValue */
/** @typedef {import("../../src/types").SqlExecResult} SqlExecResult */

/** @implements {SqlDatabase} */
class BetterSqlite3Database {
	/** @type {import("better-sqlite3").Database} */
	db;

	/** @param {Uint8Array | number[] | undefined} data */
	constructor(data) {
		this.db = data ? new Database(Buffer.from(data)) : new Database(":memory:");
	}

	/**
	 * @param {string} sql
	 * @param {SqlValue[]} [params]
	 */
	run(sql, params = []) {
		this.db.prepare(sql).run(...params);
	}

	/**
	 * @param {string} sql
	 * @returns {SqlExecResult[]}
	 */
	exec(sql) {
		const stmt = this.db.prepare(sql).raw();
		const rows = /** @type {SqlValue[][]} */ (stmt.all());
		if (rows.length === 0) return [];
		const columns = stmt.columns().map((c) => c.name);
		return [{ columns, values: rows }];
	}

	export() {
		return this.db.serialize();
	}

	close() {
		this.db.close();
	}
}

/** @type {SqlEngine} */
export const betterSqlite3Engine = {
	Database: BetterSqlite3Database,
};
