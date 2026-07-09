/**
 * Infer PRIMARY KEY / FOREIGN KEY relationships from the PCM save naming
 * conventions so that `cdbToSql` can emit a normalized SQLite schema.
 *
 * The rules were reverse-engineered from real PCM saves:
 *   - PK: a table's identity column is `ID{base}` where `{base}` is the table
 *     name without its DYN_/STA_/GAM_/INF_ prefix. When that column is absent
 *     the first column is the key whenever it looks like one (`ID*`, `Id`,
 *     `UID`) — e.g. `DYN_finance.IDoperation`, `GAM_career_data.UID`.
 *   - FK: `fkID{suffix}` references the table whose identity column *or* base
 *     name matches `{suffix}` (case- and underscore-insensitive), after
 *     removing role decorations: modifier prefixes (`fkIDprevteam`), trailing
 *     digits (`fkIDcalendar1`), extra leading/trailing tokens
 *     (`fkIDstaff_physician`, `fkIDcountry_main`) or truncation (`fkIDstatut`
 *     -> `STA_cyclist_statut`). Ambiguities are broken by token overlap with
 *     the referencing table's name (`fkIDstate` in `DYN_training_stage_booking`
 *     -> `STA_training_stages_state`).
 *   - Shared-PK extensions: a table whose identity column belongs to another
 *     table is a 1:1 extension and its PK also references the owner
 *     (`DYN_cyclist_fitness.IDcyclist` -> `DYN_cyclist.IDcyclist`).
 *   - Instance/catalogue twins: a column naming its own table's entity targets
 *     the STA_ catalogue twin when one exists (`DYN_injury.fkIDinjury` ->
 *     `STA_injury`), otherwise it is a self-reference.
 *   - Some `fkID*` columns are not table references at all (localized-string
 *     ids, texture ids, enums with no catalogue table, the polymorphic
 *     `fkIDitem`); they are excluded up front and get no constraint.
 *
 * Resolution is best-effort: columns that cannot be resolved simply get no
 * constraint, which is always safe. Foreign keys are declarative only — the
 * caller must keep `PRAGMA foreign_keys` OFF so orphaned references (common in
 * real saves) never block inserts. Integer-list columns (`*_ilist_fkID*`) are
 * multivalued and cannot carry SQL constraints; they are ignored.
 */

import type { TableInfo } from "./types";

export interface ForeignKey {
	/** The column holding the reference (an `fkID*` column, or the PK of a 1:1 extension table). */
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
 * resolution, possibly agglutinated (e.g. `fkIDoldteam` -> `team`,
 * `fkIDu23team` -> `team`, `fkIDprevious_simulate_status` -> simulate_status).
 */
const FK_MODIFIERS = [
	"old",
	"new",
	"previous",
	"prev",
	"next",
	"main",
	"first",
	"last",
	"booked",
	"current",
	"u23",
] as const;

/**
 * `fkID*` columns that do not reference another table: localized-string ids
 * (`fkIDloc_*`, `*_string`, `fkIDformated*`), texture ids (`fkIDtga_*`).
 */
const NON_FK_PATTERNS: readonly RegExp[] = [
	/^fkIDloc_/,
	/^fkIDtga_/,
	/^fkIDformated/,
	/_string$/,
];

/**
 * `fkID*` columns holding enum values with no catalogue table (encoded in the
 * game binary), plus the polymorphic `fkIDitem` whose target table depends on
 * the sibling `fkIDitem_type` discriminator.
 */
const NON_FK_COLUMNS = new Set([
	"fkIDgamemode",
	"fkIDgame_state",
	"fkIDrace_difficulty",
	"fkIDequipment_type",
	"fkIDstate_roster",
	"fkIDitem",
]);

/**
 * Curated exceptions for columns that naming conventions cannot resolve,
 * validated against real save data. Maps the `fkID*` column to its target
 * table (skipped when the table is absent, e.g. in older game versions).
 */
const FK_EXCEPTIONS: Record<string, string> = {
	// Bilingual naming gaps: "marque" is French for brand, the "trainer" staff
	// lives in DYN_coach, a cyclist's "workplan" is a training exercise.
	fkIDequipment_marque: "STA_brand",
	fkIDstaff_trainer: "DYN_coach",
	fkIDworkplan: "STA_training_exercise",
	fkIDyear_progression: "DYN_cyclist_progression",
	// Equipment slots hold techno ids, even though model ids happen to cover
	// the same value range.
	fkIDequipment_frame: "DYN_equipment_techno",
	fkIDequipment_front_wheel: "DYN_equipment_techno",
	fkIDequipment_rear_wheel: "DYN_equipment_techno",
	fkIDequipment_helmet: "DYN_equipment_techno",
	fkIDequipment_glasses: "DYN_equipment_techno",
	// Discriminator of the polymorphic fkIDitem pair (CYCLIST/TEAM/COUNTRY).
	fkIDitem_type: "STA_ranking_item",
	// National-selection invitations (world/european championships), not race
	// invitations (STA_invitation_state).
	fkIDinvitation_state_WC: "STA_national_team_invitation_state",
	fkIDinvitation_state_WC_ITT: "STA_national_team_invitation_state",
	fkIDinvitation_state_EC: "STA_national_team_invitation_state",
	fkIDinvitation_state_EC_ITT: "STA_national_team_invitation_state",
	// Never observed populated in real saves; the stage-booking table is the
	// only target consistent with the training-camp lifecycle.
	fkIDtraining_camp: "DYN_training_stage_booking",
};

/** A referencable identity column, indexed by entity and by table base name. */
interface Target {
	table: string;
	idColumn: string;
	/** Normalized table name without prefix, or null for unprefixed tables. */
	base: string | null;
	/** Normalized identity-column name without `ID`, or null for `Id`/`UID`. */
	entity: string | null;
}

function getPrefix(tableName: string): string | null {
	return TABLE_PREFIXES.find((p) => tableName.startsWith(p)) ?? null;
}

function baseNameOf(tableName: string): string | null {
	const prefix = getPrefix(tableName);
	return prefix ? tableName.slice(prefix.length) : null;
}

/** Case- and underscore-insensitive comparison key. */
function normalize(name: string): string {
	return name.toLowerCase().replace(/_/g, "");
}

/** Name tokens with plural markers dropped, for overlap-based tie-breaks. */
function tokenSet(tableName: string): Set<string> {
	const base = baseNameOf(tableName) ?? tableName;
	return new Set(
		base
			.toLowerCase()
			.split("_")
			.filter(Boolean)
			.map((token) => token.replace(/s$/, "")),
	);
}

function tokenOverlap(a: Set<string>, b: Set<string>): number {
	let count = 0;
	for (const token of a) if (b.has(token)) count++;
	return count;
}

/**
 * The identity column of a table: the conventional `ID{base}` column when
 * present, otherwise the first column when it looks like an identity column.
 */
function detectPrimaryKey(table: TableInfo): string | null {
	const base = baseNameOf(table.name);
	if (base) {
		const conventional = `ID${base}`;
		if (table.columns.some((c) => c.name === conventional)) return conventional;
	}
	const first = table.columns[0]?.name;
	if (first && (first === "Id" || first === "UID" || /^ID./.test(first))) {
		return first;
	}
	return null;
}

/** Among tables matching a key, prefer the canonical owner (base name = key). */
function pickTarget(candidates: Target[], key: string): Target | null {
	if (candidates.length === 0) return null;
	const ranked = [...candidates].sort((a, b) => {
		const aOwns = a.base === key ? 0 : 1;
		const bOwns = b.base === key ? 0 : 1;
		if (aOwns !== bOwns) return aOwns - bOwns;
		const aPriority = PREFIX_PRIORITY[getPrefix(a.table) ?? ""] ?? 99;
		const bPriority = PREFIX_PRIORITY[getPrefix(b.table) ?? ""] ?? 99;
		if (aPriority !== bPriority) return aPriority - bPriority;
		return a.table.length - b.table.length;
	});
	return ranked[0];
}

/**
 * When a column names its own table's entity, redirect to the STA_ catalogue
 * twin if one exists (instance rows point at their catalogue row); otherwise
 * keep the resolved target (a plain self-reference).
 */
function preferCatalogueTwin(
	target: Target,
	sourceTable: string,
	index: Map<string, Target[]>,
): Target {
	const sourceBase = baseNameOf(sourceTable);
	if (!sourceBase) return target;
	const key = normalize(sourceBase);
	if (target.base !== key && target.entity !== key) return target;
	const twin = (index.get(key) ?? []).find(
		(c) => c.table.startsWith("STA_") && (c.base === key || c.entity === key),
	);
	return twin ?? target;
}

function lookup(index: Map<string, Target[]>, rawKey: string): Target | null {
	const key = normalize(rawKey);
	const direct = index.get(key);
	if (direct) return pickTarget(direct, key);
	// Singular/plural tolerance; short keys are too ambiguous ("new" -> "news").
	if (key.length < 4) return null;
	const variant = key.endsWith("s") ? key.slice(0, -1) : `${key}s`;
	const alternate = index.get(variant);
	return alternate ? pickTarget(alternate, variant) : null;
}

/**
 * Last-resort match: the suffix is a truncation of the target's name
 * (`fkIDstatut` -> cyclist_statut, `fkIDcontract` -> contract_cyclist).
 * Ambiguities are broken by token overlap with the source table, then by the
 * shortest extension; a remaining tie resolves to nothing.
 */
function resolveByTruncation(
	rawKeys: string[],
	sourceTable: string,
	index: Map<string, Target[]>,
): Target | null {
	const sourceTokens = tokenSet(sourceTable);
	for (const rawKey of rawKeys) {
		const key = normalize(rawKey);
		if (key.length < 4) continue;

		const matches: Target[] = [];
		for (const [indexKey, targets] of index) {
			if (indexKey === key) continue;
			if (!indexKey.startsWith(key) && !indexKey.endsWith(key)) continue;
			const target = pickTarget(targets, indexKey);
			if (target && !matches.some((m) => m.table === target.table)) {
				matches.push(target);
			}
		}
		if (matches.length === 0) continue;
		if (matches.length === 1) return matches[0];

		const scored = matches
			.map((target) => ({
				target,
				overlap: tokenOverlap(tokenSet(target.table), sourceTokens),
			}))
			.sort(
				(a, b) =>
					b.overlap - a.overlap ||
					a.target.table.length - b.target.table.length,
			);
		const [best, runnerUp] = scored;
		if (
			best.overlap > runnerUp.overlap ||
			best.target.table.length < runnerUp.target.table.length
		) {
			return best.target;
		}
	}
	return null;
}

function resolveForeignKey(
	column: string,
	sourceTable: string,
	index: Map<string, Target[]>,
	pkByTable: Map<string, string | null>,
): ForeignKey | null {
	if (
		NON_FK_COLUMNS.has(column) ||
		NON_FK_PATTERNS.some((p) => p.test(column))
	) {
		return null;
	}

	const curated = FK_EXCEPTIONS[column];
	if (curated) {
		const refColumn = pkByTable.get(curated);
		return refColumn ? { column, refTable: curated, refColumn } : null;
	}

	const suffix = column.slice("fkID".length).replace(/^_+/, "");
	if (!suffix) return null;

	const toForeignKey = (target: Target): ForeignKey => {
		const resolved = preferCatalogueTwin(target, sourceTable, index);
		return { column, refTable: resolved.table, refColumn: resolved.idColumn };
	};

	// 1. Exact match, then modifier-prefix and trailing-digit stripping.
	const directKeys = [suffix];
	const modifierStripped: string[] = [];
	for (const modifier of FK_MODIFIERS) {
		if (!suffix.startsWith(modifier)) continue;
		let rest = suffix.slice(modifier.length);
		if (rest.startsWith("_")) rest = rest.slice(1);
		if (rest) modifierStripped.push(rest);
	}
	directKeys.push(...modifierStripped);
	const withoutDigits = suffix.replace(/\d+$/, "");
	if (withoutDigits !== suffix && withoutDigits) directKeys.push(withoutDigits);
	for (const key of directKeys) {
		const target = lookup(index, key);
		if (target) return toForeignKey(target);
	}

	// 2. Drop role tokens (leading first, then trailing, longest remainder
	// first); competing hits are ranked by token overlap with the source table
	// (`fkIDtype_stage` prefers training_stages_type over stage).
	const tokens = suffix.split("_").filter(Boolean);
	if (tokens.length > 1) {
		const dropKeys = [tokens.slice(1).join("_")];
		for (let end = tokens.length - 1; end >= 1; end--) {
			dropKeys.push(tokens.slice(0, end).join("_"));
		}
		const sourceTokens = tokenSet(sourceTable);
		let best: Target | null = null;
		let bestOverlap = -1;
		for (const key of dropKeys) {
			const target = lookup(index, key);
			if (!target) continue;
			const overlap = tokenOverlap(tokenSet(target.table), sourceTokens);
			if (overlap > bestOverlap) {
				best = target;
				bestOverlap = overlap;
			}
		}
		if (best) return toForeignKey(best);
	}

	// 3. Truncated entity names.
	const truncated = resolveByTruncation(
		[suffix, ...modifierStripped],
		sourceTable,
		index,
	);
	return truncated ? toForeignKey(truncated) : null;
}

/**
 * Infer primary and foreign keys for every table from the naming conventions.
 * @param tables - Table metadata as read from the CDB file.
 * @returns A map from table name to its inferred keys.
 */
export function inferKeys(tables: TableInfo[]): Map<string, TableKeys> {
	const pkByTable = new Map<string, string | null>(
		tables.map((t) => [t.name, detectPrimaryKey(t)]),
	);

	// Identity index over two axes — identity-column entity and table base
	// name — so that e.g. STA_simulate_status is reachable both as
	// fkIDsimulate_status and via its IDinrace_status entity.
	const index = new Map<string, Target[]>();
	const register = (key: string | null, target: Target) => {
		if (!key) return;
		const bucket = index.get(key);
		if (bucket) bucket.push(target);
		else index.set(key, [target]);
	};
	for (const table of tables) {
		const idColumn = pkByTable.get(table.name);
		if (!idColumn) continue;
		const base = baseNameOf(table.name);
		const target: Target = {
			table: table.name,
			idColumn,
			base: base ? normalize(base) : null,
			entity: /^ID./.test(idColumn) ? normalize(idColumn.slice(2)) : null,
		};
		register(target.entity, target);
		if (target.base !== target.entity) register(target.base, target);
	}

	const result = new Map<string, TableKeys>();
	for (const table of tables) {
		const primaryKey = pkByTable.get(table.name) ?? null;
		const foreignKeys: ForeignKey[] = [];

		// 1:1 extension tables share the owner's identity column as their PK
		// (DYN_cyclist_fitness.IDcyclist -> DYN_cyclist).
		if (primaryKey && /^ID./.test(primaryKey)) {
			const entityKey = normalize(primaryKey.slice(2));
			const base = baseNameOf(table.name);
			if (base && normalize(base) !== entityKey) {
				const owners = (index.get(entityKey) ?? []).filter(
					(c) => c.base === entityKey,
				);
				const owner = pickTarget(owners, entityKey);
				if (owner && owner.table !== table.name) {
					foreignKeys.push({
						column: primaryKey,
						refTable: owner.table,
						refColumn: owner.idColumn,
					});
				}
			}
		}

		for (const col of table.columns) {
			if (!col.name.startsWith("fkID")) continue;
			const fk = resolveForeignKey(col.name, table.name, index, pkByTable);
			if (fk) foreignKeys.push(fk);
		}

		result.set(table.name, { primaryKey, foreignKeys });
	}

	return result;
}
