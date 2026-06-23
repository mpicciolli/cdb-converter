/**
 * CLI helper tests
 */

import { describe, expect, it } from "vitest";
import { detectDirection, getDefaultOutputPath, parseArgs } from "../src/cli";

describe("parseArgs", () => {
	it("returns the help command for -h / --help", () => {
		expect(parseArgs(["-h"])).toEqual({ command: "help" });
		expect(parseArgs(["--help"])).toEqual({ command: "help" });
	});

	it("returns the version command for -v / --version", () => {
		expect(parseArgs(["-v"])).toEqual({ command: "version" });
		expect(parseArgs(["--version"])).toEqual({ command: "version" });
	});

	it("prioritises help/version even with positionals present", () => {
		expect(parseArgs(["save.cdb", "--help"])).toEqual({ command: "help" });
	});

	it("parses input and output positionals", () => {
		expect(parseArgs(["save.cdb"])).toEqual({
			command: "convert",
			input: "save.cdb",
			output: undefined,
		});
		expect(parseArgs(["save.cdb", "out.sqlite"])).toEqual({
			command: "convert",
			input: "save.cdb",
			output: "out.sqlite",
		});
	});

	it("treats no arguments as a convert command with no input", () => {
		expect(parseArgs([])).toEqual({
			command: "convert",
			input: undefined,
			output: undefined,
		});
	});
});

describe("detectDirection", () => {
	it("maps .cdb to cdb-to-sql", () => {
		expect(detectDirection("save.cdb")).toBe("cdb-to-sql");
		expect(detectDirection("SAVE.CDB")).toBe("cdb-to-sql");
	});

	it("maps .sqlite and .db to sql-to-cdb", () => {
		expect(detectDirection("save.sqlite")).toBe("sql-to-cdb");
		expect(detectDirection("save.db")).toBe("sql-to-cdb");
	});

	it("throws for unknown extensions", () => {
		expect(() => detectDirection("save.txt")).toThrowError(
			/Cannot detect conversion direction/,
		);
		expect(() => detectDirection("save")).toThrowError(
			/Cannot detect conversion direction/,
		);
	});
});

describe("getDefaultOutputPath", () => {
	it("swaps .cdb for .sqlite when converting to SQLite", () => {
		expect(getDefaultOutputPath("save.cdb", "cdb-to-sql")).toBe("save.sqlite");
		expect(getDefaultOutputPath("dir/save.cdb", "cdb-to-sql")).toBe(
			"dir/save.sqlite",
		);
	});

	it("swaps the extension for .cdb when converting to CDB", () => {
		expect(getDefaultOutputPath("save.sqlite", "sql-to-cdb")).toBe("save.cdb");
		expect(getDefaultOutputPath("save.db", "sql-to-cdb")).toBe("save.cdb");
	});
});
