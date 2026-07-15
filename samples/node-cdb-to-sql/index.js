import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import process from "node:process";
import { betterSqlite3Engine } from "../../dist/engines/better-sqlite3";
import { cdbToSql } from "../../dist/index.mjs";

function usage() {
	console.error(
		"Usage: node samples/node-cdb-to-sql/index.js <input.cdb> [output.sqlite]",
	);
}

function getDefaultOutputPath(inputPath) {
	const extension = extname(inputPath);
	if (extension.toLowerCase() === ".cdb") {
		return `${inputPath.slice(0, -extension.length)}.sqlite`;
	}

	return `${inputPath}.sqlite`;
}

async function main() {
	const [inputArg, outputArg] = process.argv.slice(2);

	if (!inputArg) {
		usage();
		process.exitCode = 1;
		return;
	}

	const inputPath = resolve(process.cwd(), inputArg);
	const outputPath = resolve(
		process.cwd(),
		outputArg || getDefaultOutputPath(inputArg),
	);

	const cdbBytes = await readFile(inputPath);
	const db = cdbToSql(cdbBytes, betterSqlite3Engine);
	try {
		const sqliteBytes = db.export();

		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, sqliteBytes);

		const tables = db.exec(
			"SELECT TableName, ID FROM DB_STRUCTURE ORDER BY ID",
		);
		const rows = tables[0]?.values || [];

		console.log(`Input  : ${inputPath}`);
		console.log(`Output : ${outputPath}`);
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
