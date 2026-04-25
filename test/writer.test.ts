import { describe, expect, it } from "vitest";
import { CHUNK_TYPE } from "../src/tableMetadata";
import { CDBWriter } from "../src/writer";

describe("CDBWriter", () => {
	it("throws when getData is called with open chunks", () => {
		const writer = new CDBWriter();

		writer.writeChunkOpen(CHUNK_TYPE.WRAPPER);

		expect(() => writer.getData()).toThrowError(
			"Cannot get CDB data with 1 open chunk",
		);
	});
});
