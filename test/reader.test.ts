import { describe, expect, it, vi } from "vitest";
import { CDBReader } from "../src/reader";
import { CHUNK_TYPE, DATA_TYPE, MAGIC } from "../src/tableMetadata";
import { CDBWriter } from "../src/writer";

function createChunkBuffer(overrides?: {
	chunkBegin?: number;
	chunkSeparator?: number;
}): Uint8Array {
	const buffer = new ArrayBuffer(28);
	const view = new DataView(buffer);

	view.setUint32(0, overrides?.chunkBegin ?? MAGIC.CHUNK_BEGIN, true);
	view.setUint32(4, 28, true);
	view.setUint32(8, CHUNK_TYPE.WRAPPER, true);
	view.setUint32(12, 0, true);
	view.setUint32(16, 0, true);
	view.setUint32(20, overrides?.chunkSeparator ?? MAGIC.CHUNK_SEPARATOR, true);
	view.setUint32(24, MAGIC.CHUNK_END, true);

	return new Uint8Array(buffer);
}

function createWrapperWithMissingColumnDescription(): Uint8Array {
	const writer = new CDBWriter();

	writer.writeChunkOpen(CHUNK_TYPE.WRAPPER);
	writer.writeChunkOpen(CHUNK_TYPE.DATABASE_TABLES);
	writer.write32(MAGIC.ARRAY_BEGIN);
	writer.write32(1);
	writer.writeChunkOpen(CHUNK_TYPE.TABLE, "TestTable");
	writer.writeChunkOpen(CHUNK_TYPE.ROW_COUNT);
	writer.write32(0);
	writer.writeChunkClose();
	writer.writeChunkOpen(CHUNK_TYPE.TABLE_ID);
	writer.write32(1);
	writer.writeChunkClose();
	writer.writeChunkOpen(CHUNK_TYPE.TABLE_FLAGS);
	writer.write32(0);
	writer.writeChunkClose();
	writer.writeChunkOpen(CHUNK_TYPE.COLUMN_DEFINITIONS);
	writer.write32(MAGIC.ARRAY_BEGIN);
	writer.write32(1);
	writer.writeChunkOpen(CHUNK_TYPE.COLUMN);
	writer.writeChunkOpen(CHUNK_TYPE.COLUMN_DATA_TYPE);
	writer.write32(DATA_TYPE.INTEGER);
	writer.writeChunkClose();
	writer.writeChunkOpen(CHUNK_TYPE.COLUMN_INDEX);
	writer.write32(0);
	writer.writeChunkClose();
	writer.writeChunkClose();
	writer.write32(MAGIC.ARRAY_END);
	writer.writeChunkClose();
	writer.writeChunkClose();
	writer.write32(MAGIC.ARRAY_END);
	writer.writeChunkClose();
	writer.writeChunkClose();

	return writer.getData();
}

function createUnknownChunkBuffer(payloadLength: number): Uint8Array {
	const chunkSize = 28 + payloadLength;
	const buffer = new ArrayBuffer(chunkSize);
	const view = new DataView(buffer);

	view.setUint32(0, MAGIC.CHUNK_BEGIN, true);
	view.setUint32(4, chunkSize, true);
	view.setUint32(8, 0x99, true); // unknown chunk type
	view.setUint32(12, 0, true);
	view.setUint32(16, 0, true);
	view.setUint32(20, MAGIC.CHUNK_SEPARATOR, true);
	view.setUint32(24 + payloadLength, MAGIC.CHUNK_END, true);

	return new Uint8Array(buffer);
}

describe("CDBReader", () => {
	it("throws when CHUNK_BEGIN magic is invalid", () => {
		const reader = new CDBReader(createChunkBuffer({ chunkBegin: 0x12345678 }));

		expect(() => reader.readChunk()).toThrowError(
			"Invalid CHUNK_BEGIN magic: expected 0xaaaaaaaa, got 0x12345678",
		);
	});

	it("throws when CHUNK_SEPARATOR magic is invalid", () => {
		const reader = new CDBReader(
			createChunkBuffer({ chunkSeparator: 0x87654321 }),
		);

		expect(() => reader.readChunk()).toThrowError(
			"Invalid CHUNK_SEPARATOR magic: expected 0xbbbbbbbb, got 0x87654321",
		);
	});

	it("throws when a column chunk is missing its description", () => {
		const reader = new CDBReader(createWrapperWithMissingColumnDescription());

		expect(() => reader.readChunk()).toThrowError(
			"Invalid column chunk: missing column description",
		);
	});

	it("skips an unknown chunk type instead of throwing", () => {
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const reader = new CDBReader(createUnknownChunkBuffer(8));

		const chunk = reader.readChunk();

		expect(chunk.type).toBe(0x99);
		expect(chunk.value).toBeInstanceOf(Uint8Array);
		expect((chunk.value as Uint8Array).length).toBe(8);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining("Skipping unknown chunk type: 0x99"),
		);

		warnSpy.mockRestore();
	});

	it("throws when an unknown chunk declares an impossibly small size", () => {
		const buffer = createUnknownChunkBuffer(0);
		// Shrink the declared chunkSize below what's already been consumed
		// by the header/separator, forcing a negative skip length.
		new DataView(buffer.buffer).setUint32(4, 4, true);
		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
		const reader = new CDBReader(buffer);

		expect(() => reader.readChunk()).toThrowError(
			"Invalid chunk size for unknown chunk type 0x99 at position 0",
		);

		warnSpy.mockRestore();
	});
});
