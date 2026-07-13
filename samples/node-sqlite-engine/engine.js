// @ts-check
import { DatabaseSync } from "node:sqlite";

/** @typedef {import("../../src/types").SqlDatabase} SqlDatabase */
/** @typedef {import("../../src/types").SqlEngine} SqlEngine */
/** @typedef {import("../../src/types").SqlValue} SqlValue */
/** @typedef {import("../../src/types").SqlExecResult} SqlExecResult */

/** @implements {SqlDatabase} */
class NodeSqliteDatabase {
	/** @type {DatabaseSync} */
	db;

	/** @param {Uint8Array | number[] | undefined} data */
	constructor(data) {
		this.db = new DatabaseSync(":memory:");
		if (data) this.db.deserialize(Uint8Array.from(data));
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
		const stmt = this.db.prepare(sql);
		stmt.setReturnArrays(true);
		const rows = /** @type {SqlValue[][]} */ (
			/** @type {unknown} */ (stmt.all())
		);
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
export const nodeSqliteEngine = {
	Database: NodeSqliteDatabase,
};
