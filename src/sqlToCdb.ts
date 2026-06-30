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

function parseColumnMetadata(colName: string, colType: string): ColumnMetadata {
	const trimmedType = colType.trim();
	const match = trimmedType.match(/^(\S+)\s+(\d+)$/);
	if (!match) {
		throw new Error(
			`Invalid encoded column type for "${colName}": expected "<sqlite type> <encoded number>", got "${colType}"`,
		);
	}

	const sqliteType = match[1];
	const encodedValue = Number.parseInt(match[2], 10);
	const dataType = encodedValue & 0xf;
	const columnIndex = Math.floor(encodedValue / 16) & 0xff;

	return {
		sqliteType,
		cdbDataType: toDataType(dataType),
		cdbColumnIndex: columnIndex,
	};
}

/**
 * Convert SQLite database back to CDB binary format
 * @param db - sql.js Database instance (must have DB_STRUCTURE table)
 * @returns Compressed CDB binary data (ArrayBuffer)
 */
export function sqlToCdb(db: SqlDatabase): ArrayBuffer {
	const structureInfo = db.exec(`PRAGMA table_info("DB_STRUCTURE")`);
	const hasFlagsColumn =
		structureInfo.length > 0 &&
		structureInfo[0].values.some((row) => row[1] === "Flags");

	const tablesResult = db.exec(
		hasFlagsColumn
			? `SELECT TableName, ID, Flags FROM DB_STRUCTURE ORDER BY ID`
			: `SELECT TableName, ID FROM DB_STRUCTURE ORDER BY ID`,
	);
	if (tablesResult.length === 0) {
		throw new Error("No DB_STRUCTURE table found");
	}

	const tables = tablesResult[0].values.map((row) => ({
		name: row[0] as string,
		id: row[1] as number,
		flags: hasFlagsColumn ? (row[2] as number | null) : null,
	}));

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
		if (schemaResult.length === 0 || schemaResult[0].values.length === 0) {
			throw new Error(
				`No schema information available for table "${tableInfo.name}"`,
			);
		}

		const columnInfo: Record<string, ColumnMetadata> = {};

		schemaResult[0].values.forEach((row) => {
			const colName = row[1] as string;
			const colType = row[2] as string;

			columnInfo[colName] = parseColumnMetadata(colName, colType);
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
		const tableFlags = tableInfo.flags ?? TABLE_FLAGS_BY_ID[tableInfo.id] ?? 0;
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
