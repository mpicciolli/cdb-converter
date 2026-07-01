// Reproducible round-trip benchmark for cdb-converter.
//
// Measures, per fixture:
//   - cdbToSql   : decompress + parse CDB -> in-memory SQLite
//   - export     : sql.js db.export() (SQLite -> bytes)
//   - sqlToCdb   : SQLite -> compressed CDB bytes
//
// Runs a warmup then N timed iterations and reports the median (p50), so a
// single cold outlier (JIT, WASM init) does not skew the numbers.
//
// Usage:
//   node bench/index.js               # all fixtures, default iterations
//   node bench/index.js --iterations 20
//   node bench/index.js --md          # emit a Markdown table (for the README)
//   node bench/index.js <file.cdb>    # benchmark a specific CDB file

import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import { cpus } from "node:os";
import process from "node:process";
import initSqlJs from "sql.js";
import { cdbToSql, sqlToCdb } from "../dist/index.mjs";

const FIXTURES = [
	"test/fixtures/OfficialRelease-2014.cdb",
	"test/fixtures/OfficialRelease-2018.cdb",
	"test/fixtures/OfficialRelease-2019.cdb",
	"test/fixtures/OfficialRelease-2021.cdb",
	"test/fixtures/OfficialRelease-2025.cdb",
];

function parseArgs(argv) {
	const options = { iterations: 10, warmup: 3, md: false, files: [] };
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--iterations" || arg === "-n") {
			options.iterations = Number.parseInt(argv[++i], 10);
		} else if (arg === "--warmup" || arg === "-w") {
			options.warmup = Number.parseInt(argv[++i], 10);
		} else if (arg === "--md") {
			options.md = true;
		} else if (arg.startsWith("-")) {
			throw new Error(`Unknown flag: ${arg}`);
		} else {
			options.files.push(arg);
		}
	}
	return options;
}

function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

function ms(hrtimeDeltaNs) {
	return hrtimeDeltaNs / 1e6;
}

function time(fn) {
	const start = process.hrtime.bigint();
	const result = fn();
	const elapsed = ms(Number(process.hrtime.bigint() - start));
	return { result, elapsed };
}

function countRows(db) {
	const structure = db.exec("SELECT TableName FROM DB_STRUCTURE");
	const tableNames = structure[0]?.values.map((row) => row[0]) ?? [];
	let rows = 0;
	for (const name of tableNames) {
		const escaped = String(name).replace(/"/g, '""');
		const res = db.exec(`SELECT COUNT(*) FROM "${escaped}"`);
		rows += Number(res[0]?.values[0][0] ?? 0);
	}
	return { tables: tableNames.length, rows };
}

async function benchmarkFile(path, SQL, { iterations, warmup }) {
	const cdbBytes = await readFile(path);

	// Warmup: let the JIT and sql.js settle before we start the clock.
	for (let i = 0; i < warmup; i++) {
		const db = cdbToSql(cdbBytes, SQL);
		const exported = db.export();
		sqlToCdb(db);
		db.close();
		void exported;
	}

	const samples = { cdbToSql: [], export: [], sqlToCdb: [] };
	let stats = { tables: 0, rows: 0 };
	let cdbOutSize = 0;
	let sqliteSize = 0;

	for (let i = 0; i < iterations; i++) {
		const toSql = time(() => cdbToSql(cdbBytes, SQL));
		const db = toSql.result;
		samples.cdbToSql.push(toSql.elapsed);

		const exp = time(() => db.export());
		samples.export.push(exp.elapsed);
		sqliteSize = exp.result.byteLength;

		const toCdb = time(() => sqlToCdb(db));
		samples.sqlToCdb.push(toCdb.elapsed);
		cdbOutSize = toCdb.result.byteLength;

		if (i === 0) stats = countRows(db);
		db.close();
	}

	return {
		file: basename(path),
		inputSize: cdbBytes.byteLength,
		sqliteSize,
		cdbOutSize,
		tables: stats.tables,
		rows: stats.rows,
		cdbToSql: median(samples.cdbToSql),
		export: median(samples.export),
		sqlToCdb: median(samples.sqlToCdb),
	};
}

function fmtKB(bytes) {
	return `${(bytes / 1024).toFixed(0)} kB`;
}

function fmtMs(value) {
	return `${value.toFixed(1)} ms`;
}

function printEnv() {
	const cpu = cpus()[0]?.model ?? "unknown CPU";
	console.log(`Node        : ${process.version}`);
	console.log(`Platform    : ${process.platform} ${process.arch}`);
	console.log(`CPU         : ${cpu}`);
	console.log("");
}

function printText(results, { iterations }) {
	printEnv();
	console.log(`Iterations  : ${iterations} (median reported)\n`);
	for (const r of results) {
		console.log(r.file);
		console.log(
			`  input ${fmtKB(r.inputSize)} -> sqlite ${fmtKB(r.sqliteSize)} -> cdb ${fmtKB(r.cdbOutSize)}  |  ${r.tables} tables, ${r.rows.toLocaleString("en-US")} rows`,
		);
		console.log(
			`  cdbToSql ${fmtMs(r.cdbToSql)}   export ${fmtMs(r.export)}   sqlToCdb ${fmtMs(r.sqlToCdb)}\n`,
		);
	}
}

function printMarkdown(results) {
	printEnv();
	console.log(
		"| Fixture | Input (CDB) | Tables | Rows | cdbToSql | sqlToCdb | Round-trip |",
	);
	console.log("| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
	for (const r of results) {
		const roundTrip = r.cdbToSql + r.sqlToCdb;
		console.log(
			`| ${r.file} | ${fmtKB(r.inputSize)} | ${r.tables} | ${r.rows.toLocaleString("en-US")} | ${fmtMs(r.cdbToSql)} | ${fmtMs(r.sqlToCdb)} | ${fmtMs(roundTrip)} |`,
		);
	}
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const targets = options.files.length > 0 ? options.files : FIXTURES;
	const SQL = await initSqlJs();

	const results = [];
	for (const path of targets) {
		results.push(await benchmarkFile(path, SQL, options));
	}

	if (options.md) printMarkdown(results);
	else printText(results, options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.stack : error);
		process.exitCode = 1;
	});
}
