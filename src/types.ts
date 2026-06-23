/**
 * Shared TypeScript types and interfaces for CDB converter library
 */

export enum DataType {
	INTEGER = 0,
	FLOAT = 1,
	STRING = 2,
	BOOLEAN = 3,
	INTEGER_BYTE = 4,
	INTEGER_SHORT = 5,
	FLOAT_LIST = 10,
	INTEGER_LIST = 11,
}

export enum ChunkType {
	WRAPPER = 0x00,
	DATABASE_TABLES = 0x01,
	DATABASE_FLAGS = 0x02,
	TABLE = 0x10,
	ROW_COUNT = 0x11,
	COLUMN_DEFINITIONS = 0x12,
	TABLE_ID = 0x15,
	TABLE_FLAGS = 0x16,
	COLUMN = 0x20,
	COLUMN_DATA_TYPE = 0x21,
	COLUMN_VALUES = 0x22,
	COLUMN_BLOB_DATA = 0x23,
	COLUMN_INDEX = 0x24,
}

export enum Magic {
	CHUNK_BEGIN = 0xaaaaaaaa,
	CHUNK_SEPARATOR = 0xbbbbbbbb,
	CHUNK_END = 0xcccccccc,
	ARRAY_BEGIN = 0xdddddddd,
	ARRAY_END = 0xeeeeeeee,
	COMPRESSION_MAGIC = 0xffffffff,
}

export interface ChunkHeader {
	chunkSize: number;
	chunkType: ChunkType;
	flags: number;
	description: string | null;
}

export interface ColumnInfo {
	name: string;
	type: DataType;
	columnIndex: number;
	data: unknown[];
}

export interface TableInfo {
	name: string;
	rowCount: number;
	columns: ColumnInfo[];
	tableId: number;
	tableFlags: number;
}

export interface CDBChunk {
	type: ChunkType;
	header?: ChunkHeader;
	value?: unknown;
	children?: Record<number, unknown>;
}

export type ColumnData = Array<string | number | boolean>;

export interface SqlJsStatic {
	Database: new (data?: ArrayLike<number>) => SqlDatabase;
}

export interface SqlDatabase {
	run(sql: string, params?: unknown[] | Record<string, unknown> | null): void;
	exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
	export(): Uint8Array;
	close(): void;
	_tableFlagsMap?: Map<number, number>;
}

export interface ColumnMetadata {
	sqliteType: string;
	cdbDataType: DataType;
	cdbColumnIndex: number;
}
