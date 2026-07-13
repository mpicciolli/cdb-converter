import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import { cdbToSql } from "../../dist/index";
import { nodeSqliteEngine } from "./engine";

function usage() {
	console.error("Usage: node samples/node-sqlite-engine/index.js <input.cdb>");
}

async function main() {
	const [inputArg] = process.argv.slice(2);

	if (!inputArg) {
		usage();
		process.exitCode = 1;
		return;
	}

	const inputPath = resolve(process.cwd(), inputArg);
	const cdbBytes = await readFile(inputPath);

	// Same cdbToSql call as with sql.js, but backed by node:sqlite instead.
	const db = cdbToSql(cdbBytes, nodeSqliteEngine);
	try {
		const tables = db.exec(
			"SELECT TableName, ID FROM DB_STRUCTURE ORDER BY ID",
		);
		const rows = tables[0]?.values || [];

		console.log(`Input  : ${inputPath}`);
		console.log(`Tables : ${rows.length}`);

		for (const [tableName, tableId] of rows) {
			console.log(`- ${tableName} (#${tableId})`);
		}
	} finally {
		db.close();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
