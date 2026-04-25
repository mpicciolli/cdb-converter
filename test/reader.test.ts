import { describe, expect, it } from "vitest";
import { CDBReader } from "../src/reader";
import { CHUNK_TYPE, MAGIC } from "../src/tableMetadata";

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
});
