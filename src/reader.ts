/**
 * CDB binary format reader
 * Handles parsing of chunk hierarchy, data types, and value unpacking
 */

import type {
	ChunkHeader,
	CDBChunk,
	ColumnData,
	DataType,
	ColumnInfo,
} from "./types";
import { CHUNK_TYPE, DATA_TYPE, MAGIC } from "./tableMetadata";

type ColumnDefinition = Omit<ColumnInfo, "data"> & {
	data?: ColumnData;
	columnChunk?: CDBChunk;
};

export class CDBReader {
	private data: DataView;
	private pos: number;

	constructor(arrayBuffer: ArrayBuffer | Uint8Array) {
		const bytes =
			arrayBuffer instanceof Uint8Array
				? arrayBuffer
				: new Uint8Array(arrayBuffer);

		this.data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		this.pos = 0;
	}

	private getChunkChildren(chunk: CDBChunk): Record<number, unknown> {
		if (!chunk.children) {
			throw new Error(`Chunk ${chunk.type} is missing children`);
		}

		return chunk.children;
	}

	private getChunkHeader(chunk: CDBChunk): ChunkHeader {
		if (!chunk.header) {
			throw new Error(`Chunk ${chunk.type} is missing a header`);
		}

		return chunk.header;
	}

	private getRequiredChild<T>(chunk: CDBChunk, childType: number): T {
		const children = this.getChunkChildren(chunk);
		const value = children[childType];

		if (value === undefined) {
			throw new Error(`Chunk ${chunk.type} is missing child ${childType}`);
		}

		return value as T;
	}

	private read32(): number {
		if (this.pos + 4 > this.data.byteLength) {
			throw new Error(`Read past end of file at position ${this.pos}`);
		}
		const value = this.data.getUint32(this.pos, true); // little-endian
		this.pos += 4;
		return value;
	}

	private readBytes(length: number): Uint8Array {
		if (this.pos + length > this.data.byteLength) {
			throw new Error(`Read past end of file at position ${this.pos}`);
		}
		const bytes = new Uint8Array(
			this.data.buffer,
			this.data.byteOffset + this.pos,
			length,
		);
		this.pos += length;
		return bytes;
	}

	private readPadding(): void {
		const padding = (4 - (this.pos & 3)) & 3;
		this.pos += padding;
	}

	private readMagic(expected: number, label: string): void {
		const actual = this.read32();

		if (actual !== expected) {
			throw new Error(
				`Invalid ${label} magic: expected 0x${expected.toString(16)}, got 0x${actual.toString(16)}`,
			);
		}
	}

	private readChunkHeader(): ChunkHeader {
		this.readMagic(MAGIC.CHUNK_BEGIN, "CHUNK_BEGIN");
		const chunkSize = this.read32();
		const chunkType = this.read32();
		const flags = this.read32();
		const hasDescription = this.read32();

		let description: string | null = null;
		if (hasDescription) {
			const descLength = this.read32();
			const descBytes = this.readBytes(descLength - 1);
			description = new TextDecoder().decode(descBytes);
			this.pos++; // null terminator
		}

		this.readPadding();
		this.readMagic(MAGIC.CHUNK_SEPARATOR, "CHUNK_SEPARATOR");

		return { chunkSize, chunkType, flags, description };
	}

	readChunk(): CDBChunk {
		const chunkStartPos = this.pos;
		const header = this.readChunkHeader();
		const chunkEndPos = chunkStartPos + header.chunkSize;

		let result: CDBChunk;

		switch (header.chunkType) {
			case CHUNK_TYPE.ROW_COUNT:
			case CHUNK_TYPE.TABLE_ID:
			case CHUNK_TYPE.TABLE_FLAGS:
			case CHUNK_TYPE.DATABASE_FLAGS:
			case CHUNK_TYPE.COLUMN_INDEX:
			case CHUNK_TYPE.COLUMN_DATA_TYPE:
				result = { type: header.chunkType, value: this.read32() };
				break;

			case CHUNK_TYPE.COLUMN_VALUES:
				{
					const dataBytes = chunkEndPos - this.pos - 4;
					const values: number[] = [];
					for (let i = 0; i < dataBytes / 4; i++) {
						values.push(this.read32());
					}
					result = { type: header.chunkType, value: values };
				}
				break;

			case CHUNK_TYPE.COLUMN_BLOB_DATA:
				{
					const sizedDataBytes = chunkEndPos - this.pos - 4;
					result = {
						type: header.chunkType,
						value: this.readBytes(sizedDataBytes),
					};
				}
				break;

			case CHUNK_TYPE.DATABASE_TABLES:
				{
					const tables = this.readArray(() => {
						const tableChunk = this.readChunk();
						const rowCount =
							this.getRequiredChild<number>(tableChunk, CHUNK_TYPE.ROW_COUNT) ||
							0;
						const columnDefinitions = this.getRequiredChild<ColumnDefinition[]>(
							tableChunk,
							CHUNK_TYPE.COLUMN_DEFINITIONS,
						);
						const columns: ColumnInfo[] = columnDefinitions.map((column) => ({
							name: column.name,
							type: column.type,
							columnIndex: column.columnIndex,
							data: column.columnChunk
								? this.convertColumnData(column.columnChunk, rowCount)
								: (column.data ?? []),
						}));

						return {
							name: this.getChunkHeader(tableChunk).description,
							rowCount,
							columns,
							tableId: this.getRequiredChild<number>(
								tableChunk,
								CHUNK_TYPE.TABLE_ID,
							),
							tableFlags: this.getRequiredChild<number>(
								tableChunk,
								CHUNK_TYPE.TABLE_FLAGS,
							),
						};
					});
					result = { type: header.chunkType, value: tables };
				}
				break;

			case CHUNK_TYPE.COLUMN_DEFINITIONS:
				{
					const columns = this.readArray(() => {
						const columnChunk = this.readChunk();
						const colName = this.getChunkHeader(columnChunk).description;

						return {
							name: colName,
							type: this.getRequiredChild<DataType>(
								columnChunk,
								CHUNK_TYPE.COLUMN_DATA_TYPE,
							),
							columnIndex: this.getRequiredChild<number>(
								columnChunk,
								CHUNK_TYPE.COLUMN_INDEX,
							),
							columnChunk: columnChunk, // Store for later conversion
						};
					});
					result = { type: header.chunkType, value: columns };
				}
				break;

			case CHUNK_TYPE.WRAPPER:
			case CHUNK_TYPE.TABLE:
			case CHUNK_TYPE.COLUMN:
				{
					const children: Record<number, unknown> = {};
					while (this.pos < chunkEndPos) {
						if (chunkEndPos - this.pos < 20) {
							break;
						}
						const chunk = this.readChunk();
						children[chunk.type as number] = chunk.value;
					}
					result = {
						type: header.chunkType,
						header,
						children,
					};
				}
				break;

			default:
				throw new Error(
					`Unknown chunk type: 0x${(header.chunkType as number).toString(16)}`,
				);
		}

		this.readPadding();
		this.read32(); // CHUNK_END magic
		return result;
	}

	private readArray<T>(itemReader: () => T): T[] {
		this.read32(); // ARRAY_BEGIN
		const count = this.read32();
		const items: T[] = [];

		for (let i = 0; i < count; i++) {
			items.push(itemReader());
		}

		this.read32(); // ARRAY_END
		return items;
	}

	private convertColumnData(
		columnChunk: CDBChunk,
		rowCount: number,
	): ColumnData {
		const dataType = this.getRequiredChild<DataType>(
			columnChunk,
			CHUNK_TYPE.COLUMN_DATA_TYPE,
		);
		const rawData =
			(this.getChunkChildren(columnChunk)[CHUNK_TYPE.COLUMN_VALUES] as
				| number[]
				| undefined) ?? [];
		const sizedData =
			(this.getChunkChildren(columnChunk)[CHUNK_TYPE.COLUMN_BLOB_DATA] as
				| Uint8Array
				| undefined) ?? new Uint8Array([0, 0, 0, 0]);

		// If no data, return array of zeros/empty strings based on type
		if (rawData.length === 0 && rowCount !== undefined) {
			switch (dataType) {
				case DATA_TYPE.STRING:
					return Array(rowCount).fill("");
				case DATA_TYPE.FLOAT:
					return Array(rowCount).fill(0.0);
				case DATA_TYPE.FLOAT_LIST:
				case DATA_TYPE.INTEGER_LIST:
					return Array(rowCount).fill("()");
				default:
					return Array(rowCount).fill(0);
			}
		}

		switch (dataType) {
			case DATA_TYPE.INTEGER:
				return rawData.map((value) => value | 0);

			case DATA_TYPE.BOOLEAN: {
				if (rowCount === undefined) {
					throw new Error("Row count required for boolean type");
				}
				const bytes = new Uint8Array(new Uint32Array(rawData).buffer);
				const boolValues: number[] = [];
				for (let i = 0; i < rowCount; i++) {
					const byteIndex = Math.floor(i / 8);
					const bitIndex = i % 8;
					boolValues.push((bytes[byteIndex] >> bitIndex) & 1);
				}
				return boolValues;
			}

			case DATA_TYPE.INTEGER_BYTE: {
				const bytes = new Uint8Array(new Uint32Array(rawData).buffer).slice(
					0,
					rowCount,
				);
				return Array.from(bytes, (b) => (b > 127 ? b - 256 : b));
			}

			case DATA_TYPE.INTEGER_SHORT: {
				const bytes = new Uint8Array(new Uint32Array(rawData).buffer);
				const int16Values: number[] = [];
				for (let i = 0; i < rowCount; i++) {
					const value = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
					int16Values.push(value > 32767 ? value - 65536 : value);
				}
				return int16Values;
			}

			case DATA_TYPE.FLOAT: {
				const view = new DataView(new ArrayBuffer(4));
				return rawData.map((intValue) => {
					view.setUint32(0, intValue, true);
					return view.getFloat32(0, true);
				});
			}

			case DATA_TYPE.STRING:
				return this.parseStrings(sizedData, rawData);

			case DATA_TYPE.INTEGER_LIST:
				return this.parseNumericLists(sizedData, rawData, (view, offset) => {
					return view.getUint32(offset, true) | 0;
				});

			case DATA_TYPE.FLOAT_LIST:
				return this.parseNumericLists(
					sizedData,
					rawData,
					(view, offset, count) => {
						const value = view.getFloat32(offset, true);
						let formatted = value
							.toFixed(6)
							.replace(/(\.\d*?)0+$/, "$1")
							.replace(/\.$/, "");
						if (!formatted.includes(".") && count > 1) {
							formatted += ".0";
						}
						return formatted;
					},
				);

			default:
				throw new Error(`Unknown data type: ${dataType}`);
		}
	}

	private parseStrings(sizedData: Uint8Array, lengths: number[]): string[] {
		let currentOffset = 4;

		return lengths.map((stringLength) => {
			const stringBytes = sizedData.subarray(
				currentOffset,
				currentOffset + stringLength - 1,
			);
			currentOffset += stringLength;
			return new TextDecoder().decode(stringBytes);
		});
	}

	private parseNumericLists(
		sizedData: Uint8Array,
		counts: number[],
		readValue: (
			view: DataView,
			offset: number,
			count: number,
		) => string | number,
	): string[] {
		const view = new DataView(
			sizedData.buffer,
			sizedData.byteOffset,
			sizedData.byteLength,
		);
		let currentOffset = 4;

		return counts.map((count) => {
			const values = Array.from({ length: count }, () => {
				const value = readValue(view, currentOffset, count);
				currentOffset += 4;
				return value;
			});
			return `(${values.join(",")})`;
		});
	}
}
