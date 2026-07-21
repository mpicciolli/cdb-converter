import initSqlJs, { type SqlJsConfig } from "sql.js";
import type { SqlEngine } from "../types";

export async function createSqlJsEngine(
	config?: SqlJsConfig,
): Promise<SqlEngine> {
	const SQL = await initSqlJs(config);
	return SQL;
}
