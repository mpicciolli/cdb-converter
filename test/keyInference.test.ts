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
	describe("primary keys", () => {
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

		it("falls back to a first column that looks like an identity column", () => {
			const keys = inferKeys([
				table("DYN_finance", ["IDoperation", "gene_sz_argument"]),
				table("STA_training_stages_type", ["IDtype", "gene_strID_name"]),
				table("SoundEvents", ["Id", "IntervalMin"]),
				table("GAM_career_data", ["UID", "value"]),
			]);
			expect(keys.get("DYN_finance")?.primaryKey).toBe("IDoperation");
			expect(keys.get("STA_training_stages_type")?.primaryKey).toBe("IDtype");
			expect(keys.get("SoundEvents")?.primaryKey).toBe("Id");
			expect(keys.get("GAM_career_data")?.primaryKey).toBe("UID");
		});

		it("has no primary key when no identity column is found", () => {
			const keys = inferKeys([table("DYN_team", ["gene_sz_name"])]);
			expect(keys.get("DYN_team")?.primaryKey).toBeNull();
		});
	});

	describe("shared-PK extension tables", () => {
		it("declares the PK of a 1:1 extension as a foreign key to its owner", () => {
			const keys = inferKeys([
				table("DYN_cyclist", ["IDcyclist"]),
				table("DYN_cyclist_fitness", ["IDcyclist", "value_f_FIT"]),
			]);
			expect(keys.get("DYN_cyclist_fitness")?.primaryKey).toBe("IDcyclist");
			expect(keys.get("DYN_cyclist_fitness")?.foreignKeys).toContainEqual({
				column: "IDcyclist",
				refTable: "DYN_cyclist",
				refColumn: "IDcyclist",
			});
			expect(keys.get("DYN_cyclist")?.foreignKeys).toEqual([]);
		});
	});

	describe("foreign keys", () => {
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
				table("DYN_transfer", [
					"IDtransfer",
					"fkIDoldteam",
					"fkIDnewteam",
					"fkIDu23team",
				]),
				table("DYN_team", ["IDteam"]),
				table("STA_stage", ["IDstage"]),
			]);
			const fks = keys.get("DYN_transfer")?.foreignKeys ?? [];
			for (const column of ["fkIDoldteam", "fkIDnewteam", "fkIDu23team"]) {
				expect(fks).toContainEqual({
					column,
					refTable: "DYN_team",
					refColumn: "IDteam",
				});
			}
		});

		it("resolves foreign keys by stripping trailing digits", () => {
			const keys = inferKeys([
				table("DYN_team", ["IDteam", "fkIDcalendar1", "fkIDcalendar2"]),
				table("STA_calendar", ["IDcalendar"]),
			]);
			const fks = keys.get("DYN_team")?.foreignKeys ?? [];
			expect(fks).toContainEqual({
				column: "fkIDcalendar1",
				refTable: "STA_calendar",
				refColumn: "IDcalendar",
			});
			expect(fks).toContainEqual({
				column: "fkIDcalendar2",
				refTable: "STA_calendar",
				refColumn: "IDcalendar",
			});
		});

		it("resolves foreign keys by dropping role tokens", () => {
			const keys = inferKeys([
				table("DYN_team", ["IDteam", "fkIDteam_duplicate"]),
				table("STA_race", ["IDrace", "fkIDfirst_stage", "fkID_iconic_region"]),
				table("STA_stage", ["IDstage"]),
				table("STA_region", ["IDregion"]),
				table("DYN_cyclist", ["IDcyclist", "fkIDstaff_physician"]),
				table("DYN_physician", ["IDphysician"]),
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
				column: "fkID_iconic_region",
				refTable: "STA_region",
				refColumn: "IDregion",
			});
			expect(keys.get("DYN_cyclist")?.foreignKeys).toContainEqual({
				column: "fkIDstaff_physician",
				refTable: "DYN_physician",
				refColumn: "IDphysician",
			});
		});

		it("prefers the role-token candidate sharing tokens with the source table", () => {
			// fkIDtype_stage means "stage type", not a stage: the training-stages
			// type catalogue shares more tokens with the source table.
			const keys = inferKeys([
				table("STA_training_stages", ["IDtraining_stage", "fkIDtype_stage"]),
				table("STA_training_stages_type", ["IDtype"]),
				table("STA_stage", ["IDstage"]),
			]);
			expect(keys.get("STA_training_stages")?.foreignKeys).toEqual([
				{
					column: "fkIDtype_stage",
					refTable: "STA_training_stages_type",
					refColumn: "IDtype",
				},
			]);
		});

		it("resolves against table base names when the identity column differs", () => {
			const keys = inferKeys([
				table("DYN_race_status", [
					"IDrace_status",
					"fkIDsimulate_status",
					"fkIDprevious_simulate_status",
				]),
				table("STA_simulate_status", ["IDinrace_status"]),
			]);
			const fks = keys.get("DYN_race_status")?.foreignKeys ?? [];
			expect(fks).toContainEqual({
				column: "fkIDsimulate_status",
				refTable: "STA_simulate_status",
				refColumn: "IDinrace_status",
			});
			expect(fks).toContainEqual({
				column: "fkIDprevious_simulate_status",
				refTable: "STA_simulate_status",
				refColumn: "IDinrace_status",
			});
		});

		it("resolves truncated suffixes when a single table matches", () => {
			const keys = inferKeys([
				table("DYN_contract_cyclist_offer", ["IDcontract_offer", "fkIDstatut"]),
				table("STA_cyclist_statut", ["IDcyclist_statut"]),
				table("STA_brand", ["IDbrand", "fkIDnew_techno"]),
				table("DYN_equipment_techno", ["IDequipment_techno"]),
			]);
			expect(keys.get("DYN_contract_cyclist_offer")?.foreignKeys).toEqual([
				{
					column: "fkIDstatut",
					refTable: "STA_cyclist_statut",
					refColumn: "IDcyclist_statut",
				},
			]);
			expect(keys.get("STA_brand")?.foreignKeys).toEqual([
				{
					column: "fkIDnew_techno",
					refTable: "DYN_equipment_techno",
					refColumn: "IDequipment_techno",
				},
			]);
		});

		it("breaks truncation ties by token overlap with the source table", () => {
			const keys = inferKeys([
				table("DYN_cyclist", ["IDcyclist", "fkIDcontract"]),
				table("DYN_contract_cyclist", ["IDcontract_cyclist"]),
				table("STA_contract_state", ["IDcontract_state"]),
			]);
			expect(keys.get("DYN_cyclist")?.foreignKeys).toEqual([
				{
					column: "fkIDcontract",
					refTable: "DYN_contract_cyclist",
					refColumn: "IDcontract_cyclist",
				},
			]);
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

		it("targets the STA_ catalogue twin when a table references its own entity", () => {
			const keys = inferKeys([
				table("STA_injury", ["IDinjury", "fkIDinjury_aggravated_version"]),
				table("DYN_injury", ["IDinjury", "fkIDinjury"]),
			]);
			expect(keys.get("DYN_injury")?.foreignKeys).toEqual([
				{ column: "fkIDinjury", refTable: "STA_injury", refColumn: "IDinjury" },
			]);
			expect(keys.get("STA_injury")?.foreignKeys).toEqual([
				{
					column: "fkIDinjury_aggravated_version",
					refTable: "STA_injury",
					refColumn: "IDinjury",
				},
			]);
		});

		it("keeps the self-reference when no catalogue twin exists", () => {
			const keys = inferKeys([
				table("DYN_cyclist", ["IDcyclist", "fkIDcyclist_leader"]),
			]);
			expect(keys.get("DYN_cyclist")?.foreignKeys).toEqual([
				{
					column: "fkIDcyclist_leader",
					refTable: "DYN_cyclist",
					refColumn: "IDcyclist",
				},
			]);
		});

		it("resolves foreign keys via curated exceptions", () => {
			const keys = inferKeys([
				table("DYN_cyclist", ["IDcyclist", "fkIDstaff_trainer"]),
				table("DYN_coach", ["IDcoach"]),
				table("DYN_equipment_selection", [
					"IDequipment_selection",
					"fkIDequipment_frame",
					"fkIDequipment_helmet",
				]),
				table("DYN_equipment_techno", ["IDequipment_techno"]),
				table("STA_equipment_model", [
					"IDequipment_model",
					"fkIDequipment_marque",
				]),
				table("STA_brand", ["IDbrand"]),
			]);
			expect(keys.get("DYN_cyclist")?.foreignKeys).toContainEqual({
				column: "fkIDstaff_trainer",
				refTable: "DYN_coach",
				refColumn: "IDcoach",
			});
			const slotFks = keys.get("DYN_equipment_selection")?.foreignKeys ?? [];
			for (const column of ["fkIDequipment_frame", "fkIDequipment_helmet"]) {
				expect(slotFks).toContainEqual({
					column,
					refTable: "DYN_equipment_techno",
					refColumn: "IDequipment_techno",
				});
			}
			expect(keys.get("STA_equipment_model")?.foreignKeys).toEqual([
				{
					column: "fkIDequipment_marque",
					refTable: "STA_brand",
					refColumn: "IDbrand",
				},
			]);
		});

		it("skips curated exceptions whose target table is missing", () => {
			const keys = inferKeys([
				table("DYN_cyclist", ["IDcyclist", "fkIDstaff_trainer"]),
				// no DYN_coach present (older game versions)
			]);
			expect(keys.get("DYN_cyclist")?.foreignKeys).toEqual([]);
		});

		it("emits no constraint for non-reference fkID columns", () => {
			const keys = inferKeys([
				table("GAM_config", [
					"IDconfig",
					"fkIDgamemode",
					"fkIDgame_state",
					"fkIDrace_difficulty",
				]),
				table("DYN_ranking", ["IDranking", "fkIDitem", "fkIDitem_type"]),
				table("STA_ranking_item", ["IDranking_item"]),
				table("DYN_procyclist_skilltree", [
					"IDskilltree",
					"fkIDloc_skill_name",
					"fkIDtga_skin",
				]),
			]);
			expect(keys.get("GAM_config")?.foreignKeys).toEqual([]);
			expect(keys.get("DYN_procyclist_skilltree")?.foreignKeys).toEqual([]);
			// The polymorphic fkIDitem gets no constraint, but its type
			// discriminator is a real reference.
			expect(keys.get("DYN_ranking")?.foreignKeys).toEqual([
				{
					column: "fkIDitem_type",
					refTable: "STA_ranking_item",
					refColumn: "IDranking_item",
				},
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
});
