/**
 * Convert SQLite database back to CDB binary format
 */

import { compressCdb } from "./compression";
import { CDBWriter } from "./writer";
import {
	CHUNK_TYPE,
	DATA_TYPE,
	MAGIC,
	TABLE_FLAGS_BY_ID,
} from "./tableMetadata";
import type { ColumnMetadata, DataType, SqlDatabase } from "./types";

function toDataType(value: number): DataType {
	switch (value) {
		case DATA_TYPE.INTEGER:
		case DATA_TYPE.FLOAT:
		case DATA_TYPE.STRING:
		case DATA_TYPE.BOOLEAN:
		case DATA_TYPE.INTEGER_BYTE:
		case DATA_TYPE.INTEGER_SHORT:
		case DATA_TYPE.FLOAT_LIST:
		case DATA_TYPE.INTEGER_LIST:
			return value;
		default:
			throw new Error(`Unsupported CDB data type: ${value}`);
	}
}

/**
 * Convert SQLite database back to CDB binary format
 * @param db - sql.js Database instance (must have DB_STRUCTURE table)
 * @returns Compressed CDB binary data (ArrayBuffer)
 */
export function sqlToCdb(db: SqlDatabase): ArrayBuffer {
	const tablesResult = db.exec(
		`SELECT TableName, ID FROM DB_STRUCTURE ORDER BY ID`,
	);
	if (tablesResult.length === 0) {
		throw new Error("No DB_STRUCTURE table found");
	}

	const tables = tablesResult[0].values.map((row) => ({
		name: row[0] as string,
		id: row[1] as number,
	}));

	// Use in-memory table flags map if available, otherwise fall back to hardcoded values
	const tableFlagsMap = db._tableFlagsMap || new Map<number, number>();

	const estimatedSize = db.export().length;
	const writer = new CDBWriter(estimatedSize);

	writer.writeChunkOpen(CHUNK_TYPE.WRAPPER, "cyanide database");
	writer.writeChunkOpen(CHUNK_TYPE.DATABASE_FLAGS);
	writer.write32(274);
	writer.writeChunkClose();

	writer.writeChunkOpen(CHUNK_TYPE.DATABASE_TABLES);
	writer.write32(MAGIC.ARRAY_BEGIN);
	writer.write32(tables.length);

	tables.forEach((tableInfo) => {
		const schemaResult = db.exec(`PRAGMA table_info("${tableInfo.name}")`);
		const columnInfo: Record<string, ColumnMetadata> = {};

		schemaResult[0].values.forEach((row) => {
			const colName = row[1] as string;
			const colType = row[2] as string;

			// Extract encoded value from column type (e.g., 'INTEGER 12345')
			const match = colType.match(/\s+(\d+)/);
			const encodedValue = parseInt(match?.[1] || "0", 10);

			// Formula: (table_id * 256 + column_index) * 16 + dataType
			const dataType = encodedValue & 0xf;
			const columnIndex = Math.floor(encodedValue / 16) & 0xff;

			columnInfo[colName] = {
				sqliteType: colType.split(" ")[0],
				cdbDataType: toDataType(dataType),
				cdbColumnIndex: columnIndex,
			};
		});

		const dataResult = db.exec(`SELECT * FROM "${tableInfo.name}"`);
		const rows = dataResult.length > 0 ? dataResult[0].values : [];

		writer.writeChunkOpen(CHUNK_TYPE.TABLE, tableInfo.name);

		writer.writeChunkOpen(CHUNK_TYPE.TABLE_ID);
		writer.write32(tableInfo.id);
		writer.writeChunkClose();

		writer.writeChunkOpen(CHUNK_TYPE.ROW_COUNT);
		writer.write32(rows.length);
		writer.writeChunkClose();

		writer.writeChunkOpen(CHUNK_TYPE.TABLE_FLAGS);
		const tableFlags =
			tableFlagsMap.get(tableInfo.id) ?? TABLE_FLAGS_BY_ID[tableInfo.id] ?? 0;
		writer.write32(tableFlags);
		writer.writeChunkClose();

		writer.writeChunkOpen(CHUNK_TYPE.COLUMN_DEFINITIONS);
		writer.write32(MAGIC.ARRAY_BEGIN);
		writer.write32(Object.keys(columnInfo).length);

		// Transpose row data to column data in single pass
		const columnNames = Object.keys(columnInfo);
		const columnData: unknown[][] = columnNames.map(() => []);
		rows.forEach((row) => {
			row.forEach((value, colIdx) => {
				columnData[colIdx].push(value);
			});
		});

		columnNames.forEach((columnName, colIdx) => {
			writer.writeChunkOpen(CHUNK_TYPE.COLUMN, columnName);

			const info = columnInfo[columnName];

			writer.writeChunkOpen(CHUNK_TYPE.COLUMN_INDEX);
			writer.write32(info.cdbColumnIndex);
			writer.writeChunkClose();

			writer.writeChunkOpen(CHUNK_TYPE.COLUMN_DATA_TYPE, columnName);
			writer.write32(info.cdbDataType);
			writer.writeChunkClose();

			writer.writeColumnData(info.cdbDataType, columnData[colIdx]);

			writer.writeChunkClose();
		});

		writer.write32(MAGIC.ARRAY_END);
		writer.writeChunkClose();

		writer.writeChunkClose();
	});

	writer.write32(MAGIC.ARRAY_END);
	writer.writeChunkClose();
	writer.writeChunkClose();

	return compressCdb(writer.getData());
}
