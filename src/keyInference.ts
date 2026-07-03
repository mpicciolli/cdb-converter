/**
 * Infer PRIMARY KEY / FOREIGN KEY relationships from the PCM save naming
 * conventions so that `cdbToSql` can emit a normalized SQLite schema.
 *
 * Conventions (see the PCM save reference):
 *   - Every DYN_/STA_/GAM_/INF_ table exposes an identity column `ID{suffix}`
 *     where `{suffix}` is the table name without its prefix
 *     (e.g. `DYN_team` -> `IDteam`, `DYN_contract_cyclist` -> `IDcontract_cyclist`).
 *   - A column `fkID{X}` is a foreign key that targets the table whose identity
 *     column is `ID{X}`, joined on that column.
 *
 * Resolution is best-effort: columns that cannot be resolved simply get no
 * constraint, which is always safe. Foreign keys are declarative only — the
 * caller must keep `PRAGMA foreign_keys` OFF so orphaned references (common in
 * real saves) never block inserts.
 */

import type { TableInfo } from "./types";

export interface ForeignKey {
	/** The `fkID*` column holding the reference. */
	column: string;
	/** The referenced table name. */
	refTable: string;
	/** The referenced identity column on `refTable`. */
	refColumn: string;
}

export interface TableKeys {
	/** Identity column to declare as PRIMARY KEY, or null when the table has none. */
	primaryKey: string | null;
	foreignKeys: ForeignKey[];
}

const TABLE_PREFIXES = ["DYN_", "STA_", "GAM_", "INF_"] as const;

/** Canonical-owner tie-break when two tables share an identity column. */
const PREFIX_PRIORITY: Record<string, number> = {
	DYN_: 0,
	STA_: 1,
	GAM_: 2,
	INF_: 3,
};

/**
 * Leading modifiers stripped from a foreign-key suffix before retrying
 * resolution (e.g. `fkIDoldteam` -> `IDteam`, `fkIDlast_stage` -> `IDstage`).
 */
const FK_MODIFIERS = [
	"old",
	"new",
	"prev",
	"next",
	"main",
	"first",
	"last",
	"booked",
	"current",
] as const;

/**
 * Curated exceptions for columns whose suffix does not map to an identity
 * column by convention. Maps the `fkID*` column to its target table.
 */
const FK_EXCEPTIONS: Record<string, string> = {
	fkIDteam_duplicate: "DYN_team",
	fkIDteam_national_duplicate: "DYN_team",
	fkIDmain_team: "DYN_team",
	fkIDcontract: "DYN_contract_cyclist",
	fkIDnextcontract: "DYN_contract_cyclist",
	fkIDprevcontract: "DYN_contract_cyclist",
	fkIDnextdivision: "STA_division",
	fkIDprevdivision: "STA_division",
	fkIDfirst_stage: "STA_stage",
	fkIDlast_stage: "STA_stage",
	fkIDstage_current: "STA_stage",
	fkIDstage_last: "STA_stage",
	fkIDbooked_stage: "STA_stage",
	fkIDcountry_main: "STA_country",
	fkIDcountry_secondary: "STA_country",
};

function getPrefix(tableName: string): string | null {
	return TABLE_PREFIXES.find((p) => tableName.startsWith(p)) ?? null;
}

/**
 * The identity (primary-key) column a table is expected to expose, or null when
 * the table has no recognised prefix. Existence in the table is checked by the
 * caller.
 */
function identityColumn(tableName: string): string | null {
	const prefix = getPrefix(tableName);
	if (!prefix) return null;
	return `ID${tableName.slice(prefix.length)}`;
}

function resolveForeignKey(
	column: string,
	idIndex: Map<string, string>,
): ForeignKey | null {
	const suffix = column.slice("fkID".length);

	// 1. Exact identity match: fkIDteam -> IDteam.
	const exact = `ID${suffix}`;
	const exactTable = idIndex.get(exact);
	if (exactTable) {
		return { column, refTable: exactTable, refColumn: exact };
	}

	// 2. Strip a known modifier prefix and retry: fkIDoldteam -> IDteam.
	for (const modifier of FK_MODIFIERS) {
		if (!suffix.startsWith(modifier)) continue;
		let rest = suffix.slice(modifier.length);
		if (rest.startsWith("_")) rest = rest.slice(1);
		if (!rest) continue;
		const key = `ID${rest}`;
		const table = idIndex.get(key);
		if (table) {
			return { column, refTable: table, refColumn: key };
		}
	}

	// 3. Curated exceptions.
	const refTable = FK_EXCEPTIONS[column];
	if (refTable) {
		const refColumn = identityColumn(refTable);
		if (refColumn && idIndex.get(refColumn) === refTable) {
			return { column, refTable, refColumn };
		}
	}

	return null;
}

/**
 * Infer primary and foreign keys for every table from the naming conventions.
 * @param tables - Table metadata as read from the CDB file.
 * @returns A map from table name to its inferred keys.
 */
export function inferKeys(tables: TableInfo[]): Map<string, TableKeys> {
	const tableNames = new Set(tables.map((t) => t.name));
	const columnSets = new Map<string, Set<string>>(
		tables.map((t) => [t.name, new Set(t.columns.map((c) => c.name))]),
	);

	// Build the identity index: identity column -> canonical owner table. Only
	// tables that actually expose their expected identity column are indexed;
	// collisions (e.g. DYN_injury vs STA_injury) are resolved by prefix priority.
	const idIndex = new Map<string, string>();
	for (const table of tables) {
		const idCol = identityColumn(table.name);
		if (!idCol || !columnSets.get(table.name)?.has(idCol)) continue;

		const existing = idIndex.get(idCol);
		if (!existing) {
			idIndex.set(idCol, table.name);
			continue;
		}
		const currentPriority = PREFIX_PRIORITY[getPrefix(existing) ?? ""] ?? 99;
		const candidatePriority =
			PREFIX_PRIORITY[getPrefix(table.name) ?? ""] ?? 99;
		if (candidatePriority < currentPriority) {
			idIndex.set(idCol, table.name);
		}
	}

	const result = new Map<string, TableKeys>();
	for (const table of tables) {
		const columns = columnSets.get(table.name);
		const idCol = identityColumn(table.name);
		const primaryKey = idCol && columns?.has(idCol) ? idCol : null;

		const foreignKeys: ForeignKey[] = [];
		for (const col of table.columns) {
			if (!col.name.startsWith("fkID")) continue;
			const fk = resolveForeignKey(col.name, idIndex);
			if (fk && tableNames.has(fk.refTable)) {
				foreignKeys.push(fk);
			}
		}

		result.set(table.name, { primaryKey, foreignKeys });
	}

	return result;
}
