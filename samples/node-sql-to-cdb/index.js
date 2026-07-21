import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import process from "node:process";
import { betterSqlite3Engine } from "../../dist/engines/better-sqlite3";
import { sqlToCdb } from "../../dist/index.mjs";

function usage() {
	console.error(
		"Usage: node samples/node-sql-to-cdb/index.js <input.sqlite> [output.cdb]",
	);
}

function getDefaultOutputPath(inputPath) {
	const extension = extname(inputPath);
	if (
		extension.toLowerCase() === ".sqlite" ||
		extension.toLowerCase() === ".db"
	) {
		return `${inputPath.slice(0, -extension.length)}.cdb`;
	}

	return `${inputPath}.cdb`;
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

	const sqliteBytes = await readFile(inputPath);
	const db = new betterSqlite3Engine.Database(sqliteBytes);
	const cdbBytes = new Uint8Array(sqlToCdb(db));

	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, cdbBytes);

	console.log(`Input  : ${inputPath}`);
	console.log(`Output : ${outputPath}`);

	db.close();
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
