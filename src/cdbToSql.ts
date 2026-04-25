/**
 * Convert CDB binary format to SQLite database
 */

import { decompressCdb } from "./compression";
import { CDBReader } from "./reader";
import { CHUNK_TYPE, DATA_TYPE } from "./tableMetadata";
import type { SqlDatabase, SqlJsStatic, TableInfo } from "./types";

/**
 * Convert CDB binary data to SQLite database instance
 * @param cdbData - Raw CDB binary data (compressed or uncompressed)
 * @param SQL - sql.js instance from initSqlJs()
 * @returns SQLite database with CDB tables loaded
 */
export function cdbToSql(
	cdbData: ArrayBuffer | Buffer,
	SQL: SqlJsStatic,
): SqlDatabase {
	const decompressedData = decompressCdb(cdbData);
	const reader = new CDBReader(decompressedData);
	const db = new SQL.Database();

	const wrapperChunk = reader.readChunk();
	const wrapperChildren = wrapperChunk.children;
	if (!wrapperChildren) {
		throw new Error("Missing wrapper chunk children");
	}

	const tables =
		(wrapperChildren[CHUNK_TYPE.DATABASE_TABLES] as TableInfo[] | undefined) ??
		[];

	// DB_STRUCTURE uses special encoding: table_id=1, columns indexed from 1
	db.run(`CREATE TABLE DB_STRUCTURE (TableName TEXT '274', ID INTEGER)`);

	// Store TABLE_FLAGS in memory (attached to db object, not in SQLite)
	const tableFlagsMap = new Map<number, number>();
	db._tableFlagsMap = tableFlagsMap;

	tables.forEach((table) => {
		if (table.tableId === null) {
			throw new Error(`Table '${table.name}' has null tableId`);
		}
		db.run(`INSERT INTO DB_STRUCTURE VALUES (?, ?)`, [
			table.name,
			table.tableId,
		]);
		tableFlagsMap.set(table.tableId, table.tableFlags);

		// Keep columns in original file order (do NOT sort)
		const columnDefs = table.columns
			.map((col) => {
				let baseType: string;
				switch (col.type) {
					case DATA_TYPE.FLOAT:
						baseType = "REAL";
						break;
					case DATA_TYPE.STRING:
					case DATA_TYPE.INTEGER_LIST:
					case DATA_TYPE.FLOAT_LIST:
						baseType = "TEXT";
						break;
					case DATA_TYPE.BOOLEAN:
						baseType = "NUMERIC";
						break;
					default:
						baseType = "INTEGER";
						break;
				}

				const encodedValue =
					(table.tableId * 256 + col.columnIndex) * 16 + (col.type & 0xf);
				return `"${col.name}" '${baseType} ${encodedValue}'`;
			})
			.join(", ");

		db.run(`CREATE TABLE "${table.name}" (${columnDefs})`);

		// Insert rows in batches (SQLite limit: 999 variables)
		if (table.rowCount > 0) {
			const columnsPerRow = table.columns.length;
			const maxRowsPerBatch = Math.floor(999 / columnsPerRow);
			const placeholders = table.columns.map(() => "?").join(", ");

			for (let i = 0; i < table.rowCount; i += maxRowsPerBatch) {
				const end = Math.min(i + maxRowsPerBatch, table.rowCount);
				const batchCount = end - i;
				const valueSets = Array(batchCount)
					.fill(`(${placeholders})`)
					.join(", ");
				const params: unknown[] = [];

				for (let rowIdx = i; rowIdx < end; rowIdx++) {
					for (const col of table.columns) {
						params.push(col.data[rowIdx]);
					}
				}

				db.run(`INSERT INTO "${table.name}" VALUES ${valueSets}`, params);
			}
		}
	});

	return db;
}
