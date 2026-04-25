/**
 * Convert CDB binary format to SQLite database
 */

import { decompressCdb } from "./compression";
import { CDBReader } from "./reader";
import { CHUNK_TYPE, DATA_TYPE, TABLE_FLAGS_BY_ID } from "./tableMetadata";
import { type SqlDatabase, type SqlJsStatic } from "./types";

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
	const tables =
		(wrapperChunk.children![CHUNK_TYPE.DATABASE_TABLES] as any[]) || [];

	// DB_STRUCTURE uses special encoding: table_id=1, columns indexed from 1
	db.run(`CREATE TABLE DB_STRUCTURE (TableName TEXT '274', ID INTEGER)`);

	// Store TABLE_FLAGS in memory (attached to db object, not in SQLite)
	db._tableFlagsMap = new Map();

	tables.forEach((table: any) => {
		if (table.tableId === null) {
			throw new Error(`Table '${table.name}' has null tableId`);
		}
		db.run(`INSERT INTO DB_STRUCTURE VALUES (?, ?)`, [
			table.name,
			table.tableId,
		]);
		db._tableFlagsMap!.set(table.tableId, table.tableFlags);

		// Keep columns in original file order (do NOT sort)
		const columnDefs = table.columns
			.map((col: any) => {
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
					table.columns.forEach((col: any) => params.push(col.data[rowIdx]));
				}

				db.run(`INSERT INTO "${table.name}" VALUES ${valueSets}`, params);
			}
		}
	});

	return db;
}
