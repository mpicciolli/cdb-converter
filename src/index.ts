/**
 * cdb-converter
 * TypeScript library for converting Pro Cycling Manager CDB files
 */

export { cdbToSql } from "./cdbToSql";
export { sqlToCdb } from "./sqlToCdb";
export { compressCdb, decompressCdb } from "./compression";
export { CDBReader } from "./reader";
export { CDBWriter } from "./writer";

export type {
	ChunkHeader,
	ColumnData,
	ColumnInfo,
	ColumnMetadata,
	SqlDatabase,
	TableInfo,
	CDBChunk,
} from "./types";

export { ChunkType, DataType, Magic } from "./types";
export {
	CHUNK_TYPE,
	DATA_TYPE,
	MAGIC,
	TABLE_FLAGS_BY_ID,
} from "./tableMetadata";
