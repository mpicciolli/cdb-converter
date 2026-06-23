/**
 * Regression tests over real CDB save fixtures.
 *
 * Fixtures are auto-discovered: drop a `.cdb` file into test/fixtures/cdb/ and
 * it is picked up automatically. Each fixture gets two checks:
 *   - a parse snapshot (catches reader regressions, with a human-readable diff)
 *   - a semantic round-trip assertion (catches writer regressions)
 *
 * The suite is skipped when no fixtures are present, so the public repo stays
 * green without committing large/proprietary save files. See README.md in this
 * folder for how to add a save (ideally a reduced one per game version).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { readCdbTables, verifyRoundTrip } from "../src/index";
import type { SqlJsStatic, TableInfo } from "../src/types";

const fixturesDir = join(
	dirname(fileURLToPath(import.meta.url)),
	"fixtures",
	"cdb",
);

const fixtures = existsSync(fixturesDir)
	? readdirSync(fixturesDir)
			.filter((name) => name.toLowerCase().endsWith(".cdb"))
			.sort()
	: [];

/** Stable, snapshot-friendly view of the parsed tables. */
function summarize(tables: TableInfo[]) {
	return tables.map((table) => ({
		name: table.name,
		tableId: table.tableId,
		tableFlags: table.tableFlags,
		rowCount: table.rowCount,
		columns: table.columns.map((column) => ({
			name: column.name,
			type: column.type,
			columnIndex: column.columnIndex,
			sample: column.data.slice(0, 3),
		})),
	}));
}

describe.skipIf(fixtures.length === 0)("cdb save fixtures", () => {
	let SQL: SqlJsStatic;

	beforeAll(async () => {
		SQL = (await initSqlJs()) as unknown as SqlJsStatic;
	});

	for (const fixture of fixtures) {
		describe(fixture, () => {
			const buffer = readFileSync(join(fixturesDir, fixture));

			it("matches the parse snapshot", () => {
				expect(summarize(readCdbTables(buffer))).toMatchSnapshot();
			});

			it("round-trips without semantic loss", () => {
				const report = verifyRoundTrip(buffer, SQL, { throughDisk: false });

				if (!report.ok) {
					console.error(
						`Round-trip differences for ${fixture}:\n` +
							report.differences
								.map((d) => `  [${d.kind}] ${d.table ?? "(db)"}: ${d.detail}`)
								.join("\n"),
					);
				}

				expect(report.ok).toBe(true);
			});
		});
	}
});
