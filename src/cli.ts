#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import initSqlJs from "sql.js";
import { cdbToSql } from "./cdbToSql";
import { sqlToCdb } from "./sqlToCdb";

export type Direction = "cdb-to-sql" | "sql-to-cdb";

export interface ParsedArgs {
	command: "convert" | "help" | "version";
	input?: string;
	output?: string;
}

const HELP_TEXT = `cdb-converter — convert Pro Cycling Manager CDB files to/from SQLite

Usage:
  cdb-converter <input> [output]
  cdb-converter --help
  cdb-converter --version

Conversion direction is auto-detected from the input extension:
  *.cdb              ->  SQLite  (default output: <input>.sqlite)
  *.sqlite | *.db    ->  CDB     (default output: <input>.cdb)

Arguments:
  input              Path to the .cdb, .sqlite or .db file to convert
  output             Optional output path (defaults based on the input)

Options:
  -h, --help         Show this help message
  -v, --version      Show the cdb-converter version

Examples:
  cdb-converter save.cdb
  cdb-converter save.cdb save.sqlite
  cdb-converter save.sqlite save.cdb`;

export function parseArgs(argv: string[]): ParsedArgs {
	const positionals: string[] = [];

	for (const arg of argv) {
		if (arg === "-h" || arg === "--help") {
			return { command: "help" };
		}
		if (arg === "-v" || arg === "--version") {
			return { command: "version" };
		}
		positionals.push(arg);
	}

	return {
		command: "convert",
		input: positionals[0],
		output: positionals[1],
	};
}

/**
 * Determine the conversion direction from the input file extension.
 * Throws when the extension is not a recognised CDB/SQLite extension.
 */
export function detectDirection(inputPath: string): Direction {
	const extension = extname(inputPath).toLowerCase();

	switch (extension) {
		case ".cdb":
			return "cdb-to-sql";
		case ".sqlite":
		case ".db":
			return "sql-to-cdb";
		default:
			throw new Error(
				`Cannot detect conversion direction from "${inputPath}". ` +
					"Expected a .cdb, .sqlite or .db file.",
			);
	}
}

/**
 * Compute the default output path for a given input and direction by swapping
 * the extension (or appending one when the input has no extension).
 */
export function getDefaultOutputPath(
	inputPath: string,
	direction: Direction,
): string {
	const extension = extname(inputPath);
	const targetExtension = direction === "cdb-to-sql" ? ".sqlite" : ".cdb";

	if (extension.length > 0) {
		return `${inputPath.slice(0, -extension.length)}${targetExtension}`;
	}

	return `${inputPath}${targetExtension}`;
}

async function readVersion(): Promise<string> {
	try {
		const packageJsonUrl = new URL("../package.json", import.meta.url);
		const raw = await readFile(packageJsonUrl, "utf8");
		const pkg = JSON.parse(raw) as { version?: string };
		return pkg.version ?? "unknown";
	} catch {
		return "unknown";
	}
}

async function convert(
	input: string,
	output: string | undefined,
): Promise<void> {
	const direction = detectDirection(input);
	const inputPath = resolve(process.cwd(), input);
	const outputPath = resolve(
		process.cwd(),
		output ?? getDefaultOutputPath(input, direction),
	);

	const SQL = await initSqlJs();
	const inputBytes = await readFile(inputPath);

	let outputBytes: Uint8Array;
	let summary: string[] = [];

	if (direction === "cdb-to-sql") {
		const db = cdbToSql(inputBytes, SQL);

		const tables = db.exec(
			"SELECT TableName, ID FROM DB_STRUCTURE ORDER BY ID",
		);
		const rows = tables[0]?.values ?? [];
		summary = [`Tables : ${rows.length}`];

		outputBytes = db.export();
		db.close();
	} else {
		const db = new SQL.Database(inputBytes);
		outputBytes = new Uint8Array(sqlToCdb(db));
		db.close();
	}

	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(outputPath, outputBytes);

	console.log(`Input  : ${inputPath}`);
	console.log(`Output : ${outputPath}`);
	for (const line of summary) {
		console.log(line);
	}
}

export async function run(argv: string[]): Promise<void> {
	const parsed = parseArgs(argv);

	if (parsed.command === "help") {
		console.log(HELP_TEXT);
		return;
	}

	if (parsed.command === "version") {
		console.log(await readVersion());
		return;
	}

	if (!parsed.input) {
		console.error("Error: missing input file.\n");
		console.error(HELP_TEXT);
		process.exitCode = 1;
		return;
	}

	try {
		await convert(parsed.input, parsed.output);
	} catch (error) {
		console.error(`Error: ${error instanceof Error ? error.message : error}`);
		process.exitCode = 1;
	}
}

const isDirectRun =
	typeof process.argv[1] === "string" &&
	import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectRun) {
	void run(process.argv.slice(2));
}
