import { describe, expect, it } from "vitest";
import { inferKeys } from "../src/keyInference";
import type { TableInfo } from "../src/types";

/** Build a minimal TableInfo with the given column names (data/types irrelevant here). */
function table(name: string, columns: string[]): TableInfo {
	return {
		name,
		rowCount: 0,
		tableId: 0,
		tableFlags: 0,
		columns: columns.map((colName, columnIndex) => ({
			name: colName,
			type: 0,
			columnIndex,
			data: [],
		})),
	};
}

describe("inferKeys", () => {
	it("derives the primary key from the table's identity column", () => {
		const keys = inferKeys([table("DYN_team", ["IDteam", "gene_sz_name"])]);
		expect(keys.get("DYN_team")?.primaryKey).toBe("IDteam");
	});

	it("derives compound-suffix identity columns", () => {
		const keys = inferKeys([
			table("DYN_contract_cyclist", ["IDcontract_cyclist", "fkIDcyclist"]),
			table("DYN_cyclist", ["IDcyclist"]),
		]);
		expect(keys.get("DYN_contract_cyclist")?.primaryKey).toBe(
			"IDcontract_cyclist",
		);
	});

	it("has no primary key when the identity column is absent", () => {
		const keys = inferKeys([table("DYN_team", ["gene_sz_name"])]);
		expect(keys.get("DYN_team")?.primaryKey).toBeNull();
	});

	it("has no primary key for tables without a recognised prefix", () => {
		const keys = inferKeys([table("SoundEvents", ["IDSoundEvents"])]);
		expect(keys.get("SoundEvents")?.primaryKey).toBeNull();
	});

	it("resolves foreign keys by exact identity match", () => {
		const keys = inferKeys([
			table("DYN_cyclist", ["IDcyclist", "fkIDteam"]),
			table("DYN_team", ["IDteam"]),
		]);
		expect(keys.get("DYN_cyclist")?.foreignKeys).toEqual([
			{ column: "fkIDteam", refTable: "DYN_team", refColumn: "IDteam" },
		]);
	});

	it("resolves foreign keys by stripping a modifier prefix", () => {
		const keys = inferKeys([
			table("DYN_transfer", ["IDtransfer", "fkIDoldteam", "fkIDnewteam"]),
			table("DYN_team", ["IDteam"]),
			table("STA_stage", ["IDstage"]),
		]);
		const fks = keys.get("DYN_transfer")?.foreignKeys ?? [];
		expect(fks).toContainEqual({
			column: "fkIDoldteam",
			refTable: "DYN_team",
			refColumn: "IDteam",
		});
		expect(fks).toContainEqual({
			column: "fkIDnewteam",
			refTable: "DYN_team",
			refColumn: "IDteam",
		});
	});

	it("resolves foreign keys via curated exceptions", () => {
		const keys = inferKeys([
			table("DYN_team", ["IDteam", "fkIDteam_duplicate"]),
			table("STA_race", ["IDrace", "fkIDfirst_stage", "fkIDlast_stage"]),
			table("STA_stage", ["IDstage"]),
		]);
		expect(keys.get("DYN_team")?.foreignKeys).toContainEqual({
			column: "fkIDteam_duplicate",
			refTable: "DYN_team",
			refColumn: "IDteam",
		});
		const raceFks = keys.get("STA_race")?.foreignKeys ?? [];
		expect(raceFks).toContainEqual({
			column: "fkIDfirst_stage",
			refTable: "STA_stage",
			refColumn: "IDstage",
		});
		expect(raceFks).toContainEqual({
			column: "fkIDlast_stage",
			refTable: "STA_stage",
			refColumn: "IDstage",
		});
	});

	it("breaks identity-column collisions by prefix priority (DYN > STA)", () => {
		const keys = inferKeys([
			table("STA_injury", ["IDinjury"]),
			table("DYN_injury", ["IDinjury"]),
			table("DYN_cyclist", ["IDcyclist", "fkIDinjury"]),
		]);
		expect(keys.get("DYN_cyclist")?.foreignKeys).toEqual([
			{ column: "fkIDinjury", refTable: "DYN_injury", refColumn: "IDinjury" },
		]);
	});

	it("emits no constraint for unresolvable foreign keys", () => {
		const keys = inferKeys([
			table("DYN_cyclist", ["IDcyclist", "fkIDmystery_thing"]),
		]);
		expect(keys.get("DYN_cyclist")?.foreignKeys).toEqual([]);
	});

	it("skips foreign keys whose target table is missing", () => {
		const keys = inferKeys([
			table("DYN_cyclist", ["IDcyclist", "fkIDteam"]),
			// no DYN_team present
		]);
		expect(keys.get("DYN_cyclist")?.foreignKeys).toEqual([]);
	});
});
