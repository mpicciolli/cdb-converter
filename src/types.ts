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

export type SqlValue = string | number | Uint8Array | null;

export interface SqlExecResult {
	columns: string[];
	values: SqlValue[][];
}

export interface SqlDatabase {
	run(sql: string, params?: SqlValue[]): void;
	exec(sql: string): SqlExecResult[];
	export(): Uint8Array;
	close(): void;
}

export interface SqlEngine {
	Database: new (data?: Uint8Array | number[] | undefined) => SqlDatabase;
}

export interface ColumnMetadata {
	sqliteType: string;
	cdbDataType: DataType;
	cdbColumnIndex: number;
}

export interface CdbToSqlOptions {
	/**
	 * Reconstruct PRIMARY KEY / FOREIGN KEY constraints from the PCM save naming
	 * conventions, producing a normalized SQLite schema. Off by default.
	 *
	 * Foreign keys are declarative only (`PRAGMA foreign_keys` stays OFF) and are
	 * ignored by `sqlToCdb`, so the round-trip back to CDB is unaffected.
	 */
	normalize?: boolean;

	/**
	 * Also create an index on every reconstructed foreign-key column, to speed up
	 * relationship navigation / JOINs. Only applies when `normalize` is true.
	 *
	 * Off by default: these indexes account for the bulk of the normalized file
	 * size (roughly doubling it) and conversion overhead. Enable it only when you
	 * intend to run frequent filtered JOINs on the output.
	 */
	indexForeignKeys?: boolean;
}
