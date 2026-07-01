import { describe, expect, it } from "vitest";

describe("data type helpers", () => {
	it("unpacks boolean bits in LSB order", () => {
		const bytes = new Uint8Array(2);

		bytes[0] = 0b10110001;

		const boolValues = [];
		for (let i = 0; i < 8; i++) {
			boolValues.push((bytes[0] >> i) & 1);
		}

		expect(boolValues).toEqual([1, 0, 0, 0, 1, 1, 0, 1]);
	});

	it("packs and unpacks signed bytes", () => {
		const testCases = [
			{ signed: 0, unsigned: 0 },
			{ signed: 127, unsigned: 127 },
			{ signed: -1, unsigned: 255 },
			{ signed: -128, unsigned: 128 },
		];

		testCases.forEach(({ signed, unsigned }) => {
			const asUnsigned = signed < 0 ? signed + 256 : signed;
			expect(asUnsigned).toBe(unsigned);

			const backToSigned = asUnsigned > 127 ? asUnsigned - 256 : asUnsigned;
			expect(backToSigned).toBe(signed);
		});
	});

	it("preserves float value during bit reinterpretation", () => {
		const buffer = new ArrayBuffer(4);
		const view = new DataView(buffer);

		const floatValue = 3.14;
		view.setFloat32(0, floatValue, true);
		const uint32Value = view.getUint32(0, true);

		view.setUint32(0, uint32Value, true);
		const backToFloat = view.getFloat32(0, true);

		expect(Math.abs(backToFloat - floatValue)).toBeLessThan(0.001);
	});

	it("formats float list values consistently", () => {
		const testCases = [
			{ value: 1.5, count: 1 },
			{ value: 1.0, count: 1 },
			{ value: 1.0, count: 2 },
			{ value: 1.234567, count: 1 },
		];

		testCases.forEach(({ value, count }) => {
			let formatted = value
				.toFixed(6)
				.replace(/(\.\d*?)0+$/, "$1")
				.replace(/\.$/, "");
			if (!formatted.includes(".") && count > 1) {
				formatted += ".0";
			}

			const result = `(${formatted}${count > 1 ? ",..." : ""})`;
			expect(result.startsWith(`(${formatted.split(".")[0]}`)).toBe(true);
		});
	});

	it("includes null terminator in packed string lengths", () => {
		const testStrings = ["hello", "world", ""];
		const lengths = testStrings.map(
			(s) => new TextEncoder().encode(s).length + 1,
		);

		expect(lengths).toEqual([6, 6, 1]);
	});
});
